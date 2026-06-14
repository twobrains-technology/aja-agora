// FIX-14 — Status REAL da proposta pro agent (tool check_proposal_status).
//
// Regra D11 (servidor decide, modelo narra): a verdade e a tradução leiga vivem
// AQUI — o modelo recebe `userMessage` pronta e só narra. Nenhum estado, número
// ou prazo é inventado: tudo vem do `gateway.getStatus` REAL
// (consult_proposal_status_bevi_consorcio, validado na POC de 2026-06-05 —
// docs/jornada/jornada-ate-boleto.md §4).
//
// Erros (404/403/timeout) viram mensagem honesta "não consegui consultar" com
// log estruturado server-side ANTES do retorno (lição BUG-BEVI-EMPTY-ENV: erro
// de tool engolido pelo AI SDK levou horas pra diagnosticar).

import { getProposalGateway } from "@/lib/adapters";
import type { ProposalGateway, ProposalStatus } from "@/lib/adapters/proposal-gateway";
import type { LeadStage } from "@/lib/admin/lead-stages";
import { getLatestBeviProposal } from "./proposal-repo";

// ============================================================================
// Tradução leiga — máquina de estados observada na POC (sorts 0→10)
// ============================================================================

/** systemicValue → mensagem leiga PT-BR. Estados REAIS capturados na POC. */
export const STATUS_TRANSLATIONS: Record<string, string> = {
	dadosIniciais:
		"Sua proposta foi iniciada e a administradora está processando os primeiros dados.",
	consultaConsorcioBevicred: "Sua proposta está em análise inicial na administradora.",
	simulation:
		"Sua simulação está registrada — o próximo passo é completar a documentação da proposta.",
	documentoPessoal:
		"Falta enviar seu documento pessoal (RG ou CNH) pra proposta andar. Quer completar isso agora?",
	dadosDoDocumentoDeIdentidade:
		"Faltam os dados do seu documento de identidade (órgão emissor, UF e data de emissão). Quer completar isso agora?",
	endereco: "Falta completar seu endereço pra proposta andar. Quer completar isso agora?",
	comprovanteDeEndereco:
		"Falta enviar o comprovante de endereço da sua proposta. Quer completar isso agora?",
	waitingForUniqueCode:
		"Sua proposta está na fila da administradora — te aviso assim que ela entrar.",
};

/** statusName (label atual da Bevi) → systemicValue, pra quando o changesHistory
 * não traz o estado atual (vazio/malformado). Inclui o typo REAL da Bevi
 * ("Corsorcio") visto nas capturas. */
const STATUS_NAME_TO_KEY: Record<string, string> = {
	"Dados Iniciais": "dadosIniciais",
	"Espera Consulta Consórcio": "consultaConsorcioBevicred",
	"Espera Consulta Corsorcio": "consultaConsorcioBevicred",
	"Simulação Consórcio": "simulation",
	"Documento pessoal": "documentoPessoal",
	"Dados do documento de identidade": "dadosDoDocumentoDeIdentidade",
	Endereço: "endereco",
	"Comprovante de endereço": "comprovanteDeEndereco",
	"Aguardando inserção da proposta": "waitingForUniqueCode",
};

export const NO_PROPOSAL_MESSAGE =
	"Você ainda não tem uma proposta criada por aqui. Quer começar uma simulação?";

export const STATUS_ERROR_MESSAGE =
	"Não consegui consultar o andamento da sua proposta agora. Tenta de novo em instantes.";

export interface ProposalLastTransition {
	/** systemicValue do estado atual (último newState válido do history). */
	state: string;
	/** title legível do estado, quando presente. */
	label?: string;
	/** changeDate ISO da transição, quando presente. */
	at?: string;
}

export type ProposalStatusReport =
	| {
			ok: true;
			hasProposal: true;
			userMessage: string;
			statusName: string;
			situation: string;
			integrationCode: string | null;
			approvedAt: string | null;
			reprovedAt: string | null;
			lastTransition: ProposalLastTransition | null;
	  }
	| { ok: true; hasProposal: false; userMessage: string }
	| { ok: false; userMessage: string };

/** Última transição válida do changesHistory — tolerante a shape hostil
 * ([], [{}], newState sem systemicValue). A POC provou que changeDate é
 * confiável (permite "desde ontem está em X"). */
function extractLastTransition(status: ProposalStatus): ProposalLastTransition | null {
	const history = Array.isArray(status.changesHistory) ? status.changesHistory : [];
	for (let i = history.length - 1; i >= 0; i--) {
		const item = history[i];
		const sysValue = item?.newState?.systemicValue;
		if (typeof sysValue === "string" && sysValue.length > 0) {
			const at = typeof item.changeDate === "string" ? item.changeDate : undefined;
			const label = typeof item.newState?.title === "string" ? item.newState.title : undefined;
			return { state: sysValue, ...(label ? { label } : {}), ...(at ? { at } : {}) };
		}
	}
	return null;
}

/** Traduz o status técnico da Bevi pra mensagem leiga. Precedência:
 * reprovedAt > approvedAt > integrationCode > mapa(systemicValue) > fallback(statusName). */
export function translateProposalStatus(status: ProposalStatus): {
	userMessage: string;
	lastTransition: ProposalLastTransition | null;
} {
	const lastTransition = extractLastTransition(status);

	if (status.reprovedAt) {
		return {
			userMessage:
				"Sua proposta não foi aprovada pela administradora. Posso te explicar os próximos passos.",
			lastTransition,
		};
	}
	if (status.approvedAt) {
		return {
			userMessage: "Boa notícia: sua proposta foi aprovada pela administradora!",
			lastTransition,
		};
	}
	if (status.integrationCode) {
		return {
			userMessage: `Sua proposta entrou na administradora (nº ${status.integrationCode}). Agora é acompanhar a análise — te aviso de novidades.`,
			lastTransition,
		};
	}

	const key = lastTransition?.state ?? STATUS_NAME_TO_KEY[status.statusName];
	const mapped = key ? STATUS_TRANSLATIONS[key] : undefined;
	if (mapped) {
		return { userMessage: mapped, lastTransition };
	}

	// Estado novo/desconhecido da Bevi: repassa o label real com honestidade —
	// PROIBIDO inventar significado (regra do FIX-14).
	return {
		userMessage: `O andamento atual da sua proposta na administradora é: ${status.statusName}.`,
		lastTransition,
	};
}

// ============================================================================
// FIX-44 — máquina de estados do DESFECHO (status da administradora → raia)
// ============================================================================

/**
 * Mapa do DESFECHO fornecido pelo Kairo (2026-06-14): cada systemicValue da fase
 * pós-`waitingForUniqueCode` (movida pela MESA, timing da Conexia) → raia do funil.
 * Detectado por POLLING (não há webhook). Estados de documentação pré-mesa não
 * entram aqui — já estão em `proposta_enviada` (setado por createBeviProposal).
 */
export const PROPOSAL_STATUS_TO_STAGE: Record<string, LeadStage> = {
	approveWaitingForUniqueCode: "na_administradora", // "Inserir proposta"
	aguard_pag_cliente: "aguardando_pagamento", // "Aguardando Pagto Cliente"
	prop_efetivada: "fechado_ganho", // "Proposta Efetivada" (comissão)
	approved: "fechado_ganho", // "Aprovada"
	repproved: "perdido", // "Reprovado"
};

/**
 * Raia resultante do status REAL da proposta, ou `null` se o estado atual não
 * move o funil. Precedência (terminais primeiro):
 *   reprovado > aprovado/efetivado > aguardando pagto > na administradora.
 * Função PURA (Camada 1). O worker (FIX-44) aplica com forward-only.
 */
export function stageForProposalStatus(status: ProposalStatus): LeadStage | null {
	if (status.reprovedAt) return "perdido";
	if (status.approvedAt) return "fechado_ganho";
	const sysValue = extractLastTransition(status)?.state;
	if (sysValue && PROPOSAL_STATUS_TO_STAGE[sysValue]) {
		return PROPOSAL_STATUS_TO_STAGE[sysValue];
	}
	// integrationCode presente = proposta já inserida na administradora (mesa),
	// mesmo que o systemicValue corrente não esteja no mapa.
	if (status.integrationCode) return "na_administradora";
	return null;
}

// ============================================================================
// Orquestração — proposalId da CONVERSA (nunca do modelo) → consulta REAL
// ============================================================================

export interface CheckProposalStatusDeps {
	getProposalImpl?: typeof getLatestBeviProposal;
	gateway?: ProposalGateway;
}

/** Consulta o status REAL da proposta da conversa. proposalId resolve via
 * getLatestBeviProposal(conversationId) — o modelo não participa (anti-
 * hallucination, mesmo racional do BUG-CONVERSATION-ID-HALLUCINATION). */
export async function checkProposalStatus(
	conversationId: string,
	deps: CheckProposalStatusDeps = {},
): Promise<ProposalStatusReport> {
	const getProposalImpl = deps.getProposalImpl ?? getLatestBeviProposal;
	try {
		const row = await getProposalImpl(conversationId);
		if (!row) {
			return { ok: true, hasProposal: false, userMessage: NO_PROPOSAL_MESSAGE };
		}
		const gateway = deps.gateway ?? getProposalGateway();
		const status = await gateway.getStatus(row.proposalId);
		const { userMessage, lastTransition } = translateProposalStatus(status);
		return {
			ok: true,
			hasProposal: true,
			userMessage,
			statusName: status.statusName,
			situation: status.situation,
			integrationCode: status.integrationCode,
			approvedAt: status.approvedAt,
			reprovedAt: status.reprovedAt,
			lastTransition,
		};
	} catch (err) {
		// Log estruturado ANTES do retorno — o AI SDK não deixa rastro de erro
		// de tool no servidor (BUG-BEVI-EMPTY-ENV).
		console.error(
			JSON.stringify({
				level: "error",
				source: "proposal-status",
				tool: "check_proposal_status",
				conversation_id: conversationId,
				error_name: err instanceof Error ? err.name : "unknown",
				error_message: err instanceof Error ? err.message : String(err),
			}),
		);
		// Mensagem honesta — NUNCA estado inventado, NUNCA detalhe técnico/credencial.
		return { ok: false, userMessage: STATUS_ERROR_MESSAGE };
	}
}

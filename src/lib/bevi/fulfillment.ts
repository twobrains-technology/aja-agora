// Orquestrador do FECHAMENTO Bevi (passo 5 "Contratar" da jornada.docx).
//
// Costura: form CPF/celular/LGPD → cria proposta real → simula com os params do
// usuário → escolhe a oferta mais próxima do que ele viu na Descoberta → apresenta
// a OFERTA REAL pra confirmar → choose_offer (PDF da proposta, ver DES-1) → links
// de documento (upload no chat). Persiste o estado em `bevi_proposals` pra retomar.
//
// Usa o ProposalGateway — em runtime SEMPRE o BeviApiAdapter real (exige
// BEVI_API_TOKEN, falha alto sem). Mock em runtime é PROIBIDO; os testes injetam
// um dublê via __setProposalGatewayForTests. NÃO tem UI aqui — só a lógica; o
// route/whatsapp renderizam os artifacts.

import { getProposalGateway } from "../adapters";
import {
	normalizeAdmin,
	partnerOfferToRealOffer,
	pickClosestOffer,
	type RealOffer,
} from "../adapters/bevi/partner-offer-mapper";
import type {
	DocumentSlot,
	LanceEmbutido,
	ProposalGateway,
	ProposalObjetivo,
	SimulationType,
} from "../adapters/proposal-gateway";
import { ehIdentidadeDeVitrine } from "./identidade-vitrine";
import {
	createBeviProposal,
	getLatestBeviProposal,
	isOfferFresh,
	updateBeviProposal,
} from "./proposal-repo";

export interface StartContractInput {
	cpf: string;
	celular: string;
	lgpd: boolean;
	segmento: string;
	objetivo: ProposalObjetivo;
	/** Crédito (ou parcela) desejado — o que o usuário viu na Descoberta. */
	valor: number;
	/** FIX-281 (r9 onda 2, gap G-A): o pedido ORIGINAL do cliente (mesma âncora do
	 * hero, `creditClampedFrom ?? creditMax` — FIX-261), independente de `valor`
	 * acima (que é o creditValue da ÚLTIMA oferta vista, só pro matching — FIX-73).
	 * Fonte do `rawCreditValue` (aviso de divergência CDC) no `real_offer`.
	 * Ausente (caminho legado) → `startContract` cai pro `valor` antigo. */
	originalRequestedCreditValue?: number;
	tipoSimulacao?: SimulationType;
	lanceEmbutido?: LanceEmbutido;
	leadId?: string | null;
	/** A marca que o cliente VIU na tela — só pra detectar divergência e AVISAR.
	 *
	 * FIX-417 — nunca entra no matching; é campo de OBSERVABILIDADE. Existe porque
	 * o FIX-414 fez `administradoraPreferida` virar `null` no caminho sem clique
	 * (correto: texto não vincula dinheiro) e, de quebra, emudeceu o aviso do
	 * FIX-259 — que exigia a preferência preenchida pra comparar. Resultado medido
	 * pela 12ª revisão independente: o gateway escolhia por proximidade de valor e
	 * o cliente não era avisado de nada.
	 *
	 * Tirar o VÍNCULO era o objetivo; tirar o AVISO foi dano colateral. Os dois
	 * campos existem justamente porque são coisas diferentes: um compromete, o
	 * outro só conta o que aconteceu. */
	administradoraExibida?: string | null;
	/** Administradora recomendada na Descoberta — o fechamento prefere a MESMA
	 * marca que o usuário decidiu (BUG-ADMIN-TROCADA-NO-FECHAMENTO). */
	administradoraPreferida?: string | null;
	/** Prazo (meses) da oferta que o usuário viu na Descoberta. Desempata o
	 * matching dentro da admin preferida pra o fechamento não trocar por outro
	 * prazo (matching preparatório 2026-06-28). Vem de meta.recommendedOffer. */
	prazoPreferido?: number | null;
}

export interface StartContractResult {
	proposalId: string;
	offer: RealOffer | null;
	/** Quando a simulação não devolve oferta (ex.: valor abaixo do mínimo). */
	noOffer?: boolean;
	/** FIX-240 (CDC art. 30): o valor PEDIDO pelo cliente — fonte do
	 * `rawCreditValue` que aciona o aviso de ajuste (FIX-197) quando a carta
	 * fechada (`offer.creditValue`) diverge dele. FIX-281: vem de
	 * `input.originalRequestedCreditValue` (o pedido ORIGINAL, mesma âncora do
	 * hero), com fallback pro `input.valor` antigo quando ausente. */
	requestedCreditValue?: number;
	/** FIX-259 (P1, veredito Fable r4): a administradora confirmada
	 * (`input.administradoraPreferida`) não tinha grupo disponível na faixa e o
	 * fechamento trocou pra mais próxima (clamp/fallback de `pickClosestOffer`) —
	 * aciona o aviso explícito de troca (nunca em silêncio). */
	administradoraChanged?: boolean;
	/** Administradora que o usuário havia confirmado — só presente quando
	 * `administradoraChanged` é true. */
	previousAdministradora?: string | null;
}

/**
 * O fechamento recebeu o CPF da CASA (a identidade de vitrine, que existe só
 * para montar a prateleira de ofertas antes de o cliente se identificar).
 *
 * Nenhum caminho legítimo produz isto: o form de contratação lê a identidade
 * REAL do cliente (`loadIdentity`), e a vitrine nunca é gravada como identidade
 * da conversa. Se chegou aqui, alguma coisa costurou errado — e o custo de
 * deixar passar é um contrato aberto na administradora em nome da pessoa
 * errada, com o RG e o comprovante do cliente anexados nele.
 */
export class ContratacaoComIdentidadeDeVitrineError extends Error {
	constructor() {
		super(
			"Fechamento recusado: o CPF recebido é o da vitrine (identidade da casa, " +
				"usada só para buscar ofertas). Contrato exige a identidade real do cliente.",
		);
		this.name = "ContratacaoComIdentidadeDeVitrineError";
	}
}

/** Passo 5.1 — cria a proposta real e já simula, devolvendo a oferta a confirmar. */
export async function startContract(
	conversationId: string,
	input: StartContractInput,
	gateway: ProposalGateway = getProposalGateway(),
): Promise<StartContractResult> {
	// A vitrine mostra; ela não assina. Barrar ANTES de qualquer chamada à
	// administradora é o ponto: `createProposal` consome o slot único da loja e
	// dispara consulta de bureau — um erro lançado depois já teria custado os
	// dois. Ver `identidade-vitrine.ts` para por que a vitrine existe.
	if (ehIdentidadeDeVitrine(input.cpf)) {
		throw new ContratacaoComIdentidadeDeVitrineError();
	}

	// EC-7 (QA crítico 2026-06-02): idempotência por conversa. Duplo-clique em
	// "Continuar com segurança" (ou re-submit) criava 2 propostas na administradora.
	// Se já existe uma proposta PENDENTE (status 'simulacao', ainda não confirmada)
	// nesta conversa, reusamos o mesmo proposalId — só re-simulamos e atualizamos.
	// Depois de confirmada (status avança pra 'documentos'), um novo contract cria
	// proposta nova normalmente.
	const existing = await getLatestBeviProposal(conversationId);
	const reusing = existing != null && existing.proposalStatus === "simulacao";

	let proposalId: string;
	if (reusing) {
		proposalId = existing.proposalId;
	} else {
		({ proposalId } = await gateway.createProposal({
			cpf: input.cpf,
			celular: input.celular,
			termoLgpd: input.lgpd,
			consultaDados: input.lgpd,
			// Já passamos pelo gate de consentimento no chat; se houver proposta antiga
			// do CPF, seguimos com uma nova (o produto não expõe "retomar" ainda).
			ignoreOngoingProposals: true,
		}));
	}

	const sim = await gateway.simulate({
		proposalId,
		segmento: input.segmento,
		tipoSimulacao: input.tipoSimulacao ?? "valor_total",
		valor: input.valor,
		objetivo: input.objetivo,
		lanceEmbutido: input.lanceEmbutido ?? "nenhum",
	});

	const chosen = pickClosestOffer(
		sim.offers,
		input.valor,
		input.administradoraPreferida,
		input.prazoPreferido,
	);
	const offer = chosen ? partnerOfferToRealOffer(chosen, input.segmento) : null;

	// FIX-259: a administradora fechada pode divergir da confirmada (catálogo do
	// fechamento sem ela na faixa → pickClosestOffer cai pro global best). Detecta
	// pela comparação final (normalizada) — cobre QUALQUER caminho que produziu a
	// divergência, sem duplicar a lógica interna do clamp.
	// FIX-417 — compara contra o que o cliente VIU, e só cai na preferência quando
	// não há tela a citar. Antes exigia `administradoraPreferida`, e com ela nula
	// (jornada sem clique, o caso comum pós-FIX-414) o aviso simplesmente não saía:
	// a marca mudava em silêncio.
	const marcaNaTela = input.administradoraExibida ?? input.administradoraPreferida;
	const administradoraChanged =
		!!marcaNaTela &&
		!!offer &&
		normalizeAdmin(offer.administradora) !== normalizeAdmin(marcaNaTela);

	const snapshot = {
		proposalId,
		simulationSessionId: sim.simulationSessionId,
		ofertaId: chosen?.ofertaId ?? null,
		offerExpiresAt: sim.expiresAt ? new Date(sim.expiresAt) : null,
		segmento: input.segmento,
		administradora: offer?.administradora ?? null,
		grupo: offer?.grupo ?? null,
		creditValue: offer?.creditValue ?? null,
		monthlyPayment: offer?.monthlyPayment ?? null,
		// FIX-39: prazo REAL da API nova (null quando a API não o trouxe).
		termMonths: offer?.termMonths ?? null,
		proposalStatus: "simulacao",
	};

	if (reusing) {
		await updateBeviProposal(existing.id, snapshot);
	} else {
		await createBeviProposal(conversationId, snapshot, input.leadId);
	}

	return {
		proposalId,
		offer,
		noOffer: !chosen,
		requestedCreditValue: input.originalRequestedCreditValue ?? input.valor,
		administradoraChanged,
		// FIX-418 — a marca ANTERIOR é a que estava na TELA, não a preferência.
		//
		// O FIX-417 trocou a fonte de `administradoraChanged` pra `marcaNaTela` e
		// esqueceu esta linha: `administradoraPreferida` é nula justamente na jornada
		// sem clique — o caso que aquele commit dizia estar corrigindo. Os dois
		// consumidores (`closing-presentation.ts`, `contract-capture.ts`) exigem valor
		// truthy, então o aviso seguia MUDO e o cliente lia "Confirmei com a ITAÚ"
		// com RODOBENS na tela. A 13ª revisão provou que era vácuo: revertendo o
		// FIX-417, ZERO testes falhavam.
		// FIX-419 — REVERTIDO, e isto é correção, não recuo.
		//
		// O FIX-418 fez este campo vir de `marcaNaTela` pro aviso "parar de emudecer".
		// A 14ª revisão rodou até a TELA e mostrou o que o cliente passou a ler:
		// "A RODOBENS não tem grupo disponível nessa faixa agora" — com a RODOBENS
		// TENDO grupo na faixa. A causalidade que a copy afirma nunca foi estabelecida
		// pelo código: sem `administradoraPreferida`, o gateway não PROCUROU a
		// RODOBENS; ele caiu em `best(offers)` por proximidade de valor.
		//
		// Trocar silêncio por afirmação falsa sobre o catálogo de uma administradora,
		// num contrato de consórcio, não é upgrade. O aviso volta a falar só quando
		// houve preferência de verdade — aí a frase é verdadeira. Fazer o aviso contar
		// o que REALMENTE aconteceu ("a busca trouxe a mais próxima do valor") é
		// mudança de COPY, e copy é decisão do Kairo.
		previousAdministradora: administradoraChanged ? input.administradoraPreferida : null,
	};
}

export interface ConfirmOfferResult {
	proposalId: string;
	administradora: string | null;
	consortiumProposalLink: string;
	documentsLinkPersonal: string;
	documentsLinkAddress: string;
	/** Trilho B (self-contract): nº gerado pela administradora após o finalize
	 * (inserção assíncrona). undefined no Trilho A (chooseOffer já basta) ou se
	 * a inserção do self-contract ainda não resolveu (D11 — nunca chutado). Ver
	 * docs/correcoes/decisions/2026-06-28-bloco-c-fechamento-trilho-b.md D3/D4. */
	proposalNumber?: number;
}

/** Passo 5.2 — usuário confirmou a oferta real: escolhe + gera link de assinatura
 * e links de documento. Re-simula transparente se o ofertaId expirou (TTL 30min). */
export async function confirmOffer(
	conversationId: string,
	gateway: ProposalGateway = getProposalGateway(),
): Promise<ConfirmOfferResult> {
	const row = await getLatestBeviProposal(conversationId);
	if (!row) throw new Error("Nenhuma proposta em andamento nesta conversa.");

	let ofertaId = row.ofertaId;
	// TTL expirou → re-simular pra obter um ofertaId válido (spec §4.4/§15).
	if (!ofertaId || !isOfferFresh(row)) {
		const sim = await gateway.simulate({
			proposalId: row.proposalId,
			segmento: row.segmento ?? "AUTOS",
			tipoSimulacao: "valor_total",
			valor: Number(row.creditValue ?? 0) || 0,
			objetivo: "contemplacao_rapida",
		});
		// Re-sim por TTL mantém a MESMA marca E o MESMO prazo que o usuário confirmou.
		const fresh = pickClosestOffer(
			sim.offers,
			Number(row.creditValue ?? 0),
			row.administradora,
			Number(row.termMonths) || null,
		);
		ofertaId = fresh?.ofertaId ?? ofertaId;
		await updateBeviProposal(row.id, {
			simulationSessionId: sim.simulationSessionId,
			ofertaId,
			offerExpiresAt: sim.expiresAt ? new Date(sim.expiresAt) : null,
		});
	}
	if (!ofertaId) throw new Error("Sem oferta válida pra escolher — re-simule.");

	const choose = await gateway.chooseOffer({ proposalId: row.proposalId, ofertaId });
	const links = await gateway.getDocumentLinks(row.proposalId);
	// D3 — passo extra que só o Trilho B tem (inserção assíncrona na
	// administradora). Opcional/duck-typed: o Trilho A não implementa
	// `finalize`, então `gateway.finalize?.()` é um no-op transparente pra ele.
	const finalized = await gateway.finalize?.(row.proposalId);

	await updateBeviProposal(row.id, {
		consortiumProposalLink: choose.consortiumProposalLink,
		documentsLinkPersonal: links.linkDocumentosPessoais,
		documentsLinkAddress: links.linkComprovanteEndereco,
		proposalStatus: "documentos",
	});

	return {
		proposalId: row.proposalId,
		administradora: row.administradora,
		consortiumProposalLink: choose.consortiumProposalLink,
		documentsLinkPersonal: links.linkDocumentosPessoais,
		documentsLinkAddress: links.linkComprovanteEndereco,
		proposalNumber: finalized?.proposalNumber,
	};
}

export interface UploadContractDocInput {
	slot: DocumentSlot;
	file: Uint8Array | Buffer;
	filename: string;
	mimeType: string;
}

/** Passo 5.3 — upload do documento direto no chat (sem redirect). É AQUI que a
 * ficha termina. Cai pro link se o upload automatizado falhar (docs são opcionais). */
export async function uploadContractDocument(
	conversationId: string,
	input: UploadContractDocInput,
	gateway: ProposalGateway = getProposalGateway(),
): Promise<{ ok: boolean; fallbackLink?: string }> {
	const row = await getLatestBeviProposal(conversationId);
	// proposalStatus só vira "documentos" dentro de confirmOffer — é o sinal de
	// "oferta confirmada", independente de trilho (FIX-112: sem isso, dava pra
	// subir documento com a proposta ainda em "simulacao").
	if (!row || row.proposalStatus !== "documentos")
		throw new Error("Sem oferta confirmada — finalize a escolha da oferta antes.");
	// D2 — Trilho B (self-contract) não produz link (fecha inline, sem
	// uselink.me): documentsLink fica "" e o gateway ignora/delega ao despacho
	// desacoplado (bloco-a). O Trilho A sempre tem link truthy aqui (comportamento
	// inalterado).
	const link =
		(input.slot === "comprovante_endereco"
			? row.documentsLinkAddress
			: row.documentsLinkPersonal) ?? "";

	try {
		await gateway.uploadDocument({
			proposalId: row.proposalId,
			documentsLink: link,
			slot: input.slot,
			file: input.file,
			filename: input.filename,
			mimeType: input.mimeType,
		});
		return { ok: true };
	} catch {
		// upload automatizado falhou (anti-bot/drift) → devolve o link como fallback
		return { ok: false, fallbackLink: link };
	}
}

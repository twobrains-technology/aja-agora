// Mesa de operação — outbound do dossiê do caso pro WhatsApp do atendente (FIX-65).
// Spec: docs/visao/mesa-de-operacao.md §4-5 + §8 (minimização de PII).
// Decisões: docs/decisoes/blocos/2026-06-21-bloco-mesa-b.md §1-2.

import { sendReplyButtons, sendTextMessage } from "@/lib/whatsapp/api";
import { CLAIM_BUTTON_ID_PREFIX, CLAIM_BUTTON_TITLE } from "./claim";
import { getMesaAttendantList } from "./routing";

// Re-export do contrato do botão "Vou atender" (definido em ./claim) pra ergonomia dos
// callers do broadcast. Fonte única do prefixo/título é ./claim (evita ciclo de import).
export { CLAIM_BUTTON_ID_PREFIX, CLAIM_BUTTON_TITLE } from "./claim";

// Projeção do caso que VAI pro WhatsApp do atendente. Whitelist deliberada — só o
// necessário pra contratar. NÃO tem campo `cpf` por construção (§8 LGPD): dados
// sensíveis ficam no painel, não trafegam no canal externo.
export interface MesaCaseDossier {
	attendantWhatsapp: string;
	attendantNome: string;
	clienteNome: string | null;
	clienteContato: string | null;
	segmento: string | null;
	administradora: string | null;
	grupo: string | null;
	creditValue: string | null;
	monthlyPayment: string | null;
	termMonths: number | null;
	proposalLink: string | null;
}

// Fonte do dossiê — as entidades carregadas no transbordo. Tipado pelos campos lidos
// (não pelas rows completas) pra desacoplar e facilitar teste.
export interface DossierSource {
	attendant: { nome: string; whatsapp: string };
	lead: { name: string | null; phone: string | null };
	proposal: {
		segmento: string | null;
		administradora: string | null;
		grupo: string | null;
		creditValue: string | null;
		monthlyPayment: string | null;
		termMonths: number | null;
		consortiumProposalLink: string | null;
	} | null;
}

/**
 * Mapeia as entidades do caso pro DTO de dossiê. Lê SÓ a whitelist — nunca o CPF
 * (que nem é carregado no transbordo) nem e-mail/documentos.
 */
export function toDossier(src: DossierSource): MesaCaseDossier {
	const { attendant, lead, proposal } = src;
	return {
		attendantWhatsapp: attendant.whatsapp,
		attendantNome: attendant.nome,
		clienteNome: lead.name,
		clienteContato: lead.phone,
		segmento: proposal?.segmento ?? null,
		administradora: proposal?.administradora ?? null,
		grupo: proposal?.grupo ?? null,
		creditValue: proposal?.creditValue ?? null,
		monthlyPayment: proposal?.monthlyPayment ?? null,
		termMonths: proposal?.termMonths ?? null,
		proposalLink: proposal?.consortiumProposalLink ?? null,
	};
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatBRL(value: string | null): string | null {
	if (!value) return null;
	const n = Number(value);
	return Number.isFinite(n) ? BRL.format(n) : null;
}

/**
 * Monta a mensagem de texto do dossiê pro WhatsApp do atendente. Texto plano (WhatsApp
 * não renderiza markdown), campos ausentes são omitidos (nunca "null"/"undefined").
 */
export function buildDossierMessage(d: MesaCaseDossier): string {
	const lines: string[] = ["🤝 Novo caso na mesa — Aja Agora", ""];

	lines.push(`Cliente: ${d.clienteNome ?? "—"}`);
	if (d.clienteContato) lines.push(`Contato: ${d.clienteContato}`);
	lines.push("");

	const hasCota =
		d.segmento || d.administradora || d.grupo || d.creditValue || d.monthlyPayment || d.termMonths;
	if (hasCota) {
		lines.push("Cota escolhida:");
		if (d.segmento) lines.push(`• Segmento: ${d.segmento}`);
		if (d.administradora) lines.push(`• Administradora: ${d.administradora}`);
		if (d.grupo) lines.push(`• Grupo: ${d.grupo}`);
		const credito = formatBRL(d.creditValue);
		if (credito) lines.push(`• Crédito: ${credito}`);
		const parcela = formatBRL(d.monthlyPayment);
		if (parcela) lines.push(`• Parcela: ${parcela}`);
		if (d.termMonths) lines.push(`• Prazo: ${d.termMonths} meses`);
	} else {
		lines.push("Cota ainda não definida.");
	}

	if (d.proposalLink) {
		lines.push("", `Proposta Bevi: ${d.proposalLink}`);
	}

	lines.push("", "Dados sensíveis (CPF, documentos) ficam no painel — não trafegam aqui.");
	return lines.join("\n");
}

/**
 * Envia o dossiê do caso pro WhatsApp do atendente de mesa. Best-effort: devolve o
 * resultado de sendTextMessage (messageId | error) — a rota decide como sinalizar.
 *
 * TODO(bloco-c): persistir a 1ª mensagem do copiloto em mesa_copilot_messages
 * (role='assistant') e disparar a orientação passo-a-passo com o PDF da administradora
 * injetado. Aqui só vai o dossiê do caso.
 */
export async function sendCaseToAttendant(dossier: MesaCaseDossier) {
	const text = buildDossierMessage(dossier);
	return sendTextMessage(dossier.attendantWhatsapp, text);
}

// Fonte do dossiê no BROADCAST (sem atendente específico — o caso é o mesmo pra todos).
export interface MesaBroadcastSource {
	lead: { name: string | null; phone: string | null };
	proposal: DossierSource["proposal"];
}

/**
 * BROADCAST do transbordo (FIX-124, D15): envia o dossiê do caso a TODOS os atendentes de
 * mesa ativos, cada um com um botão interativo "Vou atender". O id do botão carrega o
 * `handoffId` (`mesa_claim:<handoffId>`) — o 1º atendente que clica ASSUME via claim
 * atômico (FIX-125). Espelha o `handoffToAgents` do chat de vendas (proxy.ts): notifica
 * todos, primeiro a responder fica com o caso.
 *
 * Best-effort POR destinatário: falha de um envio (WhatsApp fora, número inválido) NÃO
 * derruba os demais — o handoff já está registrado (fonte de verdade). Retorna a contagem.
 */
export async function broadcastCaseToAttendants(
	handoffId: string,
	source: MesaBroadcastSource,
): Promise<{ sent: number; failed: number }> {
	const attendants = await getMesaAttendantList();
	// Corpo do dossiê é atendente-agnóstico (buildDossierMessage não usa os campos do
	// atendente) — monta uma vez e reusa pra todos.
	const body = buildDossierMessage(
		toDossier({ attendant: { nome: "", whatsapp: "" }, lead: source.lead, proposal: source.proposal }),
	);
	const buttons = [{ id: `${CLAIM_BUTTON_ID_PREFIX}${handoffId}`, title: CLAIM_BUTTON_TITLE }];

	let sent = 0;
	let failed = 0;
	for (const attendant of attendants) {
		try {
			const res = await sendReplyButtons(attendant.whatsapp, body, buttons);
			if ("error" in res && res.error) failed += 1;
			else sent += 1;
		} catch {
			failed += 1;
		}
	}
	return { sent, failed };
}

// Mesa de operação — outbound do dossiê do caso pro WhatsApp do atendente (FIX-65).
// Spec: docs/visao/mesa-de-operacao.md §4-5 + §8 (minimização de PII).
// Decisões: docs/decisoes/blocos/2026-06-21-bloco-mesa-b.md §1-2.

import { sendTextMessage } from "@/lib/whatsapp/api";

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

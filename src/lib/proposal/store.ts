// Geração + armazenamento da proposta em PDF (fechamento). Chamado best-effort
// no `offer-confirm`: nunca derruba o fecho se falhar. A chave no S3 é
// DETERMINÍSTICA (proposals/<conversationId>/<proposalId>.pdf) — o back office
// reconstrói a chave a partir da linha `beviProposals` (sem coluna nova/migration)
// e valida existência antes de assinar o download.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals, conversations } from "@/db/schema";
import { beviSegmentToCategory } from "@/lib/adapters/bevi/offer-mapper";
import type { ConsorcioCategory } from "@/lib/adapters/types";
import { compareWithFinancing } from "@/lib/finance/pmt";
import { getLatestBeviProposal } from "@/lib/bevi/proposal-repo";
import {
	getClientDocsStorageConfig,
	getSignedDownloadUrl,
	objectExists,
	putObject,
} from "@/lib/storage";
import { type ProposalPdfData, renderProposalPdf } from "./proposal-pdf";

const CATEGORY_LABEL: Record<ConsorcioCategory, string> = {
	imovel: "IMÓVEL",
	auto: "AUTOS",
	moto: "MOTOS",
	servicos: "SERVIÇOS",
};

/** Chave S3 determinística da proposta. Uma por proposalId (regenerar sobrescreve). */
export function proposalPdfKey(conversationId: string, proposalId: string): string {
	return `proposals/${conversationId}/${proposalId}.pdf`;
}

function num(v: string | number | null | undefined): number | null {
	if (v == null) return null;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}

/**
 * Gera o PDF da proposta a partir do snapshot já persistido (beviProposals) e
 * sobe ao bucket de documentos de cliente. Idempotente (mesma chave). Retorna a
 * chave S3 ou null se não há proposta/dado mínimo. NÃO lança — o chamador é
 * best-effort (o fecho não pode quebrar por causa do PDF).
 */
export async function generateAndStoreProposalPdf(
	conversationId: string,
): Promise<{ key: string } | null> {
	const row = await getLatestBeviProposal(conversationId);
	if (!row || !row.proposalId) return null;

	const creditValue = num(row.creditValue);
	if (creditValue == null) return null; // sem carta não há proposta a documentar

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		columns: { contactName: true },
	});

	const monthlyPayment = num(row.monthlyPayment);
	const termMonths = num(row.termMonths);
	const avgBid = null; // lance médio não é persistido no snapshot atual (omite — D11)
	const category: ConsorcioCategory | null = row.segmento
		? beviSegmentToCategory(row.segmento)
		: null;

	// Comparativo/economia só com parcela + prazo + categoria reais (premissa exibida).
	let financing: ProposalPdfData["financing"] = null;
	let economiaTotal: number | null = null;
	let economiaMensal: number | null = null;
	if (monthlyPayment != null && termMonths != null && category) {
		const cmp = compareWithFinancing({
			creditValue,
			termMonths,
			category,
			consorcioMonthlyPayment: monthlyPayment,
			consorcioTotalCost: monthlyPayment * termMonths,
		});
		financing = {
			consorcioMonthly: cmp.consorcio.monthlyPayment,
			financingMonthly: cmp.financing.monthlyPayment,
			disclaimer: cmp.disclaimer,
		};
		if (cmp.diff.totalDelta < 0) economiaTotal = -cmp.diff.totalDelta;
		if (cmp.diff.monthlyDelta < 0) economiaMensal = -cmp.diff.monthlyDelta;
	}

	const data: ProposalPdfData = {
		clientName: conv?.contactName ?? undefined,
		administradora: row.administradora ?? "administradora",
		grupo: row.grupo ?? "—",
		categoryLabel: category ? CATEGORY_LABEL[category] : "CONSÓRCIO",
		creditValue,
		monthlyPayment,
		termMonths,
		avgBidValue: avgBid,
		generatedAt: new Date().toLocaleDateString("pt-BR", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
		}),
		economiaTotal,
		economiaMensal,
		financing,
	};

	const buffer = await renderProposalPdf(data);
	const key = proposalPdfKey(conversationId, row.proposalId);
	await putObject(key, new Uint8Array(buffer), "application/pdf", getClientDocsStorageConfig());
	return { key };
}

/**
 * Resolve a URL de download (pré-assinada, curta) da proposta de UMA linha
 * `beviProposals` (id da tabela). Só devolve URL se o objeto EXISTE no S3
 * (geração é best-effort). null → não há PDF pra essa proposta.
 */
export async function getProposalPdfDownloadUrl(beviProposalId: string): Promise<string | null> {
	const row = await db.query.beviProposals.findFirst({
		where: eq(beviProposals.id, beviProposalId),
		columns: { conversationId: true, proposalId: true },
	});
	if (!row?.proposalId) return null;
	const key = proposalPdfKey(row.conversationId, row.proposalId);
	const cfg = getClientDocsStorageConfig();
	if (!(await objectExists(key, cfg))) return null;
	return getSignedDownloadUrl(key, cfg);
}

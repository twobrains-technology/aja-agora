// Persistência do estado de FECHAMENTO Bevi (passo 5). Guarda só o necessário pra
// retomar a proposta entre turnos (web↔WhatsApp) e pro back office acompanhar.
// LGPD-mínimo: nada de CPF — só IDs Bevi + snapshot da oferta. Ver schema
// `beviProposals` (drizzle/0022_bevi_fulfillment.sql).

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals } from "@/db/schema";

export interface BeviProposalSnapshot {
	proposalId: string;
	simulationSessionId?: string | null;
	ofertaId?: string | null;
	offerExpiresAt?: Date | null;
	segmento?: string | null;
	administradora?: string | null;
	grupo?: string | null;
	creditValue?: number | null;
	monthlyPayment?: number | null;
	consortiumProposalLink?: string | null;
	documentsLinkPersonal?: string | null;
	documentsLinkAddress?: string | null;
	proposalStatus?: string | null;
}

type Row = typeof beviProposals.$inferSelect;

function toNumericString(n: number | null | undefined): string | null {
	return n == null ? null : String(n);
}

/** Cria a proposta persistida (logo após createProposal na API). */
export async function createBeviProposal(
	conversationId: string,
	snapshot: BeviProposalSnapshot,
	leadId?: string | null,
): Promise<Row> {
	const [row] = await db
		.insert(beviProposals)
		.values({
			conversationId,
			leadId: leadId ?? null,
			proposalId: snapshot.proposalId,
			simulationSessionId: snapshot.simulationSessionId ?? null,
			ofertaId: snapshot.ofertaId ?? null,
			offerExpiresAt: snapshot.offerExpiresAt ?? null,
			segmento: snapshot.segmento ?? null,
			administradora: snapshot.administradora ?? null,
			grupo: snapshot.grupo ?? null,
			creditValue: toNumericString(snapshot.creditValue),
			monthlyPayment: toNumericString(snapshot.monthlyPayment),
			consortiumProposalLink: snapshot.consortiumProposalLink ?? null,
			documentsLinkPersonal: snapshot.documentsLinkPersonal ?? null,
			documentsLinkAddress: snapshot.documentsLinkAddress ?? null,
			proposalStatus: snapshot.proposalStatus ?? null,
		})
		.returning();
	return row;
}

/** Atualiza o estado da proposta mais recente da conversa (re-simular, escolher,
 * docs, status). Patch parcial — só os campos passados. */
export async function updateBeviProposal(
	id: string,
	patch: Partial<BeviProposalSnapshot>,
): Promise<void> {
	await db
		.update(beviProposals)
		.set({
			...(patch.simulationSessionId !== undefined
				? { simulationSessionId: patch.simulationSessionId }
				: {}),
			...(patch.ofertaId !== undefined ? { ofertaId: patch.ofertaId } : {}),
			...(patch.offerExpiresAt !== undefined ? { offerExpiresAt: patch.offerExpiresAt } : {}),
			...(patch.segmento !== undefined ? { segmento: patch.segmento } : {}),
			...(patch.administradora !== undefined ? { administradora: patch.administradora } : {}),
			...(patch.grupo !== undefined ? { grupo: patch.grupo } : {}),
			...(patch.creditValue !== undefined
				? { creditValue: toNumericString(patch.creditValue) }
				: {}),
			...(patch.monthlyPayment !== undefined
				? { monthlyPayment: toNumericString(patch.monthlyPayment) }
				: {}),
			...(patch.consortiumProposalLink !== undefined
				? { consortiumProposalLink: patch.consortiumProposalLink }
				: {}),
			...(patch.documentsLinkPersonal !== undefined
				? { documentsLinkPersonal: patch.documentsLinkPersonal }
				: {}),
			...(patch.documentsLinkAddress !== undefined
				? { documentsLinkAddress: patch.documentsLinkAddress }
				: {}),
			...(patch.proposalStatus !== undefined ? { proposalStatus: patch.proposalStatus } : {}),
			updatedAt: new Date(),
		})
		.where(eq(beviProposals.id, id));
}

/** Proposta mais recente da conversa (pra retomar o fechamento). */
export async function getLatestBeviProposal(conversationId: string): Promise<Row | null> {
	const [row] = await db
		.select()
		.from(beviProposals)
		.where(eq(beviProposals.conversationId, conversationId))
		.orderBy(desc(beviProposals.createdAt))
		.limit(1);
	return row ?? null;
}

/** TTL: o ofertaId da proposta ainda é válido? (30min). */
export function isOfferFresh(row: Pick<Row, "offerExpiresAt">, now = new Date()): boolean {
	return !!row.offerExpiresAt && row.offerExpiresAt.getTime() > now.getTime();
}

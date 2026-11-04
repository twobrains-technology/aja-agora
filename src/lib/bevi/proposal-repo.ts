// Persistência do estado de FECHAMENTO Bevi (passo 5). Guarda só o necessário pra
// retomar a proposta entre turnos (web↔WhatsApp) e pro back office acompanhar.
// LGPD-mínimo: nada de CPF — só IDs Bevi + snapshot da oferta. Ver schema
// `beviProposals` (drizzle/0022_bevi_fulfillment.sql).

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals, conversations } from "@/db/schema";
import { transitionLeadStage } from "@/lib/admin/lead-transitions";

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
	/** FIX-39: prazo REAL (meses) da oferta de parceiro — persistido pra alimentar
	 * o resumo da contratação (WhatsApp). Integer (não numeric): meses inteiros. */
	termMonths?: number | null;
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
	// FIX-41/44: denormaliza contactId da conversa pra consulta direta por
	// telefone/CPF ("buscar tudo que o cliente já fez").
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		columns: { contactId: true },
	});

	const [row] = await db
		.insert(beviProposals)
		.values({
			conversationId,
			leadId: leadId ?? null,
			contactId: conv?.contactId ?? null,
			proposalId: snapshot.proposalId,
			simulationSessionId: snapshot.simulationSessionId ?? null,
			ofertaId: snapshot.ofertaId ?? null,
			offerExpiresAt: snapshot.offerExpiresAt ?? null,
			segmento: snapshot.segmento ?? null,
			administradora: snapshot.administradora ?? null,
			grupo: snapshot.grupo ?? null,
			creditValue: toNumericString(snapshot.creditValue),
			monthlyPayment: toNumericString(snapshot.monthlyPayment),
			termMonths: snapshot.termMonths ?? null,
			consortiumProposalLink: snapshot.consortiumProposalLink ?? null,
			documentsLinkPersonal: snapshot.documentsLinkPersonal ?? null,
			documentsLinkAddress: snapshot.documentsLinkAddress ?? null,
			proposalStatus: snapshot.proposalStatus ?? null,
		})
		.returning();

	// FIX-44: a proposta Bevi já nasce automática (com PDF). A raia passa a
	// acompanhar o evento que JÁ existe — move o lead pra `proposta_enviada`
	// (system, forward-only). Antes a proposta nascia e a raia não movia.
	// Só com oferta REAL (`ofertaId`): a linha vazia existe para reaproveitar o proposalId,
	// e a temperatura do lead no backoffice não sobe sem proposta. Quando a oferta chegar,
	// `updateBeviProposal` registra o evento.
	if (leadId) {
		if (row.ofertaId) await transitionLeadStage(leadId, "proposta_enviada", { type: "system" });
	} else {
		// FIX-48: telemetria — proposta nasceu ÓRFÃ (sem leadId). No caminho web
		// isso trava a raia em `qualificado` (o resgate retroativo em /api/leads
		// cura, mas logamos pra caçar regressões na ponta primária). Sem PII.
		console.warn(
			`[proposal-repo] createBeviProposal sem leadId (conv=${conversationId}, proposal=${snapshot.proposalId}) — proposta órfã, raia não avança até religação (FIX-48)`,
		);
	}

	return row;
}

/**
 * FIX-48 — resgate retroativo: religa as propostas órfãs (leadId null) de uma
 * conversa ao lead recém-resolvido e dispara a transição `proposta_enviada`
 * (system, forward-only). Cobre a corrida "proposta criada antes do lead" (o web
 * não tinha resgate; o WhatsApp mascarava pelo polling via conversationId).
 * Idempotente: sem órfãs, no-op.
 */
export async function relinkOrphanProposals(
	conversationId: string,
	leadId: string,
): Promise<number> {
	const relinked = await db
		.update(beviProposals)
		.set({ leadId, updatedAt: new Date() })
		.where(and(eq(beviProposals.conversationId, conversationId), isNull(beviProposals.leadId)))
		.returning({ id: beviProposals.id, ofertaId: beviProposals.ofertaId });

	// Órfã sem oferta não é proposta: religa, mas não sobe a temperatura.
	if (relinked.some((r) => r.ofertaId)) {
		await transitionLeadStage(leadId, "proposta_enviada", { type: "system" });
	}
	return relinked.length;
}

/** Atualiza o estado da proposta mais recente da conversa (re-simular, escolher,
 * docs, status). Patch parcial — só os campos passados. */
export async function updateBeviProposal(
	id: string,
	patch: Partial<BeviProposalSnapshot>,
): Promise<void> {
	// A oferta que aparece pela primeira vez (linha estava sem `ofertaId`) é o momento
	// de registrar `proposta_enviada` — uma vez só (a linha passa a ter oferta).
	const antes = patch.ofertaId
		? await db.query.beviProposals.findFirst({
				where: eq(beviProposals.id, id),
				columns: { ofertaId: true, leadId: true },
			})
		: undefined;

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
			...(patch.termMonths !== undefined ? { termMonths: patch.termMonths ?? null } : {}),
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

	if (antes && !antes.ofertaId && antes.leadId) {
		await transitionLeadStage(antes.leadId, "proposta_enviada", { type: "system" });
	}
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

/**
 * Propostas da PESSOA — todas as conversas dela, mais recente primeiro.
 *
 * `getLatestBeviProposal` filtra por `conversationId` e por isso mente por
 * omissão quando o cliente tem mais de uma conversa: em 21/09/2026 a web
 * `a1b2c3d4` disse "sua proposta já está registrada" e, dois minutos depois, o
 * WhatsApp `e5f6a7b8` do MESMO telefone respondeu "ainda não aparece nenhuma
 * proposta registrada aqui pra mim" — a única proposta real (ITAÚ, 18/08) estava
 * numa terceira conversa (`c9d0e1f2`).
 *
 * O `contactId` é denormalizado em `bevi_proposals` desde o FIX-41 exatamente
 * pra esta leitura; faltava a função.
 */
export async function getProposalsByContactId(contactId: string): Promise<Row[]> {
	return db
		.select()
		.from(beviProposals)
		.where(eq(beviProposals.contactId, contactId))
		.orderBy(desc(beviProposals.createdAt));
}

/** TTL: o ofertaId da proposta ainda é válido? (30min). */
export function isOfferFresh(row: Pick<Row, "offerExpiresAt">, now = new Date()): boolean {
	return !!row.offerExpiresAt && row.offerExpiresAt.getTime() > now.getTime();
}

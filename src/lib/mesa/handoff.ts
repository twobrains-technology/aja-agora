// Mesa de operação — registro do transbordo (FIX-64).
// Spec: docs/visao/mesa-de-operacao.md §4 + DEC-B (gatilho manual).
// Decisões: docs/decisoes/blocos/2026-06-21-bloco-mesa-b.md.

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { administradoras, beviProposals, leads, mesaAttendants, mesaHandoffs } from "@/db/schema";

// Um lead tem no máximo UM handoff ativo por vez (idempotência — §3 das decisões).
export const ACTIVE_HANDOFF_STATUSES = ["aberto", "em_andamento"] as const;

type LeadRow = typeof leads.$inferSelect;
type AttendantRow = typeof mesaAttendants.$inferSelect;
type ProposalRow = typeof beviProposals.$inferSelect;
type HandoffRow = typeof mesaHandoffs.$inferSelect;

export interface CreateMesaHandoffInput {
	leadId: string;
	// FIX-125 (D16): OPCIONAL. Omitido/null = handoff nasce "sem dono" (caminho broadcast
	// FIX-124: o 1º atendente que clica "Vou atender" assume via claimMesaHandoff). Quando
	// dado, valida o atendente e grava o dono no insert (gatilho manual legado, DEC-B).
	mesaAttendantId?: string | null;
	// Cota escolhida explícita; quando omitida resolve a proposta mais recente do lead.
	beviProposalId?: string | null;
	// Admin (user) que disparou o transbordo.
	createdBy?: string | null;
}

export type CreateMesaHandoffResult =
	| {
			ok: true;
			handoff: HandoffRow;
			lead: LeadRow;
			// null no caminho broadcast (handoff sem dono) — o dono chega no claim.
			attendant: AttendantRow | null;
			proposal: ProposalRow | null;
	  }
	| { ok: false; reason: "lead_not_found" }
	| { ok: false; reason: "attendant_not_found" }
	| { ok: false; reason: "handoff_ativo_existe"; handoffId: string };

export type ClaimMesaHandoffResult =
	| { ok: true; handoff: HandoffRow }
	| { ok: false; reason: "handoff_not_found" }
	| { ok: false; reason: "ja_assumido"; ownerAttendantId: string | null };

/**
 * Casa o varchar `bevi_proposals.administradora` (ex.: "CANOPUS") com a entidade
 * `administradoras`. Ordem: codigo_bevi > nome (case-insensitive) > slug. Sem match
 * → null — NÃO bloqueia o transbordo (o copiloto/bloco C trata a ausência do dossiê).
 */
export async function resolveAdministradoraId(
	administradoraRaw: string | null | undefined,
): Promise<string | null> {
	const needle = administradoraRaw?.trim();
	if (!needle) return null;
	const lower = needle.toLowerCase();
	const [match] = await db
		.select({ id: administradoras.id })
		.from(administradoras)
		.where(
			or(
				eq(administradoras.codigoBevi, needle),
				sql`lower(${administradoras.nome}) = ${lower}`,
				sql`lower(${administradoras.slug}) = ${lower}`,
			),
		)
		.limit(1);
	return match?.id ?? null;
}

/**
 * Resolve a cota escolhida (proposta) de um lead. Se `beviProposalId` é dado, usa-o;
 * senão pega a proposta mais recente por lead_id (fallback por conversation_id).
 */
async function resolveProposalForLead(
	lead: LeadRow,
	beviProposalId?: string | null,
): Promise<ProposalRow | null> {
	if (beviProposalId) {
		const [explicit] = await db
			.select()
			.from(beviProposals)
			.where(eq(beviProposals.id, beviProposalId))
			.limit(1);
		if (explicit) return explicit;
	}
	const [byLead] = await db
		.select()
		.from(beviProposals)
		.where(eq(beviProposals.leadId, lead.id))
		.orderBy(desc(beviProposals.createdAt))
		.limit(1);
	if (byLead) return byLead;

	const [byConv] = await db
		.select()
		.from(beviProposals)
		.where(eq(beviProposals.conversationId, lead.conversationId))
		.orderBy(desc(beviProposals.createdAt))
		.limit(1);
	return byConv ?? null;
}

/**
 * Cria o registro de transbordo (mesa_handoffs) de um lead para um atendente de mesa.
 * Resolve a cota (proposta) e a administradora a partir dela. Idempotente: se já há um
 * handoff ativo pro lead, devolve `handoff_ativo_existe` sem criar nova linha.
 *
 * NÃO dispara o WhatsApp — o outbound do dossiê é do FIX-65 (sendCaseToAttendant),
 * acoplado na rota POST. Manter o registro separado do envio mantém a fonte de verdade
 * imune a falha do canal externo.
 */
export async function createMesaHandoff(
	input: CreateMesaHandoffInput,
): Promise<CreateMesaHandoffResult> {
	const [lead] = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
	if (!lead) return { ok: false, reason: "lead_not_found" };

	// Dono é OPCIONAL (FIX-125). No caminho broadcast (FIX-124) o handoff nasce sem dono;
	// só resolvemos/validamos o atendente quando um foi explicitamente passado (gatilho
	// manual legado). O claim (claimMesaHandoff) atribui o dono depois.
	let attendant: AttendantRow | null = null;
	if (input.mesaAttendantId) {
		const [found] = await db
			.select()
			.from(mesaAttendants)
			.where(eq(mesaAttendants.id, input.mesaAttendantId))
			.limit(1);
		if (!found || !found.isActive) return { ok: false, reason: "attendant_not_found" };
		attendant = found;
	}

	const [existing] = await db
		.select({ id: mesaHandoffs.id })
		.from(mesaHandoffs)
		.where(
			and(
				eq(mesaHandoffs.leadId, lead.id),
				inArray(mesaHandoffs.status, [...ACTIVE_HANDOFF_STATUSES]),
			),
		)
		.limit(1);
	if (existing) return { ok: false, reason: "handoff_ativo_existe", handoffId: existing.id };

	const proposal = await resolveProposalForLead(lead, input.beviProposalId);
	const administradoraId = await resolveAdministradoraId(proposal?.administradora);

	const [handoff] = await db
		.insert(mesaHandoffs)
		.values({
			leadId: lead.id,
			conversationId: lead.conversationId,
			beviProposalId: proposal?.id ?? null,
			mesaAttendantId: attendant?.id ?? null,
			administradoraId,
			status: "aberto",
			createdBy: input.createdBy ?? null,
		})
		.returning();

	return { ok: true, handoff, lead, attendant, proposal };
}

/**
 * Claim atômico do transbordo (FIX-125, D16). O 1º atendente que clica "Vou atender"
 * ASSUME o caso; os demais recebem "já foi assumido".
 *
 * A GARANTIA de 1 vencedor mora no `UPDATE ... WHERE id = :h AND mesa_attendant_id IS NULL`:
 * o banco serializa a linha, então só o primeiro UPDATE casa a guarda `IS NULL` — os
 * concorrentes veem `rowCount === 0` (a coluna já não está nula). Diferente do proxy de
 * chat de vendas (proxy.ts:511-519, find-then-update SEM guard → TOCTOU latente), a mesa
 * já nasce com o guard atômico.
 *
 * NÃO move a raia — isso é o FIX-126 (transitionLeadStage no claim). Aqui só o lock.
 */
export async function claimMesaHandoff(
	handoffId: string,
	attendantId: string,
): Promise<ClaimMesaHandoffResult> {
	const [claimed] = await db
		.update(mesaHandoffs)
		.set({ mesaAttendantId: attendantId, status: "em_andamento" })
		.where(and(eq(mesaHandoffs.id, handoffId), isNull(mesaHandoffs.mesaAttendantId)))
		.returning();
	if (claimed) return { ok: true, handoff: claimed };

	// Perdeu a corrida (ou handoff inexistente). Busca o dono atual pra mensagem "já assumido".
	const [current] = await db
		.select({ ownerAttendantId: mesaHandoffs.mesaAttendantId })
		.from(mesaHandoffs)
		.where(eq(mesaHandoffs.id, handoffId))
		.limit(1);
	if (!current) return { ok: false, reason: "handoff_not_found" };
	return { ok: false, reason: "ja_assumido", ownerAttendantId: current.ownerAttendantId };
}

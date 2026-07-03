// Mesa de operação — registro do transbordo (FIX-64).
// Spec: docs/visao/mesa-de-operacao.md §4 + DEC-B (gatilho manual).
// Decisões: docs/decisoes/blocos/2026-06-21-bloco-mesa-b.md.

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { administradoras, beviProposals, leads, mesaAttendants, mesaHandoffs } from "@/db/schema";
import { transitionLeadStage } from "@/lib/admin/lead-transitions";

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
 * FIX-126 (D17): ao assumir, o lead MUDA de fase → `em_atendimento` (raia própria da
 * mesa). Forward-only + best-effort: se o lead já está numa raia adiante, é no-op seguro
 * (não regride); falha da transição não desfaz o claim. Espelha o proxy.ts:312 (claim do
 * chat de vendas move a raia).
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
	if (claimed) {
		// FIX-126: claim = o caso está sendo tocado por um humano → raia em_atendimento.
		try {
			await transitionLeadStage(
				claimed.leadId,
				"em_atendimento",
				{ type: "system" },
				{ onlyAdvance: true },
			);
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "mesa-claim",
					handoff_id: claimed.id,
					error: err instanceof Error ? err.message : String(err),
					note: "transição de raia pós-claim falhou (claim mantido)",
				}),
			);
		}
		return { ok: true, handoff: claimed };
	}

	// Perdeu a corrida (ou handoff inexistente). Busca o dono atual pra mensagem "já assumido".
	const [current] = await db
		.select({ ownerAttendantId: mesaHandoffs.mesaAttendantId })
		.from(mesaHandoffs)
		.where(eq(mesaHandoffs.id, handoffId))
		.limit(1);
	if (!current) return { ok: false, reason: "handoff_not_found" };
	return { ok: false, reason: "ja_assumido", ownerAttendantId: current.ownerAttendantId };
}

function isActiveHandoffStatus(status: string): boolean {
	return status === "aberto" || status === "em_andamento";
}

export type ReassignMesaHandoffResult =
	| {
			ok: true;
			handoff: HandoffRow;
			oldAttendantId: string | null;
			newAttendant: AttendantRow;
			lead: LeadRow | null;
	  }
	| { ok: false; reason: "handoff_not_found" }
	| { ok: false; reason: "handoff_encerrado" }
	| { ok: false; reason: "attendant_not_found" }
	| { ok: false; reason: "mesmo_atendente" };

export type CloseMesaHandoffResult =
	| { ok: true; handoff: HandoffRow; attendantId: string | null; lead: LeadRow | null }
	| { ok: false; reason: "handoff_not_found" }
	| { ok: false; reason: "handoff_encerrado" };

export interface ActiveHandoffSummary {
	id: string;
	status: (typeof ACTIVE_HANDOFF_STATUSES)[number];
	attendant: { id: string; nome: string; whatsapp: string } | null;
	// createdAt do handoff (aproximação de "na mesa desde ~"; claimed_at preciso é evolução).
	since: string;
}

/**
 * Reatribui um handoff ATIVO a OUTRO atendente (decisão Kairo 2026-07-03: reatribuir a um específico,
 * NÃO re-broadcast — ver docs/decisoes/2026-07-03-mesa-encerrar-atendimento-vai-pra-ganho.md). Se o
 * handoff estava "aberto" (sem dono), reatribuir equivale ao claim: vira `em_andamento` e move a raia
 * pra `em_atendimento`. Devolve o dono antigo (pode ser null) pra notificação na rota.
 */
export async function reassignMesaHandoff(
	handoffId: string,
	newAttendantId: string,
	reassignedBy?: string | null,
): Promise<ReassignMesaHandoffResult> {
	const [handoff] = await db
		.select()
		.from(mesaHandoffs)
		.where(eq(mesaHandoffs.id, handoffId))
		.limit(1);
	if (!handoff) return { ok: false, reason: "handoff_not_found" };
	if (!isActiveHandoffStatus(handoff.status)) return { ok: false, reason: "handoff_encerrado" };

	const [attendant] = await db
		.select()
		.from(mesaAttendants)
		.where(eq(mesaAttendants.id, newAttendantId))
		.limit(1);
	if (!attendant || !attendant.isActive) return { ok: false, reason: "attendant_not_found" };
	if (handoff.mesaAttendantId === newAttendantId) return { ok: false, reason: "mesmo_atendente" };

	const oldAttendantId = handoff.mesaAttendantId;
	const [updated] = await db
		.update(mesaHandoffs)
		.set({ mesaAttendantId: newAttendantId, status: "em_andamento" })
		.where(
			and(
				eq(mesaHandoffs.id, handoffId),
				inArray(mesaHandoffs.status, [...ACTIVE_HANDOFF_STATUSES]),
			),
		)
		.returning();
	if (!updated) return { ok: false, reason: "handoff_encerrado" }; // corrida: encerrou no meio

	const [lead] = await db.select().from(leads).where(eq(leads.id, updated.leadId)).limit(1);

	// Estava sem dono (aberto) → reatribuir equivale ao claim: o caso passa a estar em atendimento.
	if (!oldAttendantId) {
		try {
			await transitionLeadStage(
				updated.leadId,
				"em_atendimento",
				reassignedBy ? { type: "admin", id: reassignedBy } : { type: "system" },
			);
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "mesa-reassign",
					handoff_id: updated.id,
					error: err instanceof Error ? err.message : String(err),
					note: "transição de raia pós-reatribuição falhou (reatribuição mantida)",
				}),
			);
		}
	}

	return {
		ok: true,
		handoff: updated,
		oldAttendantId,
		newAttendant: attendant,
		lead: lead ?? null,
	};
}

/**
 * Encerra um handoff ATIVO: `status = concluido`, `closed_at = now()`, E move o lead pra
 * `fechado_ganho` (decisão Kairo 2026-07-03 — raia provisória, ver docs/decisoes). Atômico via guard
 * de status; encerrar um já-encerrado → `handoff_encerrado`. Fecha o gap do handoff que nunca terminava.
 */
export async function closeMesaHandoff(
	handoffId: string,
	closedBy?: string | null,
): Promise<CloseMesaHandoffResult> {
	const [handoff] = await db
		.select()
		.from(mesaHandoffs)
		.where(eq(mesaHandoffs.id, handoffId))
		.limit(1);
	if (!handoff) return { ok: false, reason: "handoff_not_found" };
	if (!isActiveHandoffStatus(handoff.status)) return { ok: false, reason: "handoff_encerrado" };

	const [closed] = await db
		.update(mesaHandoffs)
		.set({ status: "concluido", closedAt: new Date() })
		.where(
			and(
				eq(mesaHandoffs.id, handoffId),
				inArray(mesaHandoffs.status, [...ACTIVE_HANDOFF_STATUSES]),
			),
		)
		.returning();
	if (!closed) return { ok: false, reason: "handoff_encerrado" };

	const [lead] = await db.select().from(leads).where(eq(leads.id, closed.leadId)).limit(1);
	try {
		await transitionLeadStage(
			closed.leadId,
			"fechado_ganho",
			closedBy ? { type: "admin", id: closedBy } : { type: "system" },
		);
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "mesa-close",
				handoff_id: closed.id,
				error: err instanceof Error ? err.message : String(err),
				note: "transição de raia pós-encerramento falhou (encerramento mantido)",
			}),
		);
	}

	return { ok: true, handoff: closed, attendantId: closed.mesaAttendantId, lead: lead ?? null };
}

/**
 * Visibilidade: mapa `leadId → responsável` do handoff ativo. Uma query com LEFT JOIN em
 * `mesa_attendants` (`attendant: null` enquanto o handoff está `aberto` — broadcast sem dono).
 * Base do selo do card e do bloco "Responsável pela mesa".
 */
export async function getActiveHandoffsByLead(
	leadIds: string[],
): Promise<Map<string, ActiveHandoffSummary>> {
	const map = new Map<string, ActiveHandoffSummary>();
	if (leadIds.length === 0) return map;
	const rows = await db
		.select({
			leadId: mesaHandoffs.leadId,
			id: mesaHandoffs.id,
			status: mesaHandoffs.status,
			createdAt: mesaHandoffs.createdAt,
			attId: mesaAttendants.id,
			attNome: mesaAttendants.nome,
			attWhatsapp: mesaAttendants.whatsapp,
		})
		.from(mesaHandoffs)
		.leftJoin(mesaAttendants, eq(mesaHandoffs.mesaAttendantId, mesaAttendants.id))
		.where(
			and(
				inArray(mesaHandoffs.leadId, leadIds),
				inArray(mesaHandoffs.status, [...ACTIVE_HANDOFF_STATUSES]),
			),
		);
	for (const r of rows) {
		map.set(r.leadId, {
			id: r.id,
			status: r.status as (typeof ACTIVE_HANDOFF_STATUSES)[number],
			since: r.createdAt.toISOString(),
			// LEFT JOIN → nome/whatsapp são nulláveis no tipo, mas quando attId existe a linha
			// casou (colunas notNull). Cast seguro dentro do guard.
			attendant: r.attId
				? { id: r.attId, nome: r.attNome as string, whatsapp: r.attWhatsapp as string }
				: null,
		});
	}
	return map;
}

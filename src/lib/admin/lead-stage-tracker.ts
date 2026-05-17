import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { transitionLeadStage } from "@/lib/admin/lead-transitions";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";

export type TrackableStage = "engajado" | "qualificado";

const STAGE_ORDER: Record<"novo" | TrackableStage, number> = {
	novo: 0,
	engajado: 1,
	qualificado: 2,
};

/**
 * Records the highest funnel stage the user reached during the AI conversation
 * (before any lead row is created). Saved to `conversations.metadata.maxStageReached`.
 *
 * If a lead already exists for the conversation, also transitions it immediately.
 * Otherwise the stage is applied later via `applyTrackedStageToLead` when the
 * lead is finally inserted (form submit, handoff, etc.).
 *
 * Forward-only: never regresses a stage.
 */
export async function recordStageReached(
	conversationId: string,
	stage: TrackableStage,
): Promise<void> {
	try {
		const meta = await reloadMeta(conversationId);
		const current = meta.maxStageReached ?? "novo";
		if (STAGE_ORDER[stage] > STAGE_ORDER[current]) {
			await persistMeta(conversationId, { ...meta, maxStageReached: stage });
		}

		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, conversationId),
		});
		// Conversa simulada não pode mover lead no kanban (kanban filtra is_simulated=false,
		// mas lead_events tabela acumularia auditoria fake e mascararia bugs reais).
		if (lead && !lead.isSimulated) {
			await transitionLeadStage(lead.id, stage, { type: "system" }, { onlyAdvance: true });
		}
	} catch (err) {
		console.error("[lead-stage-tracker] recordStageReached failed:", err);
	}
}

/**
 * Helper único pra criar lead a partir de uma conversation. Garante:
 * - Lead herda `is_simulated` da conversation (zero leak pra kanban/funnel).
 * - `applyTrackedStageToLead` (que move o lead pro stage máximo) é chamado SÓ quando
 *   a conversa é real. Conversa simulada NÃO movimenta kanban.
 *
 * Use em TODOS os call sites que criam lead novo: /api/leads (web form),
 * proxy.handoffToAgents (WhatsApp interest/playbook), lead-collection (discovery),
 * tool `capture_lead`. Centralizar aqui evita o vazamento que aconteceu no
 * primeiro draft (lead criado sem flag → contamina pipeline comercial).
 */
export async function createLeadFromConversation(opts: {
	conversationId: string;
	name: string | null;
	phone: string | null;
	email: string | null;
}): Promise<{ leadId: string; isSimulated: boolean }> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, opts.conversationId),
		columns: { isSimulated: true },
	});
	const isSimulated = conv?.isSimulated ?? false;

	const [created] = await db
		.insert(leads)
		.values({
			conversationId: opts.conversationId,
			name: opts.name,
			phone: opts.phone,
			email: opts.email,
			isSimulated,
		})
		.returning();

	if (!isSimulated) {
		await applyTrackedStageToLead(opts.conversationId, created.id);
	}

	return { leadId: created.id, isSimulated };
}

/**
 * Reads `maxStageReached` from conversation metadata and applies it to a freshly
 * created lead, so the lead lands in the correct kanban column instead of "novo".
 *
 * Call this immediately after `db.insert(leads).values(...)` in any path that
 * creates a lead from a conversation that may have progressed before the lead
 * row existed (web form submit, WhatsApp handoff, capture_lead, lead-collection).
 */
export async function applyTrackedStageToLead(
	conversationId: string,
	leadId: string,
): Promise<void> {
	try {
		const meta = await reloadMeta(conversationId);
		if (!meta.maxStageReached) return;
		await transitionLeadStage(
			leadId,
			meta.maxStageReached,
			{ type: "system" },
			{ onlyAdvance: true },
		);
	} catch (err) {
		console.error("[lead-stage-tracker] applyTrackedStageToLead failed:", err);
	}
}

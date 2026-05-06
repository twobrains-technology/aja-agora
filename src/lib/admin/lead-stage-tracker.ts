import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
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
		if (lead) {
			await transitionLeadStage(lead.id, stage, { type: "system" }, { onlyAdvance: true });
		}
	} catch (err) {
		console.error("[lead-stage-tracker] recordStageReached failed:", err);
	}
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

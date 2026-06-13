import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leadEvents, leads } from "@/db/schema";

// Re-export from client-safe module for backward compatibility
export { type LeadStage, STAGE_ORDER } from "./lead-stages";

import { STAGE_ORDER as _STAGE_ORDER, type LeadStage } from "./lead-stages";

/**
 * Transition a lead to a new stage, logging the event to lead_events.
 *
 * @param leadId - UUID of the lead
 * @param toStage - Target stage
 * @param actor - Who triggered the transition (system or admin with user ID)
 * @param options - { onlyAdvance: true } prevents backward transitions (D-11)
 * @returns Updated lead object, the unchanged lead if no-op, or null if not found
 */
export async function transitionLeadStage(
	leadId: string,
	toStage: LeadStage,
	actor: { type: "system" | "admin"; id?: string },
	options?: { onlyAdvance?: boolean },
) {
	const lead = await db.query.leads.findFirst({
		where: eq(leads.id, leadId),
	});

	if (!lead) return null;

	// Only advance forward check (D-11)
	if (options?.onlyAdvance) {
		const currentIdx = _STAGE_ORDER.indexOf(lead.stage);
		const targetIdx = _STAGE_ORDER.indexOf(toStage);
		if (targetIdx <= currentIdx) return lead; // No-op
	}

	// Same stage — no-op
	if (lead.stage === toStage) return lead;

	const now = new Date();

	await db.update(leads).set({ stage: toStage, updatedAt: now }).where(eq(leads.id, leadId));

	await db.insert(leadEvents).values({
		leadId,
		fromStage: lead.stage,
		toStage,
		actorType: actor.type,
		actorId: actor.id ?? null,
	});

	return { ...lead, stage: toStage, updatedAt: now };
}

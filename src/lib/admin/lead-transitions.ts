import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leadEvents, leads } from "@/db/schema";

// Re-export from client-safe module for backward compatibility
export { type LeadStage, STAGE_ORDER } from "./lead-stages";

import { STAGE_ORDER as _STAGE_ORDER, type LeadStage } from "./lead-stages";

/**
 * Transition a lead to a new stage, logging the event to lead_events.
 *
 * FIX-43: a máquina é **forward-only por default**. Regressão (mover pra uma raia
 * anterior na STAGE_ORDER) é NO-OP a menos que `allowRegression: true` seja
 * passado explicitamente — é assim que o admin "desfaz" um avanço de propósito
 * (FIX-44 amarra isso à flag explícita da rota). A automação (`system`) nunca
 * passa a flag → nunca regride.
 *
 * @param leadId - UUID of the lead
 * @param toStage - Target stage
 * @param actor - Who triggered the transition (system or admin with user ID)
 * @param options.allowRegression - permite mover pra trás (regressão explícita)
 * @param options.onlyAdvance - legado; forward-only já é o default (no-op extra)
 * @returns Updated lead object, the unchanged lead if no-op, or null if not found
 */
export async function transitionLeadStage(
	leadId: string,
	toStage: LeadStage,
	actor: { type: "system" | "admin"; id?: string },
	options?: { onlyAdvance?: boolean; allowRegression?: boolean },
) {
	const lead = await db.query.leads.findFirst({
		where: eq(leads.id, leadId),
	});

	if (!lead) return null;

	// Same stage — no-op
	if (lead.stage === toStage) return lead;

	// Forward-only por DEFAULT (FIX-43). Regressão só com allowRegression explícito.
	const currentIdx = _STAGE_ORDER.indexOf(lead.stage);
	const targetIdx = _STAGE_ORDER.indexOf(toStage);
	const isRegression = targetIdx < currentIdx;
	if (isRegression && !options?.allowRegression) return lead; // No-op

	const now = new Date();

	await db.update(leads).set({ stage: toStage, updatedAt: now }).where(eq(leads.id, leadId));

	await db.insert(leadEvents).values({
		leadId,
		fromStage: lead.stage,
		toStage,
		actorType: actor.type,
		actorId: actor.id ?? null,
	});

	// Marco de mídia. Só alguns estágios viram sinal pro algoritmo de anúncio
	// (ver ESTAGIO_PARA_EVENTO); o registro é idempotente e NUNCA faz rede aqui
	// — o envio à Meta é assíncrono e vive atrás da feature flag. Falhar aqui
	// não pode desfazer uma transição de funil que já aconteceu.
	try {
		const { registrarConversaoDoEstagio } = await import("@/lib/conversions/registry");
		await registrarConversaoDoEstagio(leadId, toStage, now);
	} catch (err) {
		console.error("[lead-transitions] falha ao registrar conversão de mídia:", err);
	}

	return { ...lead, stage: toStage, updatedAt: now };
}

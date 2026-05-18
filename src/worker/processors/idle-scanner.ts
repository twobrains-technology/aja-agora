/**
 * Idle scanner — varre leads parados em cada stage e enfileira evaluate
 * pra automações com trigger `idle_in_stage`.
 *
 * Roda a cada N minutos via BullMQ repeatable job (configurado no boot do
 * worker). Pra cada automação enabled de tipo idle_in_stage:
 *  1. Pega leads que entraram no stage configurado e estão lá há >= durationMs
 *     (usa lead_events: último evento desse lead onde toStage = stage)
 *  2. Enfileira evaluate-idle com windowStartIso (truncado por dia) pra
 *     dedup naturalmente (1 disparo / lead / dia / stage / automation)
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { automations, leadEvents, leads } from "@/db/schema";
import type { LeadStage } from "@/lib/admin/lead-stages";
import { enqueueEvaluateIdle } from "@/lib/automation/triggers";

export interface IdleScannerJob {
	scanAt?: string;
}

export async function processIdleScannerJob(_job: IdleScannerJob): Promise<{
	scanned: number;
	enqueued: number;
}> {
	const idleAutomations = await db
		.select({
			id: automations.id,
			triggerConfig: automations.triggerConfig,
		})
		.from(automations)
		.where(and(eq(automations.enabled, true), eq(automations.triggerType, "idle_in_stage")));

	let scanned = 0;
	let enqueued = 0;

	for (const auto of idleAutomations) {
		const cfg = auto.triggerConfig as { stage: LeadStage; durationMs: number };
		if (!cfg.stage || !cfg.durationMs) continue;

		// Snapshot: todos leads atualmente nesse stage.
		const candidates = await db
			.select({ id: leads.id })
			.from(leads)
			.where(eq(leads.stage, cfg.stage));

		const now = Date.now();
		// Janela do dia atual (UTC) — usado pro dedup key. Idle dispara só 1x/dia/lead.
		const windowStart = new Date();
		windowStart.setUTCHours(0, 0, 0, 0);
		const windowStartIso = windowStart.toISOString();

		for (const lead of candidates) {
			scanned++;
			// Último lead_event que levou o lead pra esse stage
			const [lastEvent] = await db
				.select({ createdAt: leadEvents.createdAt, toStage: leadEvents.toStage })
				.from(leadEvents)
				.where(and(eq(leadEvents.leadId, lead.id), eq(leadEvents.toStage, cfg.stage)))
				.orderBy(desc(leadEvents.createdAt))
				.limit(1);
			if (!lastEvent) continue;
			const idleMs = now - lastEvent.createdAt.getTime();
			if (idleMs < cfg.durationMs) continue;

			await enqueueEvaluateIdle({
				leadId: lead.id,
				stage: cfg.stage,
				idleMs,
				windowStartIso,
			});
			enqueued++;
		}
	}

	console.log(
		`[idle-scanner] automations=${idleAutomations.length} scanned=${scanned} enqueued=${enqueued}`,
	);
	return { scanned, enqueued };
}

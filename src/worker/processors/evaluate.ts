/**
 * Processor `automation-evaluate`: recebe um trigger event e:
 *  1. Carrega automações enabled
 *  2. Filtra via dispatcher.matchesTrigger()
 *  3. Insere automation_runs (UNIQUE em dedup_key garante idempotência)
 *  4. Enfileira primeiro step pra cada run criado
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type AutomationGraph,
	automationRuns,
	automations,
	conversations,
	leads,
	messages,
} from "@/db/schema";
import {
	buildDedupKey,
	matchesTrigger,
	type StoredAutomation,
	type TriggerEvent,
} from "@/lib/automation/dispatcher";
import type { EvaluateJob } from "@/lib/automation/triggers";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

export async function processEvaluateJob(job: EvaluateJob): Promise<{
	matched: number;
	created: number;
	skipped: number;
}> {
	const event: TriggerEvent =
		job.kind === "stage_changed"
			? {
					kind: "stage_changed",
					fromStage: job.fromStage,
					toStage: job.toStage,
				}
			: {
					kind: "idle_in_stage",
					stage: job.stage,
					idleMs: job.idleMs,
				};

	const triggerType = event.kind;
	const rows = await db
		.select({
			id: automations.id,
			enabled: automations.enabled,
			triggerType: automations.triggerType,
			triggerConfig: automations.triggerConfig,
			version: automations.version,
			graph: automations.graph,
		})
		.from(automations)
		.where(and(eq(automations.enabled, true), eq(automations.triggerType, triggerType)));

	const matched: typeof rows = [];
	for (const row of rows) {
		const stored: StoredAutomation = {
			id: row.id,
			enabled: row.enabled,
			triggerType: row.triggerType as StoredAutomation["triggerType"],
			triggerConfig: row.triggerConfig as Record<string, unknown>,
		};
		if (matchesTrigger(stored, event)) matched.push(row);
	}

	const leadId = job.kind === "stage_changed" ? job.leadId : job.leadId;
	const stepQueue = getQueue(QUEUE_NAMES.step);
	let created = 0;
	let skipped = 0;

	// Skip se chat ativo nos últimos 5 minutos (CA-P1-06 + PF-05).
	// Default 5min; override via env pra testes.
	const chatActiveWindowMs = Number(
		process.env.AUTOMATION_CHAT_ACTIVE_WINDOW_MS ?? 5 * 60 * 1000,
	);
	const chatActive = await isChatActive(leadId, chatActiveWindowMs);
	if (chatActive && matched.length > 0) {
		// Persiste 1 row skipped por automação matched pra auditoria —
		// admin precisa enxergar em /runs que a automação NÃO disparou
		// e por quê. Dedup key garante idempotência mesmo no skip.
		for (const auto of matched) {
			const dedupKey = buildDedupKey({
				automationId: auto.id,
				leadId,
				source:
					job.kind === "stage_changed"
						? { kind: "stage_changed", leadEventId: job.leadEventId }
						: {
								kind: "idle_in_stage",
								stage: job.stage,
								windowStartIso: job.windowStartIso,
							},
			});
			await db
				.insert(automationRuns)
				.values({
					automationId: auto.id,
					automationVersion: auto.version,
					leadId,
					leadEventId: job.kind === "stage_changed" ? job.leadEventId : null,
					dedupKey,
					status: "cancelled",
					errorMessage: "skipped:chat_active",
					completedAt: new Date(),
				})
				.onConflictDoNothing({ target: automationRuns.dedupKey });
		}
		console.log(
			`[evaluate] skip chat-active lead=${leadId} matched=${matched.length} window=${chatActiveWindowMs}ms`,
		);
		return { matched: matched.length, created: 0, skipped: matched.length };
	}

	for (const auto of matched) {
		const dedupKey = buildDedupKey({
			automationId: auto.id,
			leadId,
			source:
				job.kind === "stage_changed"
					? { kind: "stage_changed", leadEventId: job.leadEventId }
					: {
							kind: "idle_in_stage",
							stage: job.stage,
							windowStartIso: job.windowStartIso,
						},
		});

		const graph = auto.graph as AutomationGraph;
		const triggerNode = graph.nodes.find((n) => n.type.startsWith("trigger."));
		if (!triggerNode) {
			skipped++;
			continue;
		}

		try {
			const [run] = await db
				.insert(automationRuns)
				.values({
					automationId: auto.id,
					automationVersion: auto.version,
					leadId,
					leadEventId: job.kind === "stage_changed" ? job.leadEventId : null,
					dedupKey,
					status: "pending",
					currentNodeId: triggerNode.id,
				})
				.onConflictDoNothing({ target: automationRuns.dedupKey })
				.returning({ id: automationRuns.id });

			if (!run) {
				skipped++; // idempotência: já existe um run pra esse trigger
				console.log(`[evaluate] skip dup auto=${auto.id} lead=${leadId} key=${dedupKey}`);
				continue;
			}

			await stepQueue.add(
				"step",
				{
					runId: run.id,
					automationId: auto.id,
					leadId,
					nodeId: triggerNode.id,
				},
				{ jobId: `step:${run.id}:${triggerNode.id}` },
			);
			created++;
		} catch (err) {
			console.error(`[evaluate] insert run failed:`, err);
			skipped++;
		}
	}

	console.log(
		`[evaluate] kind=${job.kind} matched=${matched.length} created=${created} skipped=${skipped}`,
	);
	return { matched: matched.length, created, skipped };
}

/**
 * Verifica se o lead enviou mensagem (web OU whatsapp) nos últimos `windowMs`.
 * Se sim, automação NÃO deve disparar — agente vivo está conduzindo a conversa.
 */
async function isChatActive(leadId: string, windowMs: number): Promise<boolean> {
	const [lead] = await db
		.select({ conversationId: leads.conversationId })
		.from(leads)
		.where(eq(leads.id, leadId))
		.limit(1);
	if (!lead) return false;
	const [convo] = await db
		.select({ id: conversations.id })
		.from(conversations)
		.where(eq(conversations.id, lead.conversationId))
		.limit(1);
	if (!convo) return false;
	const [lastInbound] = await db
		.select({ createdAt: messages.createdAt })
		.from(messages)
		.where(and(eq(messages.conversationId, convo.id), eq(messages.role, "user")))
		.orderBy(desc(messages.createdAt))
		.limit(1);
	if (!lastInbound) return false;
	return Date.now() - lastInbound.createdAt.getTime() <= windowMs;
}

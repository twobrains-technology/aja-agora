/**
 * Processor `automation-step`: executa 1 nó do grafo.
 *
 * Fluxo:
 *  1. Load run + automation + lead
 *  2. Find nó pelo currentNodeId
 *  3. Switch por tipo:
 *     - trigger → no-op (já matched), avança pro próximo
 *     - condition → avalia, escolhe branch true/false
 *     - action.send_whatsapp → valida janela 24h / template approved, envia
 *     - action.send_email → SendGrid
 *     - action.move_to_stage → transitionLeadStage
 *     - action.add_note → cria lead note (sem tabela ainda — log only no MVP)
 *     - wait → enfileira em delayed
 *     - end → marca run completed
 *  4. Loga node_execution
 *  5. Enfileira próximo step (ou completa)
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	automationNodeExecutions,
	automationRuns,
	automations,
	conversations,
	leadNotes,
	leads,
	messages,
	whatsappTemplates,
} from "@/db/schema";
import { transitionLeadStage } from "@/lib/admin/lead-transitions";
import {
	type AutomationExecutionContext,
	evaluateCondition,
	MAX_STEPS,
	pickNextNodeId,
	resolveTemplateVars,
} from "@/lib/automation/engine";
import type { AutomationGraph, AutomationNode } from "@/lib/automation/schema";
import { sendEmail } from "@/lib/email/sendgrid";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";
import { sendTextMessage } from "@/lib/whatsapp/api";
import { sendTemplate } from "@/lib/whatsapp/templates";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface StepJob {
	runId: string;
	automationId: string;
	leadId: string;
	nodeId: string;
	branch?: boolean;
}

export async function processStepJob(job: StepJob): Promise<void> {
	const [run] = await db
		.select()
		.from(automationRuns)
		.where(eq(automationRuns.id, job.runId))
		.limit(1);
	if (!run) {
		console.warn(`[step] run not found id=${job.runId}`);
		return;
	}
	if (run.status === "cancelled" || run.status === "failed" || run.status === "completed") {
		console.log(`[step] run already terminal status=${run.status} id=${job.runId}`);
		return;
	}

	// Loop guard
	if (run.stepCount >= MAX_STEPS) {
		await markRunFailed(job.runId, "MAX_STEPS_EXCEEDED");
		console.error(`[step] loop guard hit run=${job.runId} count=${run.stepCount}`);
		return;
	}

	const [auto] = await db
		.select({ graph: automations.graph, enabled: automations.enabled })
		.from(automations)
		.where(eq(automations.id, job.automationId))
		.limit(1);
	if (!auto) {
		await markRunFailed(job.runId, "AUTOMATION_NOT_FOUND");
		return;
	}
	if (!auto.enabled) {
		await markRunCancelled(job.runId);
		return;
	}

	const graph = auto.graph as AutomationGraph;
	const node = graph.nodes.find((n) => n.id === job.nodeId);
	if (!node) {
		await markRunFailed(job.runId, "NODE_NOT_FOUND");
		return;
	}

	const [lead] = await db.select().from(leads).where(eq(leads.id, job.leadId)).limit(1);
	if (!lead) {
		await markRunFailed(job.runId, "LEAD_NOT_FOUND");
		return;
	}

	// Marca node execution started
	await db
		.update(automationRuns)
		.set({ status: "running", currentNodeId: job.nodeId, stepCount: run.stepCount + 1 })
		.where(eq(automationRuns.id, job.runId));

	const [exec] = await db
		.insert(automationNodeExecutions)
		.values({
			runId: job.runId,
			nodeId: node.id,
			nodeType: node.type,
			status: "running",
		})
		.returning({ id: automationNodeExecutions.id });

	let output: Record<string, unknown> | null = null;
	let nodeError: string | null = null;
	let branchResult: boolean | undefined;

	try {
		const ctx = await buildExecutionContext(lead);

		// ─── Trigger: no-op
		if (node.type.startsWith("trigger.")) {
			output = { handled: "trigger" };
		}
		// ─── Condition
		else if (node.type.startsWith("condition.")) {
			branchResult = evaluateCondition(node as AutomationNode, ctx);
			output = { branch: branchResult };
		}
		// ─── Action: send_whatsapp
		else if (node.type === "action.send_whatsapp") {
			output = await executeSendWhatsApp(node, ctx);
		}
		// ─── Action: send_email
		else if (node.type === "action.send_email") {
			output = await executeSendEmail(node, ctx);
		}
		// ─── Action: move_to_stage
		else if (node.type === "action.move_to_stage") {
			const cfg = (node as { config: { stage: import("@/lib/admin/lead-stages").LeadStage } })
				.config;
			await transitionLeadStage(lead.id, cfg.stage, { type: "system" });
			output = { stage: cfg.stage };
		}
		// ─── Action: add_note
		else if (node.type === "action.add_note") {
			const cfg = (node as { config: { text: string } }).config;
			const noteBody = resolveTemplateVars(cfg.text, ctx);
			const [inserted] = await db
				.insert(leadNotes)
				.values({
					leadId: lead.id,
					body: noteBody,
					source: "automation",
					automationRunId: job.runId,
				})
				.returning({ id: leadNotes.id });
			output = { note: noteBody, noteId: inserted?.id };
		}
		// ─── Wait
		else if (node.type === "wait") {
			const cfg = (node as { config: { durationMs: number } }).config;
			// Enfileira em delayed e termina este step
			const delayed = getQueue(QUEUE_NAMES.delayed);
			const next = pickNextNodeId(graph, node.id);
			if (next.kind !== "next") {
				output = { wait: "skipped", reason: "no_next" };
			} else {
				await delayed.add(
					"resume",
					{
						runId: job.runId,
						automationId: job.automationId,
						leadId: job.leadId,
						nodeId: next.nodeId,
					} satisfies StepJob,
					{
						delay: cfg.durationMs,
						jobId: `delayed:${job.runId}:${next.nodeId}`,
					},
				);
				output = { wait: cfg.durationMs, next: next.nodeId };
			}
			await markNodeExecutionDone(exec.id, "completed", output);
			return; // não enfileira step normal
		}
		// ─── End
		else if (node.type === "end") {
			await markRunCompleted(job.runId);
			await markNodeExecutionDone(exec.id, "completed", { end: true });
			return;
		}

		await markNodeExecutionDone(exec.id, "completed", output);
	} catch (err) {
		nodeError = err instanceof Error ? err.message : String(err);
		console.error(`[step] node ${node.type} failed:`, nodeError);
		await markNodeExecutionDone(exec.id, "failed", output, nodeError);
		await markRunFailed(job.runId, nodeError);
		throw err; // re-throw pro BullMQ tratar retry
	}

	// Decide próximo
	const next = pickNextNodeId(graph, node.id, { branch: branchResult });
	if (next.kind === "halt") {
		await markRunCompleted(job.runId);
		return;
	}
	if (next.kind === "error") {
		await markRunFailed(job.runId, next.reason);
		return;
	}

	const stepQueue = getQueue(QUEUE_NAMES.step);
	await stepQueue.add(
		"step",
		{
			runId: job.runId,
			automationId: job.automationId,
			leadId: job.leadId,
			nodeId: next.nodeId,
		} satisfies StepJob,
		{ jobId: `step:${job.runId}:${next.nodeId}` },
	);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function buildExecutionContext(
	lead: typeof leads.$inferSelect,
): Promise<AutomationExecutionContext> {
	const [convo] = await db
		.select({ id: conversations.id, channel: conversations.channel })
		.from(conversations)
		.where(eq(conversations.id, lead.conversationId))
		.limit(1);

	let lastInboundAt: Date | null = null;
	let channelOfLastInbound: "whatsapp" | "web" | null = null;

	if (convo) {
		const [lastInbound] = await db
			.select({ createdAt: messages.createdAt, channel: messages.channel })
			.from(messages)
			.where(and(eq(messages.conversationId, convo.id), eq(messages.role, "user")))
			.orderBy(desc(messages.createdAt))
			.limit(1);
		if (lastInbound) {
			lastInboundAt = lastInbound.createdAt;
			channelOfLastInbound = lastInbound.channel as "whatsapp" | "web";
		}
	}

	return {
		lead: {
			id: lead.id,
			name: lead.name ?? null,
			email: lead.email ?? null,
			phone: lead.phone ?? null,
			stage: lead.stage,
		},
		lastInboundAt,
		channelOfLastInbound,
	};
}

async function executeSendWhatsApp(
	node: AutomationNode,
	ctx: AutomationExecutionContext,
): Promise<Record<string, unknown>> {
	if (node.type !== "action.send_whatsapp") throw new Error("wrong node type");
	const cfg = node.config;
	if (!ctx.lead.phone) throw new Error("LEAD_HAS_NO_PHONE");

	if (cfg.mode === "free_text") {
		// Janela 24h
		if (!ctx.lastInboundAt || Date.now() - ctx.lastInboundAt.getTime() > TWENTY_FOUR_HOURS_MS) {
			throw new Error("META_24H_WINDOW_EXPIRED");
		}
		const text = resolveTemplateVars(cfg.text, ctx);
		const result = (await sendTextMessage(ctx.lead.phone, text)) as {
			messageId?: string;
			error?: string;
		};
		if (result.error) throw new Error(`WHATSAPP_SEND_FAILED: ${result.error}`);
		return { channel: "whatsapp", mode: "free_text", messageId: result.messageId };
	}

	// Template mode
	const [tpl] = await db
		.select({
			name: whatsappTemplates.name,
			language: whatsappTemplates.language,
			metaStatus: whatsappTemplates.metaStatus,
		})
		.from(whatsappTemplates)
		.where(eq(whatsappTemplates.name, cfg.templateName))
		.limit(1);
	if (!tpl) throw new Error("TEMPLATE_NOT_FOUND");
	if (tpl.metaStatus !== "APPROVED") throw new Error("TEMPLATE_NOT_APPROVED_AT_SEND_TIME");

	const resolvedParams: Record<string, string> = {};
	for (const [k, v] of Object.entries(cfg.params)) {
		resolvedParams[k] = resolveTemplateVars(v, ctx);
	}

	const result = await sendTemplate(
		ctx.lead.phone,
		tpl.name,
		tpl.language as "pt_BR" | "en_US",
		resolvedParams,
	);
	if (result.error) throw new Error(`WHATSAPP_TEMPLATE_SEND_FAILED: ${result.error}`);
	return {
		channel: "whatsapp",
		mode: "template",
		template: tpl.name,
		messageId: result.messageId,
	};
}

async function executeSendEmail(
	node: AutomationNode,
	ctx: AutomationExecutionContext,
): Promise<Record<string, unknown>> {
	if (node.type !== "action.send_email") throw new Error("wrong node type");
	const cfg = node.config;
	if (!ctx.lead.email) throw new Error("LEAD_HAS_NO_EMAIL");
	const subject = resolveTemplateVars(cfg.subject, ctx);
	const html = resolveTemplateVars(cfg.html, ctx);
	await sendEmail({ to: ctx.lead.email, subject, html });
	return { channel: "email", to: ctx.lead.email, subject };
}

async function markNodeExecutionDone(
	execId: string,
	status: "completed" | "failed",
	output: Record<string, unknown> | null,
	errorMessage: string | null = null,
) {
	await db
		.update(automationNodeExecutions)
		.set({
			status,
			completedAt: new Date(),
			output,
			errorMessage,
		})
		.where(eq(automationNodeExecutions.id, execId));
}

async function markRunCompleted(runId: string) {
	await db
		.update(automationRuns)
		.set({ status: "completed", completedAt: new Date() })
		.where(eq(automationRuns.id, runId));
}

async function markRunFailed(runId: string, errorMessage: string) {
	await db
		.update(automationRuns)
		.set({ status: "failed", completedAt: new Date(), errorMessage })
		.where(eq(automationRuns.id, runId));
}

async function markRunCancelled(runId: string) {
	await db
		.update(automationRuns)
		.set({ status: "cancelled", completedAt: new Date() })
		.where(eq(automationRuns.id, runId));
}

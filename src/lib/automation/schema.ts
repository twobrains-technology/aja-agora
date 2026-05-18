/**
 * Schemas Zod — Funnel Automations
 *
 * Fonte única da estrutura do grafo. Usado pra:
 *  - Validar payload de POST/PATCH /api/admin/automations
 *  - Validar saída do AI Builder (Vercel AI SDK generateObject)
 *  - Validar grafo antes de salvar em automations.graph (jsonb)
 *  - Validar nó antes de executar no worker
 *
 * O DB armazena graph como jsonb sem constraint — toda garantia é via Zod.
 */
import { z } from "zod";
import { type LeadStage, STAGE_ORDER } from "@/lib/admin/lead-stages";

// ─── Stage enum reutilizado ──────────────────────────────────────────────────

const LeadStageEnum = z.enum(STAGE_ORDER as unknown as [LeadStage, ...LeadStage[]]);

// ─── Trigger configs ─────────────────────────────────────────────────────────

export const TriggerStageChangedConfigSchema = z
	.object({
		fromStages: z.array(LeadStageEnum).optional(),
		toStages: z.array(LeadStageEnum).min(1, "Precisa ao menos um toStage"),
	})
	.strict();

export const TriggerIdleInStageConfigSchema = z
	.object({
		stage: LeadStageEnum,
		durationMs: z.number().int().positive(),
	})
	.strict();

export const TriggerChatEventConfigSchema = z
	.object({
		eventType: z.enum(["no_reply", "asked_for_human"]),
	})
	.strict();

// ─── Condition configs ──────────────────────────────────────────────────────

export const ConditionHasFieldConfigSchema = z
	.object({
		field: z.enum(["email", "phone", "name"]),
		op: z.enum(["is_set", "is_empty"]),
	})
	.strict();

export const ConditionRecentlyReceivedConfigSchema = z
	.object({
		channel: z.enum(["whatsapp", "web"]),
		withinMs: z.number().int().positive(),
	})
	.strict();

// ─── Action configs ─────────────────────────────────────────────────────────

export const ActionSendWhatsAppConfigSchema = z.discriminatedUnion("mode", [
	z
		.object({
			mode: z.literal("template"),
			templateName: z.string().min(1).max(512),
			// Mapeia placeholder index ({{1}}, {{2}}, ...) → valor.
			// Valor pode ser literal ou expressão tipo "{{lead.name}}".
			params: z.record(z.string(), z.string()).default({}),
		})
		.strict(),
	z
		.object({
			mode: z.literal("free_text"),
			text: z.string().min(1).max(4096),
		})
		.strict(),
]);

export const ActionSendEmailConfigSchema = z
	.object({
		subject: z.string().min(1).max(200),
		html: z.string().min(1).max(50_000),
	})
	.strict();

export const ActionMoveToStageConfigSchema = z
	.object({
		stage: LeadStageEnum,
	})
	.strict();

export const ActionAddNoteConfigSchema = z
	.object({
		text: z.string().min(1).max(2000),
	})
	.strict();

// ─── Wait / End ─────────────────────────────────────────────────────────────

export const WaitConfigSchema = z
	.object({
		durationMs: z.number().int().positive(),
	})
	.strict();

const EndConfigSchema = z.object({}).strict();

// ─── Node — discriminated union ─────────────────────────────────────────────

const PositionSchema = z.object({ x: z.number(), y: z.number() }).optional();

export const TriggerStageChangedNodeSchema = z.object({
	id: z.string().min(1),
	type: z.literal("trigger.stage_changed"),
	config: TriggerStageChangedConfigSchema,
	position: PositionSchema,
});

export const TriggerIdleInStageNodeSchema = z.object({
	id: z.string().min(1),
	type: z.literal("trigger.idle_in_stage"),
	config: TriggerIdleInStageConfigSchema,
	position: PositionSchema,
});

export const TriggerChatEventNodeSchema = z.object({
	id: z.string().min(1),
	type: z.literal("trigger.chat_event"),
	config: TriggerChatEventConfigSchema,
	position: PositionSchema,
});

export const TriggerNodeSchema = z.discriminatedUnion("type", [
	TriggerStageChangedNodeSchema,
	TriggerIdleInStageNodeSchema,
	TriggerChatEventNodeSchema,
]);

export const ConditionNodeSchema = z.discriminatedUnion("type", [
	z.object({
		id: z.string().min(1),
		type: z.literal("condition.has_field"),
		config: ConditionHasFieldConfigSchema,
		position: PositionSchema,
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("condition.recently_received"),
		config: ConditionRecentlyReceivedConfigSchema,
		position: PositionSchema,
	}),
]);

export const ActionNodeSchema = z.discriminatedUnion("type", [
	z.object({
		id: z.string().min(1),
		type: z.literal("action.send_whatsapp"),
		config: ActionSendWhatsAppConfigSchema,
		position: PositionSchema,
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("action.send_email"),
		config: ActionSendEmailConfigSchema,
		position: PositionSchema,
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("action.move_to_stage"),
		config: ActionMoveToStageConfigSchema,
		position: PositionSchema,
	}),
	z.object({
		id: z.string().min(1),
		type: z.literal("action.add_note"),
		config: ActionAddNoteConfigSchema,
		position: PositionSchema,
	}),
]);

export const WaitNodeSchema = z.object({
	id: z.string().min(1),
	type: z.literal("wait"),
	config: WaitConfigSchema,
	position: PositionSchema,
});

export const EndNodeSchema = z.object({
	id: z.string().min(1),
	type: z.literal("end"),
	config: EndConfigSchema,
	position: PositionSchema,
});

export const AutomationNodeSchema = z.union([
	TriggerNodeSchema,
	ConditionNodeSchema,
	ActionNodeSchema,
	WaitNodeSchema,
	EndNodeSchema,
]);

export type AutomationNode = z.infer<typeof AutomationNodeSchema>;

// ─── Edge ───────────────────────────────────────────────────────────────────

export const AutomationEdgeSchema = z
	.object({
		id: z.string().min(1),
		source: z.string().min(1),
		target: z.string().min(1),
		// Pra branches condicionais. Em condition node, "true" e "false" são
		// os rótulos esperados das duas saídas.
		label: z.string().optional(),
	})
	.strict();

export type AutomationEdge = z.infer<typeof AutomationEdgeSchema>;

// ─── Graph ──────────────────────────────────────────────────────────────────

export const AutomationGraphSchema = z
	.object({
		nodes: z.array(AutomationNodeSchema).min(2, "Grafo precisa ao menos trigger + end"),
		edges: z.array(AutomationEdgeSchema),
	})
	.strict();

export type AutomationGraph = z.infer<typeof AutomationGraphSchema>;

// ─── Trigger config (top-level da automation row) ────────────────────────────

export const AutomationTriggerConfigSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("stage_changed"),
		config: TriggerStageChangedConfigSchema,
	}),
	z.object({
		kind: z.literal("idle_in_stage"),
		config: TriggerIdleInStageConfigSchema,
	}),
	z.object({
		kind: z.literal("chat_event"),
		config: TriggerChatEventConfigSchema,
	}),
]);

// ─── Structural validation (CA-P1-12 + PF-04) ───────────────────────────────

const TRIGGER_TYPES = new Set([
	"trigger.stage_changed",
	"trigger.idle_in_stage",
	"trigger.chat_event",
]);

type ValidateResult = { ok: true } | { ok: false; error: string };

export function validateGraphStructure(graph: unknown): ValidateResult {
	const parseResult = AutomationGraphSchema.safeParse(graph);
	if (!parseResult.success) {
		return { ok: false, error: parseResult.error.message };
	}
	const { nodes, edges } = parseResult.data;

	// 1. exatamente 1 trigger
	const triggers = nodes.filter((n) => TRIGGER_TYPES.has(n.type));
	if (triggers.length === 0) {
		return { ok: false, error: "Grafo precisa de um trigger inicial." };
	}
	if (triggers.length > 1) {
		return { ok: false, error: "Grafo só pode ter um trigger." };
	}

	// 2. edges não podem apontar pra nodes inexistentes
	const nodeIds = new Set(nodes.map((n) => n.id));
	for (const e of edges) {
		if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
			return {
				ok: false,
				error: `Edge ${e.id} aponta pra node inexistente (${e.source} -> ${e.target}).`,
			};
		}
	}

	// 3. detectar ciclos via DFS
	const adj = new Map<string, string[]>();
	for (const n of nodes) adj.set(n.id, []);
	for (const e of edges) {
		const arr = adj.get(e.source);
		if (arr) arr.push(e.target);
	}

	const WHITE = 0;
	const GRAY = 1;
	const BLACK = 2;
	const color = new Map<string, number>();
	for (const n of nodes) color.set(n.id, WHITE);

	function dfs(nodeId: string): boolean {
		color.set(nodeId, GRAY);
		for (const next of adj.get(nodeId) ?? []) {
			const c = color.get(next);
			if (c === GRAY) return true; // back edge — ciclo
			if (c === WHITE && dfs(next)) return true;
		}
		color.set(nodeId, BLACK);
		return false;
	}

	for (const n of nodes) {
		if (color.get(n.id) === WHITE && dfs(n.id)) {
			return { ok: false, error: "Grafo contém ciclo (não é DAG)." };
		}
	}

	// 4. trigger precisa de caminho até pelo menos um end node (BFS)
	const trigger = triggers[0];
	const endIds = new Set(nodes.filter((n) => n.type === "end").map((n) => n.id));
	if (endIds.size === 0) {
		return { ok: false, error: "Grafo precisa de pelo menos um node 'end'." };
	}

	const visited = new Set<string>();
	const queue: string[] = [trigger.id];
	let reachedEnd = false;
	while (queue.length > 0) {
		const cur = queue.shift() as string;
		if (visited.has(cur)) continue;
		visited.add(cur);
		if (endIds.has(cur)) {
			reachedEnd = true;
			break;
		}
		for (const next of adj.get(cur) ?? []) queue.push(next);
	}
	if (!reachedEnd) {
		return {
			ok: false,
			error: "Trigger não tem caminho (path) até um node 'end'.",
		};
	}

	return { ok: true };
}

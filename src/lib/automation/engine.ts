/**
 * Engine puro do motor de automações.
 *
 * Sem side effects: recebe grafo + nó atual + contexto, retorna decisão.
 * O worker (Fase 4) consome essas decisões e executa ações (sendTemplate,
 * sendEmail, etc), persistindo cada passo em automation_node_executions.
 *
 * Cobre:
 *  - pickNextNodeId: decide próximo nó a partir do nó atual (com branch
 *    opcional pra condition nodes)
 *  - evaluateCondition: avalia condition node contra contexto do lead
 *  - resolveTemplateVars: interpolação simples de {{lead.field}} no texto
 *  - MAX_STEPS: guard contra loops (CA-P1-04)
 */

import type { LeadStage } from "@/lib/admin/lead-stages";
import type { AutomationGraph, AutomationNode } from "./schema";

export const MAX_STEPS = 50;

// ─── Tipos do contexto de execução ──────────────────────────────────────────

export interface AutomationLeadContext {
	id: string;
	name: string | null;
	email: string | null;
	phone: string | null;
	stage: LeadStage;
}

export interface AutomationExecutionContext {
	lead: AutomationLeadContext;
	lastInboundAt: Date | null;
	channelOfLastInbound: "whatsapp" | "web" | null;
}

// ─── pickNextNodeId ─────────────────────────────────────────────────────────

export type NextStep =
	| { kind: "next"; nodeId: string }
	| { kind: "halt" }
	| { kind: "error"; reason: string };

const CONDITION_TYPES = new Set(["condition.has_field", "condition.recently_received"]);

/**
 * Decide o próximo nó a partir do nó atual no grafo.
 * Pra condition nodes, exige `branch` no options.
 */
export function pickNextNodeId(
	graph: AutomationGraph,
	currentNodeId: string,
	options: { branch?: boolean } = {},
): NextStep {
	const current = graph.nodes.find((n) => n.id === currentNodeId);
	if (!current) return { kind: "error", reason: "node_not_found" };
	if (current.type === "end") return { kind: "halt" };

	const outgoing = graph.edges.filter((e) => e.source === currentNodeId);

	if (CONDITION_TYPES.has(current.type)) {
		if (options.branch === undefined) {
			return { kind: "error", reason: "condition_node_requires_branch" };
		}
		const label = options.branch ? "true" : "false";
		const edge = outgoing.find((e) => e.label === label);
		if (!edge) {
			return { kind: "error", reason: `condition_missing_${label}_branch` };
		}
		return { kind: "next", nodeId: edge.target };
	}

	if (outgoing.length === 0) return { kind: "halt" };
	// Caminho linear: pega o primeiro outgoing (validador garante DAG)
	return { kind: "next", nodeId: outgoing[0].target };
}

// ─── evaluateCondition ──────────────────────────────────────────────────────

export function evaluateCondition(node: AutomationNode, ctx: AutomationExecutionContext): boolean {
	if (node.type === "condition.has_field") {
		const cfg = node.config;
		const value =
			cfg.field === "email"
				? ctx.lead.email
				: cfg.field === "phone"
					? ctx.lead.phone
					: ctx.lead.name;
		const isSet = value !== null && value !== undefined && value !== "";
		return cfg.op === "is_set" ? isSet : !isSet;
	}

	if (node.type === "condition.recently_received") {
		const cfg = node.config;
		if (!ctx.lastInboundAt || ctx.channelOfLastInbound !== cfg.channel) {
			return false;
		}
		const elapsed = Date.now() - ctx.lastInboundAt.getTime();
		return elapsed <= cfg.withinMs;
	}

	throw new Error(`evaluateCondition called on non-condition node: ${node.type}`);
}

// ─── resolveTemplateVars ────────────────────────────────────────────────────

const VAR_RE = /\{\{\s*lead\.(\w+)\s*\}\}/g;

/**
 * Interpola {{lead.field}} no texto. Campos não-encontrados ficam literais
 * (não substitui pra string vazia — fica visível pro admin debugar).
 */
export function resolveTemplateVars(text: string, ctx: { lead: AutomationLeadContext }): string {
	return text.replace(VAR_RE, (full, fieldRaw: string) => {
		const field = fieldRaw as keyof AutomationLeadContext;
		const value = ctx.lead[field];
		if (value === null || value === undefined) return full;
		return String(value);
	});
}

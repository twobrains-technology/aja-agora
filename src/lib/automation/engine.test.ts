/**
 * Engine puro — decide próximo nó dado nó atual + grafo.
 * Não toca DB, não chama API. As actions concretas (sendTemplate, sendEmail,
 * etc) são side-effects e ficam no worker — engine só decide rotas.
 *
 * Cobertura: CA-P0-02 (trigger -> action -> end), CA-P1-04 (loop guard),
 * CA-P1-07 (condition branches), CA-P1-08 (recently_received true).
 */
import { describe, expect, it } from "vitest";
import { evaluateCondition, MAX_STEPS, pickNextNodeId, resolveTemplateVars } from "./engine";
import type { AutomationGraph } from "./schema";

const baseGraph = (extra: Partial<AutomationGraph> = {}): AutomationGraph => ({
	nodes: [
		{
			id: "t1",
			type: "trigger.stage_changed",
			config: { toStages: ["qualificado"] },
		},
		{
			id: "a1",
			type: "action.send_email",
			config: { subject: "x", html: "<p>x</p>" },
		},
		{ id: "e1", type: "end", config: {} },
	],
	edges: [
		{ id: "x1", source: "t1", target: "a1" },
		{ id: "x2", source: "a1", target: "e1" },
	],
	...extra,
});

describe("pickNextNodeId — caminho linear", () => {
	it("trigger -> action no caminho linear", () => {
		const g = baseGraph();
		expect(pickNextNodeId(g, "t1")).toEqual({ kind: "next", nodeId: "a1" });
	});

	it("action -> end", () => {
		const g = baseGraph();
		expect(pickNextNodeId(g, "a1")).toEqual({ kind: "next", nodeId: "e1" });
	});

	it("end -> halt", () => {
		const g = baseGraph();
		expect(pickNextNodeId(g, "e1")).toEqual({ kind: "halt" });
	});

	it("node sem outgoing edge → halt", () => {
		const g: AutomationGraph = {
			nodes: [
				{
					id: "t1",
					type: "trigger.stage_changed",
					config: { toStages: ["qualificado"] },
				},
			],
			edges: [],
		};
		expect(pickNextNodeId(g, "t1")).toEqual({ kind: "halt" });
	});
});

describe("pickNextNodeId — condition branches (CA-P1-07)", () => {
	const condGraph: AutomationGraph = {
		nodes: [
			{
				id: "t1",
				type: "trigger.stage_changed",
				config: { toStages: ["qualificado"] },
			},
			{
				id: "c1",
				type: "condition.has_field",
				config: { field: "email", op: "is_set" },
			},
			{
				id: "yes",
				type: "action.send_email",
				config: { subject: "x", html: "<p>x</p>" },
			},
			{ id: "no", type: "action.add_note", config: { text: "sem email" } },
			{ id: "e1", type: "end", config: {} },
		],
		edges: [
			{ id: "x1", source: "t1", target: "c1" },
			{ id: "x2", source: "c1", target: "yes", label: "true" },
			{ id: "x3", source: "c1", target: "no", label: "false" },
			{ id: "x4", source: "yes", target: "e1" },
			{ id: "x5", source: "no", target: "e1" },
		],
	};

	it("escolhe branch true quando boolean=true", () => {
		expect(pickNextNodeId(condGraph, "c1", { branch: true })).toEqual({
			kind: "next",
			nodeId: "yes",
		});
	});

	it("escolhe branch false quando boolean=false", () => {
		expect(pickNextNodeId(condGraph, "c1", { branch: false })).toEqual({
			kind: "next",
			nodeId: "no",
		});
	});

	it("retorna error se condition sem branch fornecido", () => {
		expect(pickNextNodeId(condGraph, "c1")).toEqual({
			kind: "error",
			reason: "condition_node_requires_branch",
		});
	});
});

describe("resolveTemplateVars — interpolação de variáveis do lead", () => {
	const ctx = {
		lead: {
			id: "lead-1",
			name: "João Silva",
			email: "joao@example.com",
			phone: "11999998888",
			stage: "qualificado" as const,
		},
	};

	it("substitui {{lead.name}} por valor real", () => {
		expect(resolveTemplateVars("Olá {{lead.name}}!", ctx)).toBe("Olá João Silva!");
	});

	it("substitui múltiplas variáveis", () => {
		expect(resolveTemplateVars("Oi {{lead.name}}, email {{lead.email}}", ctx)).toBe(
			"Oi João Silva, email joao@example.com",
		);
	});

	it("deixa literal se variável não existe", () => {
		expect(resolveTemplateVars("Saldo: {{lead.saldo}}", ctx)).toBe("Saldo: {{lead.saldo}}");
	});

	it("não interpola texto sem placeholders", () => {
		expect(resolveTemplateVars("texto fixo", ctx)).toBe("texto fixo");
	});
});

describe("evaluateCondition", () => {
	const lead = {
		id: "lead-1",
		name: "Maria",
		email: "maria@ex.com",
		phone: null as string | null,
		stage: "qualificado" as const,
	};

	it("has_field email is_set → true quando preenchido", () => {
		const result = evaluateCondition(
			{
				id: "c1",
				type: "condition.has_field",
				config: { field: "email", op: "is_set" },
			},
			{ lead, lastInboundAt: null, channelOfLastInbound: null },
		);
		expect(result).toBe(true);
	});

	it("has_field phone is_set → false quando null", () => {
		const result = evaluateCondition(
			{
				id: "c1",
				type: "condition.has_field",
				config: { field: "phone", op: "is_set" },
			},
			{ lead, lastInboundAt: null, channelOfLastInbound: null },
		);
		expect(result).toBe(false);
	});

	it("has_field phone is_empty → true quando null", () => {
		const result = evaluateCondition(
			{
				id: "c1",
				type: "condition.has_field",
				config: { field: "phone", op: "is_empty" },
			},
			{ lead, lastInboundAt: null, channelOfLastInbound: null },
		);
		expect(result).toBe(true);
	});

	it("recently_received whatsapp 24h true se lastInbound 2h atrás (CA-P1-08)", () => {
		const result = evaluateCondition(
			{
				id: "c1",
				type: "condition.recently_received",
				config: { channel: "whatsapp", withinMs: 24 * 3600_000 },
			},
			{
				lead,
				lastInboundAt: new Date(Date.now() - 2 * 3600_000),
				channelOfLastInbound: "whatsapp",
			},
		);
		expect(result).toBe(true);
	});

	it("recently_received whatsapp 24h false se inbound 25h atrás", () => {
		const result = evaluateCondition(
			{
				id: "c1",
				type: "condition.recently_received",
				config: { channel: "whatsapp", withinMs: 24 * 3600_000 },
			},
			{
				lead,
				lastInboundAt: new Date(Date.now() - 25 * 3600_000),
				channelOfLastInbound: "whatsapp",
			},
		);
		expect(result).toBe(false);
	});

	it("recently_received false se canal diferente", () => {
		const result = evaluateCondition(
			{
				id: "c1",
				type: "condition.recently_received",
				config: { channel: "whatsapp", withinMs: 24 * 3600_000 },
			},
			{
				lead,
				lastInboundAt: new Date(Date.now() - 1000),
				channelOfLastInbound: "web",
			},
		);
		expect(result).toBe(false);
	});
});

describe("MAX_STEPS (CA-P1-04 loop guard)", () => {
	it("é 50 por default", () => {
		expect(MAX_STEPS).toBe(50);
	});
});

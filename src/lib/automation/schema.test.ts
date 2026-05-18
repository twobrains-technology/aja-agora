/**
 * Schema Zod — Funnel Automations
 * TDD: testes primeiro, schema depois.
 * Cobre CA-P0-01, CA-P1-12, PF-04 do TEST-PLAN.
 */
import { describe, expect, it } from "vitest";
import {
	ActionSendWhatsAppConfigSchema,
	AutomationGraphSchema,
	AutomationNodeSchema,
	TriggerNodeSchema,
	validateGraphStructure,
	WaitNodeSchema,
} from "./schema";

describe("AutomationNodeSchema — Trigger", () => {
	it("aceita trigger stage_changed válido", () => {
		const node = {
			id: "n1",
			type: "trigger.stage_changed",
			config: { fromStages: ["engajado"], toStages: ["qualificado"] },
		};
		const parsed = TriggerNodeSchema.parse(node);
		expect(parsed.type).toBe("trigger.stage_changed");
	});

	it("rejeita trigger stage_changed com toStages vazio", () => {
		const node = {
			id: "n1",
			type: "trigger.stage_changed",
			config: { fromStages: [], toStages: [] },
		};
		expect(() => TriggerNodeSchema.parse(node)).toThrow();
	});

	it("rejeita stage inválido", () => {
		const node = {
			id: "n1",
			type: "trigger.stage_changed",
			config: { fromStages: ["novo"], toStages: ["inexistente"] },
		};
		expect(() => TriggerNodeSchema.parse(node)).toThrow();
	});

	it("aceita trigger idle_in_stage com duração positiva", () => {
		const node = {
			id: "n1",
			type: "trigger.idle_in_stage",
			config: { stage: "qualificado", durationMs: 86_400_000 },
		};
		expect(() => TriggerNodeSchema.parse(node)).not.toThrow();
	});

	it("rejeita idle_in_stage com duração negativa", () => {
		const node = {
			id: "n1",
			type: "trigger.idle_in_stage",
			config: { stage: "qualificado", durationMs: -1 },
		};
		expect(() => TriggerNodeSchema.parse(node)).toThrow();
	});
});

describe("ActionSendWhatsAppConfigSchema", () => {
	it("aceita modo template com nome + params", () => {
		const cfg = {
			mode: "template",
			templateName: "boas_vindas",
			params: { "1": "{{lead.name}}" },
		};
		expect(() => ActionSendWhatsAppConfigSchema.parse(cfg)).not.toThrow();
	});

	it("aceita modo free_text", () => {
		const cfg = { mode: "free_text", text: "olá!" };
		expect(() => ActionSendWhatsAppConfigSchema.parse(cfg)).not.toThrow();
	});

	it("rejeita free_text vazio", () => {
		const cfg = { mode: "free_text", text: "" };
		expect(() => ActionSendWhatsAppConfigSchema.parse(cfg)).toThrow();
	});

	it("rejeita template sem nome", () => {
		const cfg = { mode: "template", templateName: "", params: {} };
		expect(() => ActionSendWhatsAppConfigSchema.parse(cfg)).toThrow();
	});

	it("rejeita modo desconhecido", () => {
		const cfg = { mode: "smoke_signal", text: "foo" };
		expect(() => ActionSendWhatsAppConfigSchema.parse(cfg)).toThrow();
	});
});

describe("WaitNodeSchema", () => {
	it("aceita wait com duração positiva", () => {
		const node = { id: "n1", type: "wait", config: { durationMs: 7_200_000 } };
		expect(() => WaitNodeSchema.parse(node)).not.toThrow();
	});

	it("aceita wait longo (30d)", () => {
		const node = { id: "n1", type: "wait", config: { durationMs: 2_592_000_000 } };
		expect(() => WaitNodeSchema.parse(node)).not.toThrow();
	});

	it("rejeita wait com duração zero", () => {
		const node = { id: "n1", type: "wait", config: { durationMs: 0 } };
		expect(() => WaitNodeSchema.parse(node)).toThrow();
	});
});

describe("AutomationNodeSchema (discriminated union)", () => {
	it("aceita todos os tipos do MVP", () => {
		const samples = [
			{ id: "t1", type: "trigger.stage_changed", config: { toStages: ["qualificado"] } },
			{ id: "c1", type: "condition.has_field", config: { field: "email", op: "is_set" } },
			{
				id: "a1",
				type: "action.send_whatsapp",
				config: { mode: "free_text", text: "oi" },
			},
			{
				id: "a2",
				type: "action.send_email",
				config: { subject: "Oi", html: "<p>oi</p>" },
			},
			{ id: "a3", type: "action.move_to_stage", config: { stage: "qualificado" } },
			{ id: "a4", type: "action.add_note", config: { text: "auto-gerada" } },
			{ id: "w1", type: "wait", config: { durationMs: 1000 } },
			{ id: "e1", type: "end", config: {} },
		];
		for (const node of samples) {
			expect(() => AutomationNodeSchema.parse(node)).not.toThrow();
		}
	});

	it("rejeita type desconhecido", () => {
		const node = { id: "x", type: "action.delete_database", config: {} };
		expect(() => AutomationNodeSchema.parse(node)).toThrow();
	});
});

describe("validateGraphStructure (CA-P1-12 + PF-04)", () => {
	const trigger = {
		id: "t1",
		type: "trigger.stage_changed",
		config: { toStages: ["qualificado"] },
	};
	const end = { id: "e1", type: "end", config: {} };
	const sendEmail = {
		id: "a1",
		type: "action.send_email",
		config: { subject: "x", html: "<p>x</p>" },
	};

	it("rejeita grafo sem trigger", () => {
		const result = validateGraphStructure({ nodes: [end], edges: [] });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/trigger/i);
	});

	it("rejeita grafo com mais de um trigger", () => {
		const result = validateGraphStructure({
			nodes: [trigger, { ...trigger, id: "t2" }, end],
			edges: [
				{ id: "e1", source: "t1", target: "e1" },
				{ id: "e2", source: "t2", target: "e1" },
			],
		});
		expect(result.ok).toBe(false);
	});

	it("rejeita trigger sem caminho até end (CA-P1-12)", () => {
		const result = validateGraphStructure({
			nodes: [trigger, end],
			edges: [], // trigger solto
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/caminho|path/i);
	});

	it("aceita grafo trigger -> action -> end conectado", () => {
		const result = validateGraphStructure({
			nodes: [trigger, sendEmail, end],
			edges: [
				{ id: "x1", source: "t1", target: "a1" },
				{ id: "x2", source: "a1", target: "e1" },
			],
		});
		expect(result.ok).toBe(true);
	});

	it("rejeita ciclo no grafo", () => {
		// trigger -> action -> trigger (ciclo)
		const result = validateGraphStructure({
			nodes: [trigger, sendEmail, end],
			edges: [
				{ id: "x1", source: "t1", target: "a1" },
				{ id: "x2", source: "a1", target: "t1" },
				{ id: "x3", source: "a1", target: "e1" },
			],
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/ciclo|cycle/i);
	});

	it("rejeita edge apontando pra node inexistente", () => {
		const result = validateGraphStructure({
			nodes: [trigger, end],
			edges: [{ id: "x1", source: "t1", target: "missing" }],
		});
		expect(result.ok).toBe(false);
	});
});

describe("AutomationGraphSchema", () => {
	it("aceita grafo completo válido", () => {
		const graph = {
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
		};
		expect(() => AutomationGraphSchema.parse(graph)).not.toThrow();
	});
});

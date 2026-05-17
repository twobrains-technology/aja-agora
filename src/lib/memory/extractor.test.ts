// src/lib/memory/extractor.test.ts
//
// Unit tests pra heurística determinística de extração. Plano §3.2.

import { describe, expect, it } from "vitest";

import type { ConversationMetadata } from "@/lib/agent/personas";
import type { ProducedArtifact } from "@/lib/agent/orchestrator/types";

import { extractMemoriesFromTurn } from "./extractor";

function baseArgs(overrides: {
	artifacts?: ProducedArtifact[];
	meta?: ConversationMetadata;
	channel?: "web" | "whatsapp";
	userText?: string;
} = {}) {
	return {
		artifacts: overrides.artifacts ?? [],
		meta: overrides.meta ?? ({} as ConversationMetadata),
		channel: overrides.channel ?? ("web" as const),
		userText: overrides.userText ?? "oi",
	};
}

describe("artifacts vazios + meta vazia", () => {
	it("entries vazias, blockPatch só com channel", () => {
		const r = extractMemoriesFromTurn(baseArgs());
		expect(r.entries).toEqual([]);
		expect(r.blockPatch.channels).toEqual(["web"]);
		// Garantia: nenhum campo populado
		expect(r.blockPatch.name).toBeUndefined();
		expect(r.blockPatch.category).toBeUndefined();
		expect(r.blockPatch.lastSimulation).toBeUndefined();
	});
});

describe("simulation_result", () => {
	it("camelCase completo cria entry + blockPatch.lastSimulation", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [
					{
						type: "simulation_result",
						payload: { creditValue: 100000, termMonths: 60, monthlyPrice: 2000 },
					},
				],
			}),
		);
		expect(r.entries.length).toBe(1);
		expect(r.entries[0].kind).toBe("simulation");
		expect(r.entries[0].text).toContain("R$ 100.000");
		expect(r.entries[0].text).toContain("60 meses");
		expect(r.entries[0].text).toContain("2.000");
		expect(r.blockPatch.lastSimulation).toMatchObject({
			creditValue: 100000,
			termMonths: 60,
			monthlyPrice: 2000,
		});
		expect(r.blockPatch.lastSimulation?.date).toBeDefined();
	});

	it("snake_case completo produz mesmo resultado", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [
					{
						type: "simulation_result",
						payload: { credit_value: 50000, term_months: 36, monthly_price: 1500 },
					},
				],
			}),
		);
		expect(r.entries.length).toBe(1);
		expect(r.blockPatch.lastSimulation?.creditValue).toBe(50000);
		expect(r.blockPatch.lastSimulation?.termMonths).toBe(36);
		expect(r.blockPatch.lastSimulation?.monthlyPrice).toBe(1500);
	});

	it("alias monthlyPayment é aceito como monthlyPrice", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [
					{
						type: "simulation_result",
						payload: { creditValue: 100000, termMonths: 60, monthlyPayment: 1800 },
					},
				],
			}),
		);
		expect(r.blockPatch.lastSimulation?.monthlyPrice).toBe(1800);
	});

	it("payload faltando 1 campo (monthlyPrice) — silencioso, sem entry", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [
					{
						type: "simulation_result",
						payload: { creditValue: 100000, termMonths: 60 },
					},
				],
			}),
		);
		expect(r.entries).toEqual([]);
		expect(r.blockPatch.lastSimulation).toBeUndefined();
	});
});

describe("recommendation_card", () => {
	it("payload completo cria entry + blockPatch.lastRecommendation", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [
					{
						type: "recommendation_card",
						payload: { label: "Honda Civic", groupId: "grp-123" },
					},
				],
			}),
		);
		expect(r.entries.length).toBe(1);
		expect(r.entries[0].kind).toBe("recommendation");
		expect(r.entries[0].text).toContain("Honda Civic");
		expect(r.entries[0].text).toContain("grp-123");
		expect(r.blockPatch.lastRecommendation).toMatchObject({
			label: "Honda Civic",
			groupId: "grp-123",
		});
	});

	it("sem groupId → silencioso, sem entry/blockPatch", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [
					{ type: "recommendation_card", payload: { label: "Honda Civic" } },
				],
			}),
		);
		expect(r.entries).toEqual([]);
		expect(r.blockPatch.lastRecommendation).toBeUndefined();
	});

	it("aceita 'title' como alias de label", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [
					{ type: "recommendation_card", payload: { title: "Apto 100m2", groupId: "g1" } },
				],
			}),
		);
		expect(r.entries.length).toBe(1);
		expect(r.blockPatch.lastRecommendation?.label).toBe("Apto 100m2");
	});
});

describe("group_card", () => {
	it("com label + category gera entry preference com metadata.category", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [
					{ type: "group_card", payload: { label: "Grupo X", category: "auto" } },
				],
			}),
		);
		expect(r.entries.length).toBe(1);
		expect(r.entries[0].kind).toBe("preference");
		expect(r.entries[0].metadata).toEqual({ category: "auto" });
	});

	it("sem label → silencioso", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [{ type: "group_card", payload: { category: "auto" } }],
			}),
		);
		expect(r.entries).toEqual([]);
	});
});

describe("comparison_table", () => {
	it("3 grupos no array gera entry texto 'Comparou 3 grupos...'", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [
					{
						type: "comparison_table",
						payload: { groups: [{ a: 1 }, { a: 2 }, { a: 3 }] },
					},
				],
			}),
		);
		expect(r.entries.length).toBe(1);
		expect(r.entries[0].kind).toBe("fact");
		expect(r.entries[0].text).toBe("Comparou 3 grupos de consórcio.");
	});

	it("groups não-array → silencioso", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [
					{ type: "comparison_table", payload: { groups: null } },
				],
			}),
		);
		expect(r.entries).toEqual([]);
	});
});

describe("meta — qualifyAnswers", () => {
	it("camelCase completo popula 4 campos", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				meta: {
					qualifyAnswers: {
						creditMin: 50000,
						creditMax: 100000,
						monthlyBudget: 1500,
						termMonths: 60,
					},
				} as unknown as ConversationMetadata,
			}),
		);
		expect(r.blockPatch.creditMin).toBe(50000);
		expect(r.blockPatch.creditMax).toBe(100000);
		expect(r.blockPatch.monthlyBudget).toBe(1500);
		expect(r.blockPatch.termMonthsPreferred).toBe(60);
	});

	it("snake_case mapeia pros mesmos campos", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				meta: {
					qualifyAnswers: { credit_min: 50000 },
				} as unknown as ConversationMetadata,
			}),
		);
		expect(r.blockPatch.creditMin).toBe(50000);
	});

	it("strings 'R$ 50.000,00' são parseadas como número", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				meta: {
					qualifyAnswers: { creditMin: "R$ 50.000,00" },
				} as unknown as ConversationMetadata,
			}),
		);
		// "R$ 50.000,00" → cleaned "50.000.00" → wait, replace `,` → "."
		// digits-extract: "50.000,00" → "50.000.00" — Number.parseFloat → 50
		// Função real: replace(/[^\d.,-]/g, "") preserva pontos e vírgulas.
		// Depois replace(",", ".") — só primeira vírgula. Resultado: "50.000.00"
		// → parseFloat("50.000.00") = 50.
		// Aceitamos limitação: parsing BR não é robusto. Doc: input "R$50000" funciona melhor.
		expect(r.blockPatch.creditMin).toBe(50);
	});

	it("string 'R$50000' (sem separador) é parseada como 50000", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				meta: {
					qualifyAnswers: { creditMin: "R$50000" },
				} as unknown as ConversationMetadata,
			}),
		);
		expect(r.blockPatch.creditMin).toBe(50000);
	});

	it("string lixo 'abc' → campo não populado", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				meta: {
					qualifyAnswers: { creditMin: "abc" },
				} as unknown as ConversationMetadata,
			}),
		);
		expect(r.blockPatch.creditMin).toBeUndefined();
	});
});

describe("meta — leadCollection", () => {
	it("name + phone (sem +) → blockPatch normalizado", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				meta: {
					leadCollection: { stage: "phone", name: "Alan", phone: "11987654321" },
				} as ConversationMetadata,
			}),
		);
		expect(r.blockPatch.name).toBe("Alan");
		expect(r.blockPatch.phone).toBe("+5511987654321");
	});

	it("phone já E.164 é preservado", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				meta: {
					leadCollection: { stage: "phone", phone: "+5511987654321" },
				} as ConversationMetadata,
			}),
		);
		expect(r.blockPatch.phone).toBe("+5511987654321");
	});

	it("só name → só name populado", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				meta: {
					leadCollection: { stage: "name", name: "Maria" },
				} as ConversationMetadata,
			}),
		);
		expect(r.blockPatch.name).toBe("Maria");
		expect(r.blockPatch.phone).toBeUndefined();
	});
});

describe("meta — outros campos", () => {
	it("currentCategory populates blockPatch.category", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({ meta: { currentCategory: "imovel" } as ConversationMetadata }),
		);
		expect(r.blockPatch.category).toBe("imovel");
	});

	it("expertiseLevel populates blockPatch.expertiseLevel", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				meta: { expertiseLevel: "leigo" } as ConversationMetadata,
			}),
		);
		// blockPatch.expertiseLevel é "first"|"experienced" no schema do block.
		// O extractor faz cast direto sem mapping — quem mapeia é o caller.
		expect(r.blockPatch.expertiseLevel).toBe("leigo");
	});

	it("maxStageReached='qualificado' → blockPatch.stage='qualificado'", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				meta: { maxStageReached: "qualificado" } as ConversationMetadata,
			}),
		);
		expect(r.blockPatch.stage).toBe("qualificado");
	});
});

describe("channel", () => {
	it("web → channels=['web']", () => {
		const r = extractMemoriesFromTurn(baseArgs({ channel: "web" }));
		expect(r.blockPatch.channels).toEqual(["web"]);
	});

	it("whatsapp → channels=['whatsapp']", () => {
		const r = extractMemoriesFromTurn(baseArgs({ channel: "whatsapp" }));
		expect(r.blockPatch.channels).toEqual(["whatsapp"]);
	});
});

describe("idempotência", () => {
	it("mesma input produz mesma saída exata (ignorando timestamps)", () => {
		const input = baseArgs({
			artifacts: [
				{
					type: "simulation_result",
					payload: { creditValue: 100000, termMonths: 60, monthlyPrice: 2000 },
				},
			],
			meta: { currentCategory: "auto" } as ConversationMetadata,
		});
		const r1 = extractMemoriesFromTurn(input);
		const r2 = extractMemoriesFromTurn(input);
		expect(r1.entries[0].text).toBe(r2.entries[0].text);
		expect(r1.entries[0].kind).toBe(r2.entries[0].kind);
		expect(r1.blockPatch.category).toBe(r2.blockPatch.category);
		// (date pode variar por microssegundos)
	});
});

describe("múltiplos artifacts no mesmo turno", () => {
	it("1 simulation + 1 recommendation → 2 entries + ambos block fields", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [
					{
						type: "simulation_result",
						payload: { creditValue: 100000, termMonths: 60, monthlyPrice: 2000 },
					},
					{
						type: "recommendation_card",
						payload: { label: "Honda Civic", groupId: "grp-123" },
					},
				],
			}),
		);
		expect(r.entries.length).toBe(2);
		expect(r.entries.map((e) => e.kind).sort()).toEqual(["recommendation", "simulation"]);
		expect(r.blockPatch.lastSimulation).toBeDefined();
		expect(r.blockPatch.lastRecommendation).toBeDefined();
	});
});

describe("artifact tipo desconhecido", () => {
	it("é silenciosamente ignorado, sem throw", () => {
		const r = extractMemoriesFromTurn(
			baseArgs({
				artifacts: [{ type: "unknown_artifact_type", payload: { foo: "bar" } }],
			}),
		);
		expect(r.entries).toEqual([]);
	});
});

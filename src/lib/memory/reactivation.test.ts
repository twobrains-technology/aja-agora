// src/lib/memory/reactivation.test.ts
//
// Unit tests pra hint de reativação + system message builder. Plano §3.3.

import { describe, expect, it } from "vitest";

import { buildMemorySystemMessage, buildReactivationHint } from "./reactivation";
import type { HumanMemoryBlock, MemoryContext } from "./types";

const emptyBlock: HumanMemoryBlock = {
	schemaVersion: 1,
	objections: [],
	channels: [],
};

const blockWithSimulation: HumanMemoryBlock = {
	schemaVersion: 1,
	objections: [],
	channels: [],
	lastSimulation: {
		creditValue: 100000,
		termMonths: 60,
		monthlyPrice: 2000,
		date: "2026-05-01T12:00:00.000Z",
	},
};

const blockWithRecommendation: HumanMemoryBlock = {
	schemaVersion: 1,
	objections: [],
	channels: [],
	lastRecommendation: {
		label: "Honda Civic LX",
		groupId: "grp-123",
		date: "2026-05-01T12:00:00.000Z",
	},
};

const fullBlock: HumanMemoryBlock = {
	schemaVersion: 1,
	name: "Alan",
	stage: "qualificado",
	category: "auto",
	creditMax: 150000,
	termMonthsPreferred: 60,
	monthlyBudget: 2000,
	expertiseLevel: "first",
	channels: ["web", "whatsapp"],
	objections: ["preço alto", "medo de contemplação"],
	lastSimulation: {
		creditValue: 100000,
		termMonths: 60,
		monthlyPrice: 2000,
		date: "2026-05-01T12:00:00.000Z",
	},
	lastRecommendation: {
		label: "Honda Civic LX",
		groupId: "grp-123",
		date: "2026-05-01T12:00:00.000Z",
	},
};

describe("buildReactivationHint", () => {
	it("daysSince=null retorna null", () => {
		expect(buildReactivationHint(emptyBlock, null)).toBeNull();
	});

	it("daysSince=0 retorna null (mesma sessão)", () => {
		expect(buildReactivationHint(emptyBlock, 0)).toBeNull();
	});

	it("daysSince=1 → faixa 'voltou após 1 dia' (singular)", () => {
		const hint = buildReactivationHint(emptyBlock, 1);
		expect(hint).toContain("[REATIVAÇÃO]");
		expect(hint).toContain("após 1 dia");
		expect(hint).toContain("não recomece do zero");
	});

	it("daysSince=3 com lastSimulation → texto faixa 2-6 dias com detalhe da simulação", () => {
		const hint = buildReactivationHint(blockWithSimulation, 3);
		expect(hint).toContain("[REATIVAÇÃO]");
		expect(hint).toContain("3 dias");
		expect(hint).toContain("simulou");
		expect(hint).toContain("100.000");
	});

	it("daysSince=3 com lastRecommendation (sem sim) → menciona recomendação", () => {
		const hint = buildReactivationHint(blockWithRecommendation, 3);
		expect(hint).toContain("3 dias");
		expect(hint).toContain("recomendação");
		expect(hint).toContain("Honda Civic LX");
	});

	it("daysSince=3 sem nada → fallback 'Já tinha conversa em andamento'", () => {
		const hint = buildReactivationHint(emptyBlock, 3);
		expect(hint).toContain("3 dias");
		expect(hint).toContain("Já tinha conversa em andamento");
	});

	it("daysSince=7 usa faixa LONGA (não a 2-6)", () => {
		// O código tem `if (d < 7)` → 7 ENTRA na faixa longa.
		const hint = buildReactivationHint(emptyBlock, 7);
		expect(hint).toContain("[REATIVAÇÃO LONGA]");
		expect(hint).toContain("7 dias");
	});

	it("daysSince=8 usa faixa LONGA", () => {
		const hint = buildReactivationHint(emptyBlock, 8);
		expect(hint).toContain("[REATIVAÇÃO LONGA]");
	});

	it("daysSince=30 usa faixa LONGA + sumário", () => {
		const hint = buildReactivationHint(blockWithRecommendation, 30);
		expect(hint).toContain("[REATIVAÇÃO LONGA]");
		expect(hint).toContain("30 dias");
		expect(hint).toContain("Honda Civic LX");
		expect(hint).toContain("tom acolhedor");
	});

	it("daysSince=365 usa faixa LONGA", () => {
		const hint = buildReactivationHint(blockWithRecommendation, 365);
		expect(hint).toContain("[REATIVAÇÃO LONGA]");
		expect(hint).toContain("365 dias");
	});

	it("LONGA com creditMax mas sem lastRecommendation usa creditMax no sumário", () => {
		const block: HumanMemoryBlock = {
			schemaVersion: 1,
			objections: [],
			channels: [],
			category: "auto",
			creditMax: 80000,
		};
		const hint = buildReactivationHint(block, 30);
		expect(hint).toContain("Buscava auto");
		expect(hint).toContain("80.000");
	});

	it("daysSince=6 com lastSimulation usa faixa 2-6 (não LONGA)", () => {
		const hint = buildReactivationHint(blockWithSimulation, 6);
		expect(hint).toContain("[REATIVAÇÃO]");
		expect(hint).not.toContain("[REATIVAÇÃO LONGA]");
		expect(hint).toContain("6 dias");
	});
});

describe("buildMemorySystemMessage", () => {
	it("context=null → null", () => {
		expect(buildMemorySystemMessage(null)).toBeNull();
	});

	function ctx(over: Partial<MemoryContext> = {}): MemoryContext {
		return {
			agentId: "agent-1",
			block: over.block ?? emptyBlock,
			archivalHits: over.archivalHits ?? [],
			daysSinceLastInteraction: over.daysSinceLastInteraction ?? null,
		};
	}

	it("block totalmente vazio + sem hits + dia=null → retorna null (nada relevante)", () => {
		expect(buildMemorySystemMessage(ctx({ block: emptyBlock }))).toBeNull();
	});

	it("block só com name → contém [CONTEXTO DO USUÁRIO] e linha de nome", () => {
		const block: HumanMemoryBlock = {
			schemaVersion: 1,
			objections: [],
			channels: [],
			name: "Maria",
		};
		const out = buildMemorySystemMessage(ctx({ block }));
		expect(out).toContain("[CONTEXTO DO USUÁRIO]");
		expect(out).toContain("Nome: Maria");
	});

	it("block cheio + days=3 + 2 archival hits → 3 seções", () => {
		const out = buildMemorySystemMessage(
			ctx({
				block: fullBlock,
				daysSinceLastInteraction: 3,
				archivalHits: [
					{
						id: "p1",
						text: "Visualizou grupo Honda Civic LX",
						score: 0,
						createdAt: "2026-05-01T12:00:00.000Z",
					},
					{
						id: "p2",
						text: "Simulou R$ 100.000 em 60 meses",
						score: 0,
						createdAt: "2026-05-01T12:00:00.000Z",
					},
				],
			}),
		);
		expect(out).toContain("[CONTEXTO DO USUÁRIO]");
		expect(out).toContain("[REATIVAÇÃO]");
		expect(out).toContain("[FATOS RELEVANTES DE INTERAÇÕES PASSADAS]");
		expect(out).toContain("1. Visualizou");
		expect(out).toContain("2. Simulou");
	});

	it("5 archival hits → apenas top 3 aparecem", () => {
		const hits = [1, 2, 3, 4, 5].map((i) => ({
			id: `p${i}`,
			text: `Hit ${i}`,
			score: 0,
			createdAt: "2026-05-01T12:00:00.000Z",
		}));
		const out = buildMemorySystemMessage(
			ctx({
				block: { ...emptyBlock, name: "Alan" },
				archivalHits: hits,
			}),
		);
		expect(out).toContain("1. Hit 1");
		expect(out).toContain("2. Hit 2");
		expect(out).toContain("3. Hit 3");
		expect(out).not.toContain("Hit 4");
		expect(out).not.toContain("Hit 5");
	});

	it("category 'servicos' é renderizada com acento", () => {
		const out = buildMemorySystemMessage(ctx({ block: { ...emptyBlock, category: "servicos" } }));
		expect(out).toContain("Categoria de interesse: serviços");
	});

	it("objections array é renderizado como linha 'Objeções já levantadas: x; y'", () => {
		const out = buildMemorySystemMessage(
			ctx({
				block: {
					...emptyBlock,
					name: "Ana",
					objections: ["preço", "prazo"],
				},
			}),
		);
		expect(out).toContain("Objeções já levantadas: preço; prazo");
	});

	it("NÃO inclui linhas pra campos ausentes (regressão PO-022)", () => {
		const out = buildMemorySystemMessage(
			ctx({ block: { ...emptyBlock, name: "Alan", stage: "engajado" } }),
		);
		expect(out).not.toContain("undefined");
		expect(out).not.toContain("Crédito alvo:");
		expect(out).not.toContain("Última simulação");
		expect(out).not.toContain("Última recomendação");
		expect(out).not.toContain("Orçamento mensal");
	});
});

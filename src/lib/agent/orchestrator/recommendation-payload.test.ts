// Camada 1 — FIX-73 (QA dono-de-produto 2026-07-02, jornada AUTO web prod): o
// payload do present_recommendation_card NÃO passava por coerção server-side
// (runner.ts caía em `payload = input` cru) — diferente de simulation_result/
// contemplation_dial, que já são coagidos (coerceSimulationPayload/
// coerceDialPayload). O bug real: recomendação anunciou "R$ 70.000 / parcela
// R$ 892,48 (99,2% do teto)" mas a proposta CONTRATADA saiu "R$ 100.000 /
// parcela R$ 1.438,28" (Grupo 533) — bait-and-switch. Decisão de produto
// (Kairo): recomendar a COTA REAL — o número decisório = número contratado.
// Este módulo espelha coerceSimulationPayload: coage o card contra o retorno
// REAL do recommend_groups do mesmo turno.

import { describe, expect, it } from "vitest";
import { coerceRecommendationPayload } from "./recommendation-payload";

// Retorno REAL do recommend_groups (shape de executeRecommendGroups —
// toModelGroupSummary + score/scoreBreakdown/alternativa).
const REAL_RECOMMENDATIONS = [
	{
		id: "6a0ca9ca1b2c3d4e5f607182",
		administradora: "ÂNCORA",
		category: "auto",
		creditValue: 100_000,
		monthlyPayment: 1_438.28,
		adminFeePercent: 18,
		termMonths: 80,
		availableSlots: 4,
		contemplationRate: 4,
		score: 0.82,
		scoreBreakdown: { monthlyFit: 0.7, contemplation: 0.9, adminFee: 0.8, termMatch: 0.85 },
		alternativa: false,
	},
	{
		id: "b1c2d3e4f5061728394a5b6c",
		administradora: "CANOPUS",
		category: "auto",
		creditValue: 90_000,
		monthlyPayment: 1_200.5,
		adminFeePercent: 16,
		termMonths: 72,
		availableSlots: 3,
		contemplationRate: 3,
		score: 0.74,
		scoreBreakdown: { monthlyFit: 0.6, contemplation: 0.8, adminFee: 0.75, termMatch: 0.8 },
		alternativa: true,
	},
];

describe("FIX-73 — coerceRecommendationPayload: números do card vêm do recommend_groups REAL", () => {
	it("corrige o bug real: card fabricado (R$70k/R$892) → cota real do id casado (R$100k/R$1438,28)", () => {
		const fabricated = {
			id: "6a0ca9ca1b2c3d4e5f607182",
			administradora: "ÂNCORA",
			category: "auto",
			creditValue: 70_000,
			monthlyPayment: 892.48,
			adminFeePercent: 18,
			termMonths: 80,
			contemplationRate: 4,
			score: 0.99,
			scoreBreakdown: { monthlyFit: 0.99, contemplation: 0.9, adminFee: 0.8, termMatch: 0.85 },
		};
		const out = coerceRecommendationPayload(fabricated, { recommendations: REAL_RECOMMENDATIONS });

		expect(out.creditValue).toBe(100_000);
		expect(out.monthlyPayment).toBe(1_438.28);
		expect(out.termMonths).toBe(80);
		expect(out.id).toBe("6a0ca9ca1b2c3d4e5f607182");
		expect(out.administradora).toBe("ÂNCORA");
	});

	it("casa por id LITERAL quando presente — nunca pelo score/texto do modelo", () => {
		const input = {
			id: "b1c2d3e4f5061728394a5b6c",
			administradora: "CANOPUS",
			creditValue: 999_999, // número inventado pelo modelo
			monthlyPayment: 1,
			termMonths: 1,
		};
		const out = coerceRecommendationPayload(input, { recommendations: REAL_RECOMMENDATIONS });
		expect(out.creditValue).toBe(90_000);
		expect(out.monthlyPayment).toBe(1_200.5);
		expect(out.termMonths).toBe(72);
	});

	it("sem id casado (id fabricado/inexistente) → cai na 1ª recomendação (melhor score, já ranqueada) — nunca deixa número fabricado passar", () => {
		const input = {
			id: "auto-70k-80m", // id fabricado (padrão banco-categoria-valor-prazo — FIX-71)
			administradora: "ÂNCORA",
			creditValue: 70_000,
			monthlyPayment: 892.48,
			termMonths: 80,
		};
		const out = coerceRecommendationPayload(input, { recommendations: REAL_RECOMMENDATIONS });
		// cai no top-ranked real (índice 0 = maior score)
		expect(out.creditValue).toBe(100_000);
		expect(out.monthlyPayment).toBe(1_438.28);
		expect(out.id).toBe("6a0ca9ca1b2c3d4e5f607182");
	});

	it("coage score/scoreBreakdown/contempladosMes junto com os números de dinheiro", () => {
		const input = {
			id: "6a0ca9ca1b2c3d4e5f607182",
			administradora: "ÂNCORA",
			creditValue: 70_000,
			monthlyPayment: 892.48,
			termMonths: 80,
			score: 0.99,
			scoreBreakdown: { monthlyFit: 0.99, contemplation: 0.9, adminFee: 0.8, termMatch: 0.85 },
		};
		const out = coerceRecommendationPayload(input, { recommendations: REAL_RECOMMENDATIONS });
		expect(out.score).toBe(0.82);
		expect(out.scoreBreakdown).toEqual({
			monthlyFit: 0.7,
			contemplation: 0.9,
			adminFee: 0.8,
			termMatch: 0.85,
		});
		expect(out.contempladosMes).toBe(4);
	});

	it("sem retorno de recommend_groups no turno → payload intacto (não inventa)", () => {
		const input = { id: "x", creditValue: 100, monthlyPayment: 1, termMonths: 1 };
		expect(coerceRecommendationPayload(input, null)).toBe(input);
		expect(coerceRecommendationPayload(input, undefined)).toBe(input);
	});

	it("retorno sem recomendações utilizáveis (lista vazia/shape inválido) → payload intacto", () => {
		const input = { id: "x", creditValue: 100, monthlyPayment: 1, termMonths: 1 };
		expect(coerceRecommendationPayload(input, { recommendations: [] })).toBe(input);
		expect(coerceRecommendationPayload(input, "Sem contexto de descoberta" as never)).toBe(input);
	});
});

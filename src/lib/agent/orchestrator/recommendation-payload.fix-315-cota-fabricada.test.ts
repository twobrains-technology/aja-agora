import { describe, expect, it } from "vitest";
import {
	coerceComparisonPayload,
	coerceRecommendationPayload,
	indexRevealGroups,
	type RevealGroupIndex,
} from "./recommendation-payload";

// FIX-315 (rodada 10, onda 4 — Rodada A.3): achado real ao vivo (dossiê Mario,
// turno 8). O modelo chamou present_comparison_table com um grupo cuja
// administradora NUNCA apareceu em nenhum tool-result real desta conversa
// (id fabricado, sem correspondência em `revealGroupsById`) — a versão antiga
// de `coerceRevealCota` devolvia o input quase intacto (`{...rest}`), então
// creditValue/monthlyPayment/adminFeePercent E campos de schema inteiramente
// inventados (`awardingPattern`, `avgWinningBidPct`) chegavam ao usuário como
// se fossem dado real da Bevi. Mesma classe de bug pro `groups` chegar como
// STRING (não array) — visto ao vivo no mesmo turno.

function realGroup(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: "grupo-real-001",
		administradora: "CANOPUS",
		category: "auto",
		creditValue: 90_000,
		monthlyPayment: 1_073.52,
		adminFeePercent: 27,
		termMonths: 117,
		availableSlots: 2,
		contemplationRate: 2,
		...over,
	};
}

describe("FIX-315 — cota SEM grupo real ancorado nunca chega com número fabricado", () => {
	it("recommendation_card (hero): id fabricado (fora do index) → NENHUM campo financeiro do modelo passa", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });

		const llmInput = {
			id: "grupo-INVENTADO-que-nao-existe",
			administradora: "Banco Fictício",
			category: "auto",
			creditValue: 161_258,
			monthlyPayment: 2_984.38,
			adminFeePercent: 99,
			// campo de schema inteiramente inventado (visto ao vivo)
			awardingPattern: "sorteio e lance",
			avgWinningBidPct: 15,
		};

		const out = coerceRecommendationPayload(llmInput, index);

		expect(out.creditValue).toBeUndefined();
		expect(out.monthlyPayment).toBeUndefined();
		expect(out.adminFeePercent).toBeUndefined();
		expect(out.termMonths).toBeUndefined();
		expect(out).not.toHaveProperty("awardingPattern");
		expect(out).not.toHaveProperty("avgWinningBidPct");
	});

	it("comparison_table: cota fabricada (id fora do index) é DESCARTADA da lista, não aparece com número inventado", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });

		const llmInput = {
			groups: [
				realGroup(),
				{
					id: "grupo-INVENTADO-2",
					administradora: "Bradesco Seguros",
					category: "auto",
					creditValue: 200_000,
					monthlyPayment: 3_500,
					awardingPattern: "sorteio e lance",
					monthlyAwarded: 3,
					avgWinningBidPct: 15,
				},
			],
		};

		const out = coerceComparisonPayload(llmInput, index);
		const groups = out.groups as Record<string, unknown>[];

		expect(groups).toHaveLength(1);
		expect(groups[0]?.administradora).toBe("CANOPUS");
		expect(groups.some((g) => g.administradora === "Bradesco Seguros")).toBe(false);
	});

	it("comparison_table: `groups` chegando como STRING (não array, visto ao vivo) vira lista VAZIA — nunca passa o input cru", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });

		const llmInput = {
			groups: '[{"administradora":"Canopus","creditValue":90000,"monthlyPayment":1200,"awardingPattern":"sorteio e lance"}]',
		};

		const out = coerceComparisonPayload(llmInput, index);

		expect(Array.isArray(out.groups)).toBe(true);
		expect(out.groups as unknown[]).toHaveLength(0);
	});

	it("REGRESSÃO — grupo REAL ancorado continua coagindo os números normalmente (não quebrou o caminho feliz)", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });

		const llmInput = { ...realGroup(), creditValue: 999_999 }; // LLM tenta divergir do real
		const out = coerceRecommendationPayload(llmInput, index);

		expect(out.creditValue).toBe(90_000);
		expect(out.monthlyPayment).toBe(1_073.52);
		expect(out.administradora).toBe("CANOPUS");
	});
});

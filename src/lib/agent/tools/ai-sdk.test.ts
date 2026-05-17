import { describe, it, expect } from "vitest";
import { PRESENTATION_TOOLS, consorcioTools } from "./ai-sdk";

describe("consorcioTools — tools novas da revisão Bruna v1", () => {
	it("tem compute_scenarios (#16)", () => {
		expect(consorcioTools).toHaveProperty("compute_scenarios");
	});

	it("tem present_scenarios e está em PRESENTATION_TOOLS (#16)", () => {
		expect(consorcioTools).toHaveProperty("present_scenarios");
		expect(PRESENTATION_TOOLS.has("present_scenarios")).toBe(true);
	});

	it("tem compare_with_financing (#17)", () => {
		expect(consorcioTools).toHaveProperty("compare_with_financing");
	});

	it("tem present_topic_picker e está em PRESENTATION_TOOLS (#05)", () => {
		expect(consorcioTools).toHaveProperty("present_topic_picker");
		expect(PRESENTATION_TOOLS.has("present_topic_picker")).toBe(true);
	});

	it("recommend_groups tool retorna campos do fallback (expansionUsed, insufficientOptions) — plug #09", async () => {
		const exec = consorcioTools.recommend_groups.execute;
		if (!exec) throw new Error("recommend_groups.execute is undefined");
		const result = (await exec(
			{
				category: "imovel",
				creditMin: 100_000,
				creditMax: 1_000_000,
				budget: 5_000,
				desiredTermMonths: 200,
			},
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "test", messages: [] } as any,
		)) as {
			recommendations: Array<{ alternativa: boolean }>;
			expansionUsed: number | null;
			insufficientOptions: boolean;
		};
		expect(result).toHaveProperty("expansionUsed");
		expect(result).toHaveProperty("insufficientOptions");
		expect(result.recommendations[0]).toHaveProperty("alternativa");
	});

	// Bv2-08 — Bruna v2: parcela do comparativo divergia do detalhamento.
	// Causa raiz: LLM usa creditValue do pedido inicial (ex: 800k) em vez do
	// nominal do grupo (ex: 900k). Guardrail: simulate_quota detecta
	// divergência e retorna creditAdjustmentNotice obrigando o agente a
	// declarar o ajuste pro user. CDC art. 30/35/37.
	describe("simulate_quota guardrail Bv2-08 — creditAdjustmentNotice", () => {
		it("retorna creditAdjustmentNotice quando creditValue diverge >1% do nominal", async () => {
			const exec = consorcioTools.simulate_quota.execute;
			if (!exec) throw new Error("simulate_quota.execute undefined");
			// Pega um grupo Rodobens imovel real do mock
			const search = consorcioTools.search_groups.execute;
			if (!search) throw new Error("search_groups.execute undefined");
			const groups = (await search(
				{ category: "imovel" },
				// biome-ignore lint/suspicious/noExplicitAny: tool ctx not exported
				{ toolCallId: "t", messages: [] } as any,
			)) as { groups: Array<{ id: string; administradora: string; creditValue: number }> };
			const rodobens = groups.groups.find((g) => g.administradora === "Rodobens");
			if (!rodobens) throw new Error("grupo Rodobens não achado no mock");

			const adjustedCredit = Math.round(rodobens.creditValue * 0.85);
			const result = (await exec(
				{ groupId: rodobens.id, creditValue: adjustedCredit },
				// biome-ignore lint/suspicious/noExplicitAny: tool ctx not exported
				{ toolCallId: "t", messages: [] } as any,
			)) as {
				monthlyPayment: number;
				creditValue: number;
				creditAdjustmentNotice?: {
					requestedCreditValue: number;
					groupNominalCreditValue: number;
					message: string;
				};
			};
			expect(result.creditAdjustmentNotice).toBeDefined();
			expect(result.creditAdjustmentNotice?.requestedCreditValue).toBe(adjustedCredit);
			expect(result.creditAdjustmentNotice?.groupNominalCreditValue).toBe(rodobens.creditValue);
			expect(result.creditAdjustmentNotice?.message).toMatch(/ajust/i);
		});

		it("NÃO retorna notice quando creditValue == nominal do grupo (±1%)", async () => {
			const exec = consorcioTools.simulate_quota.execute;
			const search = consorcioTools.search_groups.execute;
			if (!exec || !search) throw new Error("tools undefined");
			const groups = (await search(
				{ category: "imovel" },
				// biome-ignore lint/suspicious/noExplicitAny: tool ctx not exported
				{ toolCallId: "t", messages: [] } as any,
			)) as { groups: Array<{ id: string; creditValue: number }> };
			const g = groups.groups[0];
			const result = (await exec(
				{ groupId: g.id, creditValue: g.creditValue },
				// biome-ignore lint/suspicious/noExplicitAny: tool ctx not exported
				{ toolCallId: "t", messages: [] } as any,
			)) as { creditAdjustmentNotice?: unknown };
			expect(result.creditAdjustmentNotice).toBeUndefined();
		});
	});

	it("preserva tools existentes (anti-regressão)", () => {
		for (const t of [
			"search_groups",
			"simulate_quota",
			"get_rates",
			"get_group_details",
			"recommend_groups",
			"present_group_card",
			"present_comparison_table",
			"present_simulation_result",
			"present_recommendation_card",
			"present_lead_form",
			"present_value_picker",
		]) {
			expect(consorcioTools, `tool '${t}' ausente`).toHaveProperty(t);
		}
	});
});

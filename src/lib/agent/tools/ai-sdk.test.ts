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

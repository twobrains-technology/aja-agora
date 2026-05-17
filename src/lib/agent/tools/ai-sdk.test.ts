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

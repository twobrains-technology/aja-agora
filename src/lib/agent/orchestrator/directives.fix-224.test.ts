import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildSearchSummaryDirective } from "./directives";

// ============================================================================
// FIX-224 — Ata 2026-07-04 (item 4.2): reordena os 3 blocos do reveal, hoje
// confusos. Decisão (AskUserQuestion, opção recomendada escolhida pelo Kairo):
// recommendation_card (opção completa) → simulation_result (aprofunda: cenário
// com lance, correção) → comparison_table (convite pra comparar, por último).
// Registrado em docs/decisoes/blocos/2026-07-04-bloco-cards-recomendacao.md.
// ============================================================================

const META: ConversationMetadata = {
	currentCategory: "auto",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	qualifyAnswers: { creditMax: 100_000, prazoMeses: 12, hasLance: "no" },
};

describe("FIX-224 — nova ordem do reveal: card → simulation_result → comparison_table", () => {
	const reveal = buildSearchSummaryDirective({ category: "auto", meta: META });

	it("a diretiva instrui present_simulation_result ANTES de present_comparison_table", () => {
		const simIdx = reveal.indexOf("present_simulation_result");
		const cmpIdx = reveal.indexOf("present_comparison_table");
		expect(simIdx).toBeGreaterThan(-1);
		expect(cmpIdx).toBeGreaterThan(-1);
		expect(simIdx).toBeLessThan(cmpIdx);
	});

	it("a linha 'A ORDEM dos cards' documenta a sequência card → simulation_result → comparison_table", () => {
		const ordem = reveal.match(/A ORDEM dos cards no reveal[\s\S]{0,400}/)?.[0] ?? "";
		const recIdx = ordem.indexOf("recommendation_card");
		const simIdx = ordem.indexOf("simulation_result");
		const cmpIdx = ordem.indexOf("comparison_table");
		expect(recIdx).toBeGreaterThan(-1);
		expect(recIdx).toBeLessThan(simIdx);
		expect(simIdx).toBeLessThan(cmpIdx);
	});

	it("comparison_table é descrito como convite pra comparar 'por último' (FIX-224)", () => {
		expect(reveal).toMatch(/comparison_table[\s\S]{0,120}por [ÚU]LTIMO/);
	});

	it("a inseparabilidade card↔comparison_table (FIX-78) segue intacta apesar do reorder", () => {
		expect(reveal).toMatch(/INSEPAR[ÁA]VE/i);
		expect(reveal).toMatch(/FIX-78/);
	});
});

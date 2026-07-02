import { describe, expect, it } from "vitest";
import { buildSearchSummaryDirective } from "./orchestrator/directives";
import type { ConversationMetadata } from "./personas";

// ============================================================================
// FIX-78 — Camada 1 (structural): inseparabilidade recommendation_card ↔
// comparison_table no ramo 2+ grupos.
// ----------------------------------------------------------------------------
// Bug real (Kairo 2026-06-25, conv a9c5effa): no reveal com 2+ grupos o agente
// chamou present_recommendation_card mas DROPOU present_comparison_table
// (artifactsEmitted = [recommendation_card, simulation_result] — comparison_table
// AUSENTE). Usuário viu só a proposta recomendada, sem o carrossel comparativo.
//
// Defesa: REGRA DURA de inseparabilidade no buildSearchSummaryDirective — no ramo
// 2+ grupos os dois cards andam SEMPRE juntos; emitir um sem o outro é defeito.
// ============================================================================

const META: ConversationMetadata = {
	currentCategory: "auto",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	qualifyAnswers: { creditMax: 100_000, prazoMeses: 12, hasLance: "no" },
};

describe("FIX-78 — directive reforça inseparabilidade dos cards do reveal (2+ grupos)", () => {
	const reveal = buildSearchSummaryDirective({ category: "auto", meta: META });

	it("o directive marca recommendation_card e comparison_table como INSEPARÁVEIS", () => {
		expect(
			/INSEPAR[ÁA]VE/i.test(reveal),
			"buildSearchSummaryDirective precisa de uma REGRA DURA de inseparabilidade dos cards do reveal.",
		).toBe(true);
	});

	it("a regra cita as duas tools coladas (recommendation_card ↔ comparison_table)", () => {
		const colado =
			/present_recommendation_card[\s\S]{0,260}present_comparison_table|present_comparison_table[\s\S]{0,260}present_recommendation_card/;
		expect(
			colado.test(reveal),
			"As duas tools têm que aparecer próximas na regra de inseparabilidade pra o modelo associar.",
		).toBe(true);
	});

	it("a regra deixa explícito que emitir um sem o outro é DEFEITO (ancora FIX-78)", () => {
		expect(reveal).toMatch(/FIX-78/);
		expect(/(defeito|nunca\s+(emita|chame)\s+um\s+sem\s+o\s+outro|um\s+sem\s+o\s+outro)/i.test(reveal)).toBe(
			true,
		);
	});

	it("o ramo 1 grupo segue intacto: NÃO chamar recommendation_card nem comparison_table", () => {
		// A inseparabilidade vale só pro ramo 2+. Com 1 grupo, a regra existente
		// (NÃO chamar nenhum dos dois) não pode ter sido afrouxada.
		expect(reveal).toMatch(/apenas 1 grupo[\s\S]{0,200}N[ÃA]O chame present_recommendation_card/i);
	});
});

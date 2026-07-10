import { describe, expect, it } from "vitest";
import { BASE_SYSTEM_INSTRUCTION, turnAnalysisSchema } from "./turn-analyzer";

// ============================================================================
// FIX-241 (rodada 2, Fable r1, D1 do veredito) — Camada 1
// ----------------------------------------------------------------------------
// `monthlySavings` já existia como TIPO em personas.ts (FIX-233) mas nunca era
// capturado por texto livre — "junto uns 4 mil por mês" nunca virava sinal, o
// dial ancorava no PRAZO DESEJADO em vez do mês em que o BOLSO cobre o lance
// (spec 03 "Âncora de dinheiro"). Este fix adiciona monthlySavings e fgtsValue
// (vertical imóvel) ao schema do analyzer.
// ============================================================================

describe("FIX-241 — slot monthlySavings (âncora de dinheiro) no analyzer", () => {
	it("o schema tem o campo monthlySavings, number nullable", () => {
		expect(turnAnalysisSchema.shape.monthlySavings).toBeDefined();
	});

	it("a descrição do schema explica o slot (poupança mensal pro lance)", () => {
		const desc = turnAnalysisSchema.shape.monthlySavings.description ?? "";
		expect(desc.toLowerCase()).toMatch(/m[êe]s/);
		expect(desc.toLowerCase()).toMatch(/lance|guardar|junta|poupa/);
	});

	it("tem exemplo few-shot mapeando 'junto uns 4 mil por mês' → monthlySavings", () => {
		expect(BASE_SYSTEM_INSTRUCTION).toMatch(/junto[\s\S]{0,40}4[\s\S]{0,20}mil[\s\S]{0,40}monthlySavings/i);
	});

	it("parse: objeto com monthlySavings numérico valida contra o schema", () => {
		const parsed = turnAnalysisSchema.safeParse({
			reasoning: "t",
			detectedCategory: null,
			detectedSubTopic: null,
			isExplicitSwitch: false,
			expertiseLevel: "neutro",
			experiencePrev: null,
			creditMin: null,
			creditMax: null,
			prazoMeses: null,
			hasLance: null,
			desiredItem: null,
			motivation: null,
			monthlySavings: 4000,
			fgtsValue: null,
			userIntent: "providing_info",
		});
		expect(parsed.success).toBe(true);
	});
});

describe("FIX-241 — slot fgtsValue (âncora de dinheiro, vertical imóvel) no analyzer", () => {
	it("o schema tem o campo fgtsValue, number nullable", () => {
		expect(turnAnalysisSchema.shape.fgtsValue).toBeDefined();
	});

	it("a descrição do schema menciona FGTS", () => {
		const desc = turnAnalysisSchema.shape.fgtsValue.description ?? "";
		expect(desc.toUpperCase()).toMatch(/FGTS/);
	});
});

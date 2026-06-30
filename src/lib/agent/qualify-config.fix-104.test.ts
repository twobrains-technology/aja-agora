import { describe, expect, it } from "vitest";
import { parseValorDoBem } from "./qualify-config";

// ============================================================================
// FIX-104 — normalização determinística do valor do bem em texto livre.
// Contrato canônico do caminho conversacional de valor (a entrada deixa de usar
// o present_value_picker; o usuário FALA o valor). O turn-analyzer (LLM) é o
// extrator de runtime; este helper é o contrato determinístico + backstop,
// consumido pelo input de texto livre do slider simples da web (bloco irmão
// web-valor-agulha — nível 3). Cobre as variações que o Kairo citou ("80 mil",
// "80k") + formatos BRL comuns.
// ============================================================================

describe("parseValorDoBem — normalização de valor do bem (FIX-104)", () => {
	it("'80 mil' e 'uns 80 mil' → 80000", () => {
		expect(parseValorDoBem("80 mil")).toBe(80_000);
		expect(parseValorDoBem("uns 80 mil")).toBe(80_000);
		expect(parseValorDoBem("quero um carro de uns 80 mil")).toBe(80_000);
	});

	it("'80k' / '80 k' → 80000", () => {
		expect(parseValorDoBem("80k")).toBe(80_000);
		expect(parseValorDoBem("80 k")).toBe(80_000);
	});

	it("formatos BRL: 'R$ 80.000' / '80000' / '80 000' → 80000", () => {
		expect(parseValorDoBem("R$ 80.000")).toBe(80_000);
		expect(parseValorDoBem("80000")).toBe(80_000);
		expect(parseValorDoBem("R$ 80.000,00")).toBe(80_000);
	});

	it("'200 mil' → 200000 e '350k' → 350000", () => {
		expect(parseValorDoBem("200 mil")).toBe(200_000);
		expect(parseValorDoBem("350k")).toBe(350_000);
	});

	it("milhão: '1,5 milhão' / '1.5 mi' / '2 milhões' → valor cheio", () => {
		expect(parseValorDoBem("1,5 milhão")).toBe(1_500_000);
		expect(parseValorDoBem("1.5 mi")).toBe(1_500_000);
		expect(parseValorDoBem("2 milhões")).toBe(2_000_000);
	});

	it("sem número → null (deixa o analyzer LLM resolver casos por extenso)", () => {
		expect(parseValorDoBem("não sei ainda")).toBeNull();
		expect(parseValorDoBem("")).toBeNull();
		expect(parseValorDoBem("oitenta mil")).toBeNull();
	});
});

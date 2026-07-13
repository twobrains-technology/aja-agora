import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

// FIX-277 (veredito r9, G1, UI/Compliance 3/10): o agente afirmou falsamente
// que a carta batia "exatamente"/"o mesmo"/"sem ajuste nenhum" com o valor
// pedido em 4 de 5 dossiês, quando creditValue (carta real) divergia de
// rawCreditValue (valor pedido) em 1,5%-6,7% — sem NENHUMA regra no prompt
// mandando comparar os dois antes de responder (CDC art. 30/37).

describe("FIX-277 — REGRA DURA: comparar rawCreditValue × creditValue antes de afirmar exatidão", () => {
	it("manda comparar rawCreditValue e creditValue quando o usuário pergunta se o valor 'bate'/é 'exato'", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/rawCreditValue/);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/creditValue/);
	});

	it("proíbe afirmar exatidão ('exatamente'/'o mesmo'/'sem ajuste') quando os valores divergem", () => {
		const lower = SPECIALIST_BASE_PROMPT.toLowerCase();
		expect(lower).toMatch(/nunca diga|nunca afirme/);
		expect(lower).toMatch(/exatamente|sem ajuste/);
	});

	it("manda reconhecer o ajuste com frase honesta (paridade com o padrão do card)", () => {
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/voc[êe] pediu.*carta real/);
	});
});

import { describe, expect, it } from "vitest";
import { collapseSelfDuplicatedText } from "./collapse-self-duplicate";

/**
 * FIX-102 — eco/duplicação de texto do assistant (degeneração NÃO-determinística
 * da LLM). Achado 2x agora em homologação (DB `c89bec1f`/`5d8ab51f`), sempre no
 * MESMO shape: a resposta inteira sai colada consigo mesma, ZERO separador —
 * "Boa, então a gente vai direto ao ponto.Boa, então a gente vai direto ao
 * ponto." / "Boa, então já sabe como funciona!Boa, então já sabe como
 * funciona!". Mitigação DECIDIDA no card (docs/correcoes/todo/bloco-h-chat-
 * render/fix-102-assistant-texto-duplicado-eco.md): guarda determinística que
 * colapsa o texto quando ele é exatamente 2 cópias idênticas coladas.
 */
describe("FIX-102: collapseSelfDuplicatedText colapsa resposta auto-duplicada da LLM", () => {
	it("colapsa o shape exato do bug real (frase colada 2x, zero separador)", () => {
		const dup = "Boa, então já sabe como funciona!Boa, então já sabe como funciona!";
		expect(collapseSelfDuplicatedText(dup)).toBe("Boa, então já sabe como funciona!");
	});

	it("colapsa o shape do card FIX-102 (2ª evidência do próprio card)", () => {
		const dup = "Boa, então a gente vai direto ao ponto.Boa, então a gente vai direto ao ponto.";
		expect(collapseSelfDuplicatedText(dup)).toBe("Boa, então a gente vai direto ao ponto.");
	});

	it("colapsa texto multi-parágrafo duplicado por inteiro", () => {
		const half = "Prazer, Kairo!\n\nVocê já fez consórcio antes?";
		expect(collapseSelfDuplicatedText(half + half)).toBe(half);
	});

	it("NÃO mexe em texto normal (sem duplicação)", () => {
		const text = "Prazer, Kairo! Você já fez consórcio antes?";
		expect(collapseSelfDuplicatedText(text)).toBe(text);
	});

	it("NÃO mexe em texto vazio", () => {
		expect(collapseSelfDuplicatedText("")).toBe("");
	});

	it("NÃO falso-positivo em repetição curta legítima (ênfase: 'Não, não, não')", () => {
		// "Não, não, não" não é duas METADES idênticas do texto inteiro — não colapsa.
		const text = "Não, não, não é isso que quis dizer.";
		expect(collapseSelfDuplicatedText(text)).toBe(text);
	});

	it("NÃO colapsa quando as duas metades são PARECIDAS mas não idênticas", () => {
		const text = "Boa, então já sabe como funciona!Boa, entao ja sabe como funciona!";
		expect(collapseSelfDuplicatedText(text)).toBe(text);
	});

	it("NÃO colapsa string de tamanho ímpar (não dá pra partir em metades iguais)", () => {
		const text = "abc";
		expect(collapseSelfDuplicatedText(text)).toBe(text);
	});
});

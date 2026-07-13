import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

// FIX-320 (rodada 10, veredito Sonnet A.4 — achado ALTA): o example GOOD da
// regra "confronto honesto de orçamento" (linha ~493) usava o rótulo da
// PRÓPRIA instrução ("seja transparente:") como abertura da fala de exemplo —
// o LLM copiou o rótulo quase verbatim pro usuário (achado ao vivo, Madalena
// T8): "A parcela ficou acima do que você pensou. Seja transparente: a
// parcela fica em R$ 3.095,28/mês...". Instrução interna virando copy do
// usuário. Fix: o example passa a demonstrar transparência através da FALA
// (frase natural), sem repetir o verbo-instrução "seja transparente" como
// abertura de sentença.
describe("SPECIALIST_BASE_PROMPT — FIX-320: example não vaza rótulo de instrução", () => {
	it("o example GOOD de confronto de orçamento não abre a fala com 'seja transparente:'", () => {
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/["“]?seja transparente:/i);
	});

	it("a regra de confronto honesto de orçamento continua presente (não removida, só reescrita)", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/confronto honesto de or[çc]amento/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/9\.828/);
	});
});

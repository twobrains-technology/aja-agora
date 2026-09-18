/**
 * AJA-12 — a PRIMEIRA resposta do agente tem que ser UMA pergunta, curta.
 *
 * O que a produção mostrou (Bruna, WhatsApp 18/09/2026 12:03–12:04): a primeira
 * mensagem do agente juntou a pergunta do bem com a lista de faixas de valor
 * ("preciso de dois dados: 1) qual bem… 2) até 50 mil, 50 a 100 mil…"). A
 * leitura dela foi literal: *"esse bando de texto aqui, perguntando duas coisas
 * ao mesmo tempo"*.
 *
 * Por que este teste asserta sobre `leanSystemPrompt(SYSTEM_PROMPT)` e não sobre
 * a constante: é o mesmo erro que `lean-prompt-entrega-as-regras.test.ts` já
 * documenta. A seção "## Fluxo de Vendas" é RECORTADA antes de ir pro modelo, e
 * foi exatamente ali que a correção anterior morreu como texto morto. Regra de
 * fala que não sobrevive ao recorte não governa fala nenhuma.
 *
 * E por que não é teste de regex contra a fala do modelo: `CLAUDE.md` — tom não
 * vira código. Esta é uma instrução de PROMPT, e o teste garante só que ela
 * chega ao modelo; quem mede a obediência é o juiz `primeira_resposta_uma_pergunta`
 * no Langfuse (`docs/design/decisoes/2026-09-18-juiz-primeira-resposta-whatsapp.md`).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { leanSystemPrompt } from "./converse";

const ENV_ORIGINAL = { ...process.env };

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

describe("AJA-12 — primeira resposta: uma pergunta, até duas frases", () => {
	// A regra vale com a vitrine ligada ou desligada (não é regra de ordem do
	// funil, é de forma da fala), então roda nos dois estados.
	for (const vitrine of [true, false]) {
		describe(`com a vitrine ${vitrine ? "ligada" : "desligada"}`, () => {
			beforeEach(() => {
				process.env.VITRINE_CPF = vitrine ? "11144477735" : "";
				process.env.VITRINE_CELULAR = vitrine ? "62992496793" : "";
			});

			it("a regra SOBREVIVE ao recorte do Fluxo de Vendas", () => {
				const lean = leanSystemPrompt(SYSTEM_PROMPT);
				// O marcador estrutural da regra. Sem ele, a correção vira texto
				// morto igual à anterior.
				expect(lean).toMatch(/REGRA DURA[^\n]*PRIMEIRA resposta/i);
			});

			it("o modelo recebe: UMA pergunta, até duas frases, sem lista e sem faixas", () => {
				const lean = leanSystemPrompt(SYSTEM_PROMPT);
				expect(lean).toMatch(/uma pergunta/i);
				expect(lean).toMatch(/duas frases/i);
				expect(lean).toMatch(/lista/i);
				expect(lean).toMatch(/faixa/i);
			});

			it("o anti-exemplo que a Bruna leu está citado como BAD", () => {
				const lean = leanSystemPrompt(SYSTEM_PROMPT);
				// "preciso de dois dados" é a fala real que abriu o incidente.
				expect(lean).toContain("preciso de dois dados");
				expect(lean).toMatch(/BAD:/);
				expect(lean).toMatch(/GOOD:/);
			});
		});
	}
});

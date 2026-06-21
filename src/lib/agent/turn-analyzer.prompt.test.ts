import { describe, expect, it } from "vitest";
import { BASE_SYSTEM_INSTRUCTION } from "./turn-analyzer";

// BUG (QA noturno E2E browser, 2026-06-21): o analyzer inferia `prazoMeses` a
// partir do ORÇAMENTO/parcela mensal ("850 por mês"), confundindo "por mês" com
// horizonte de tempo. Probe real (analyzer, 3 runs, nenhuma com prazo): 2/3
// inventaram prazo (36 e 120 — valores incompatíveis entre si = alucinação).
// Consequência: `analyze.ts` grava o prazo e o `nextGate` pula o gate
// `timeframe`; o usuário nunca vê "Em quanto tempo você gostaria de estar com
// seu bem?" (jornada-canonica §2) e o prazo errado contamina busca/objetivo.
// Camada 1 (structural): trava a regra anti-confusão no prompt do classifier.
// Comportamento real (LLM) coberto pelo eval (Camada 3) + probe empírico.
// Card: docs/correcoes/inbox/2026-06-21-analyzer-infere-prazo-de-orcamento.md
describe("BUG-ANALYZER-PRAZO-DE-ORCAMENTO — prompt veta confundir orçamento mensal com prazo", () => {
	it("tem regra explícita: orçamento/parcela mensal NÃO é prazo", () => {
		expect(BASE_SYSTEM_INSTRUCTION).toMatch(/orcamento.{0,40}n[ãa]o\s+(e|é|define|vira).{0,20}prazo/i);
	});

	it("exige menção temporal explícita para preencher prazoMeses", () => {
		expect(BASE_SYSTEM_INSTRUCTION).toMatch(/prazoMeses.{0,80}(mencao|menç[ãa]o).{0,40}tempo/i);
	});

	it("tem exemplo negativo few-shot: valor + 'por mes' SEM prazo → prazoMeses null", () => {
		expect(BASE_SYSTEM_INSTRUCTION).toMatch(/por m[êe]s[\s\S]{0,80}prazoMeses:\s*null/i);
	});

	it("preserva o exemplo positivo: menção temporal explícita ainda extrai prazo", () => {
		// "em 2 anos" -> prazoMeses: 24 (não pode ter sido removido pelo fix)
		expect(BASE_SYSTEM_INSTRUCTION).toMatch(/em 2 anos[\s\S]{0,80}prazoMeses:\s*24/i);
	});
});

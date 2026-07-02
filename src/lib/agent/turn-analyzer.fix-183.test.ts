import { describe, expect, it } from "vitest";
import { BASE_SYSTEM_INSTRUCTION, turnAnalysisSchema } from "./turn-analyzer";

// ============================================================================
// FIX-183 (conversa real da Mirella, PROD conv 69a38af1, 2026-07-01) — Camada 1
// ----------------------------------------------------------------------------
// "quero ver todos" caía em `ready_to_proceed` (avançar/decidir) e empurrava o
// agente pra decisão/simulação sobre um grupo NUNCA escolhido/exibido
// (confabulação "Embracon", Lei 3 de arquitetura-agentes-ia.md). Causa: o schema
// `userIntent` do analyzer não tinha categoria pra "quer ver MAIS do que já foi
// mostrado". Este teste trava a categoria nova no NLU (schema) + o few-shot que
// a SEPARA de `ready_to_proceed` (senão o Haiku confunde "me mostra" com "ver
// todos"). Comportamento não-determinístico do modelo é coberto pelo eval
// (Camada 3) + cassette (Camada 2, tests/regression/agent-trajectory.test.ts).
// ============================================================================

describe("FIX-183 — categoria de intent 'wants_more_options' no analyzer", () => {
	it("o enum userIntent inclui wants_more_options", () => {
		expect(turnAnalysisSchema.shape.userIntent.options).toContain("wants_more_options");
	});

	it("preserva as 6 categorias originais (não regride o vocabulário de intent)", () => {
		const opts = turnAnalysisSchema.shape.userIntent.options;
		for (const v of [
			"ready_to_proceed",
			"asking_question",
			"providing_info",
			"expressing_doubt",
			"off_topic",
			"neutral",
		]) {
			expect(opts).toContain(v);
		}
	});

	it("a descrição do schema define wants_more_options e o separa de ready_to_proceed", () => {
		const desc = turnAnalysisSchema.shape.userIntent.description ?? "";
		expect(desc).toMatch(/wants_more_options\s*=/);
		// a definição fala em ver MAIS/TODOS/OUTRAS opções ALÉM das já mostradas
		expect(desc.toLowerCase()).toMatch(/mais|todos|outras/);
	});

	it("tem exemplo few-shot mapeando 'ver todos/mais' → wants_more_options", () => {
		expect(BASE_SYSTEM_INSTRUCTION).toMatch(/ver (todos|mais)[\s\S]{0,80}wants_more_options/i);
	});

	it("preserva o exemplo de ready_to_proceed pra 'bora ver as opções' (avanço ≠ ver-mais)", () => {
		expect(BASE_SYSTEM_INSTRUCTION).toMatch(/bora ver as op[çc][õo]es[\s\S]{0,60}ready_to_proceed/i);
	});
});

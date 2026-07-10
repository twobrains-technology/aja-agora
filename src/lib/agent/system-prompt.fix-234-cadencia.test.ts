/**
 * Camada 1 — FIX-234 (handoff agente-vendas-consorcio, 2026-07-09): cadência
 * consultiva "1 balão = 1 ideia completa" + léxico banido + emoji com
 * parcimônia. Complementa a defesa em profundidade do sanitizer.ts (que dropa
 * em runtime se o modelo escapar) com a instrução no prompt.
 */
import { describe, expect, it } from "vitest";
import { SHARED_SPECIALIST_EXAMPLES, SPECIALIST_BASE_PROMPT } from "./system-prompt";

describe("FIX-234 — cadência do balão (1 balão = 1 ideia completa)", () => {
	it("instrui '1 balão = 1 ideia completa' com a faixa de 2-3 linhas", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/1\s*bal[ãa]o\s*=\s*1\s*ideia/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/2[-–]3\s*linhas/);
	});

	it("veta o paredão E o picotado (nem um nem outro)", () => {
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/pared[ãa]o/);
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/picotad/);
	});
});

describe("FIX-234 — léxico banido explícito no prompt", () => {
	it("bane 'saco', 'furar a fila', 'carro-problema', 'na sua cabeça'", () => {
		const p = SPECIALIST_BASE_PROMPT.toLowerCase();
		expect(p).toMatch(/saco/);
		expect(p).toMatch(/furar a fila/);
		expect(p).toMatch(/carro-problema/);
		expect(p).toMatch(/na sua cabe[çc]a/);
	});

	it("tem os substitutos ✅ (antecipar a contemplação / qual carro você tem em mente)", () => {
		const p = SPECIALIST_BASE_PROMPT.toLowerCase();
		expect(p).toMatch(/antecipar a contempla[çc][ãa]o/);
		expect(p).toMatch(/qual carro voc[êe] tem em mente/);
	});
});

describe("FIX-234 — emoji com parcimônia (não proibição total)", () => {
	it("instrui emoji no máximo 1 a cada 3-4 balões", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/emoji.{0,40}1\s*a\s*cada\s*3[-–]4/i);
	});
});

describe("FIX-234 — exemplos ❌/✅ de tom consultivo no few-shot", () => {
	it("SHARED_SPECIALIST_EXAMPLES tem pelo menos 1 exemplo com o par 'entendo bem'", () => {
		const hasEntendoBem = SHARED_SPECIALIST_EXAMPLES.some((e) =>
			/entendo bem/i.test(e.assistantResponse),
		);
		expect(hasEntendoBem).toBe(true);
	});
});

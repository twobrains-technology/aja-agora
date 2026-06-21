import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

// ============================================================================
// FIX-53 (jornada2_revisão.docx — Bernardo, 2026-06-19): "Precisa pedir os
// dados, antes do valor" + "Voltou a pedir o valor". Camada 1: o prompt fixa a
// ordem (identidade ANTES do valor) e proíbe re-pedir o valor já coletado,
// explicando que o SERVIDOR reforça (não é só boa vontade do LLM).
// ============================================================================

describe("FIX-53 — system-prompt: identidade antes do valor + anti-repetição", () => {
	const p = SPECIALIST_BASE_PROMPT.toLowerCase();

	it("ordem: identidade (CPF/celular) vem ANTES do valor", () => {
		expect(p).toMatch(/identidade antes do valor/);
		expect(p).toMatch(/cpf e celular/);
	});

	it("anti-repetição: valor já coletado → confirma e segue, NUNCA re-pergunta/re-mostra o picker", () => {
		expect(p).toMatch(/valor j[áa] coletado/);
		expect(p).toMatch(/nunca.*re-?perguntar|nunca.*re-?pedir|nunca volta a perguntar/);
		expect(p).toMatch(/present_value_picker/);
	});

	it("enforcement: o SERVIDOR reforça (não é só boa vontade do LLM)", () => {
		expect(p).toMatch(/servidor/);
	});

	it("referência ao bug da revisão 2 ('voltou a pedir o valor')", () => {
		expect(p).toMatch(/voltou a pedir o valor/);
	});
});

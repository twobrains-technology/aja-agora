import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

// ============================================================================
// FIX-53 (jornada2_revisão.docx — Bernardo, 2026-06-19): "Precisa pedir os
// dados, antes do valor" + "Voltou a pedir o valor" — HISTÓRICO.
//
// FIX-296 (rodada 10, 2026-07-12) REVERTE conscientemente a ordem: o mockup
// novo pede "valor antes dos dados" (rapport antes de dados). Este arquivo
// mantém o nome (histórico do FIX-53) mas a premissa se INVERTEU: prova que o
// prompt agora fixa a ordem NOVA (valor ANTES da identidade), mantendo a
// anti-repetição do valor e o reforço do SERVIDOR.
// ============================================================================

describe("FIX-53/FIX-296 — system-prompt: valor antes da identidade + anti-repetição", () => {
	const p = SPECIALIST_BASE_PROMPT.toLowerCase();

	it("ordem: valor vem ANTES da identidade (CPF/celular) — reversão FIX-296", () => {
		expect(p).toMatch(/valor antes da identidade/);
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

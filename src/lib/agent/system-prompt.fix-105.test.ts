import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

// ============================================================================
// FIX-105 — qualificação híbrida explícita no prompt.
// Binárias (experiência, lance) = botão; valor do bem = conversa. O prompt
// precisa deixar o princípio EXPLÍCITO pro modelo não robotizar (menu atrás de
// menu) nem pedir o valor via componente.
// ============================================================================

describe("FIX-105 — prompt descreve a qualificação híbrida", () => {
	it("o prompt afirma o princípio híbrido: binárias = botão, valor = conversa", () => {
		const p = SPECIALIST_BASE_PROMPT.toLowerCase();
		// Menciona o conceito de híbrido / binária × aberta.
		expect(p).toMatch(/h[íi]brid/);
		// Binárias ligadas a botão.
		expect(p).toMatch(/bin[áa]ri[ao]s?[\s\S]{0,80}bot[ãa]o/);
		// Valor ligado a conversa.
		expect(p).toMatch(/valor[\s\S]{0,80}conversa/);
	});

	it("o prompt cita as binárias concretas (experiência e lance) como botão", () => {
		const p = SPECIALIST_BASE_PROMPT.toLowerCase();
		expect(p).toMatch(/experi[êe]ncia/);
		expect(p).toMatch(/lance/);
	});
});

import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "./system-prompt";

// ============================================================================
// FIX-104 (revisão da jornada de entrada — Kairo 2026-06-28)
// ----------------------------------------------------------------------------
// "usuario so vai falar o valor agora ... nao tem mais aquele componente
// complexo sobre o valor bem". O valor do bem passa a ser coletado por CONVERSA
// (texto livre, normalizado). O agente NÃO emite present_value_picker na entrada.
// A tool segue existindo (a WEB apoia via slider simples — bloco irmão), mas o
// agente não a dispara na entrada da jornada.
// ============================================================================

describe("FIX-104 — valor do bem por conversa (sem value_picker na entrada)", () => {
	it("o prompt NÃO manda mais 'NUNCA pergunte valores por texto' acoplado a present_value_picker", () => {
		// Regra ANTIGA (oposta ao FIX-104): "NUNCA pergunte valores por texto. Use
		// present_value_picker". Não pode reaparecer em nenhum dos prompts.
		const regraAntiga = /NUNCA pergunte valores? por texto[\s\S]{0,200}present_value_picker/i;
		expect(regraAntiga.test(SYSTEM_PROMPT)).toBe(false);
		expect(regraAntiga.test(SPECIALIST_BASE_PROMPT)).toBe(false);
	});

	it("o prompt instrui coletar o valor do bem por CONVERSA", () => {
		const combined = `${SYSTEM_PROMPT}\n${SPECIALIST_BASE_PROMPT}`;
		// Deve haver instrução explícita de valor por conversa.
		expect(combined).toMatch(/valor do bem[\s\S]{0,120}(conversa|texto)/i);
	});

	it("SPECIALIST_BASE_PROMPT proíbe emitir present_value_picker na entrada", () => {
		// O agente nunca dispara o seletor na entrada — o valor é conversacional.
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/N(Ã|A)O (emita|emite|chame|mostre)[\s\S]{0,80}present_value_picker/i,
		);
	});

	it("a ordem da coleta descreve o valor como conversa, não como seletor disparado pelo sistema", () => {
		// Antes: "4. valor do bem — o seletor (present_value_picker), disparado pelo SISTEMA".
		// Agora o item de valor menciona CONVERSA.
		const ordemSeletor = /valor do bem[\s\S]{0,40}seletor \(present_value_picker\), disparado pelo SISTEMA/i;
		expect(ordemSeletor.test(SPECIALIST_BASE_PROMPT)).toBe(false);
	});
});

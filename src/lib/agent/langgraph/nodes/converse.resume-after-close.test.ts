// FIX-368 (rodada 3 — veredito do juiz sobre a rodada 2, réplica exigida):
// regressão exigida pelo card original — "é assertable que a SEÇÃO existe no
// prompt final quando as condições batem". `resumeAfterCloseSection` é pura
// (extraída de `createConverseNode` na rodada 3, junto com o replantio no
// LangGraph) justamente pra não depender de montar o grafo/mockar o modelo.

import { describe, expect, it } from "vitest";
import { resumeAfterCloseSection } from "./converse";

describe("resumeAfterCloseSection (FIX-368)", () => {
	it("contractClosed=true + isResumeGreeting=true → seção presente, cita a administradora e WhatsApp", () => {
		const section = resumeAfterCloseSection(true, true, "ITAÚ");
		expect(section).not.toBeNull();
		expect(section).toContain("ITAÚ");
		expect(section).toContain("WhatsApp");
		expect(section).toContain("REGRA DURA");
	});

	it("sem administradora conhecida → cai no fallback genérico, não quebra nem deixa placeholder vazio", () => {
		const section = resumeAfterCloseSection(true, true, null);
		expect(section).toContain("administradora escolhida");
	});

	it("contractClosed=false (proposta NÃO fechada) → null, mesmo com isResumeGreeting=true", () => {
		expect(resumeAfterCloseSection(false, true, "ITAÚ")).toBeNull();
	});

	it("isResumeGreeting=false (turno normal pós-fechamento, não é a retomada) → null, mesmo com contractClosed=true", () => {
		// Turno normal pós-fechamento é coberto por `blocoFechamento`
		// (contestação/pergunta de status) — não deve duplicar a instrução.
		expect(resumeAfterCloseSection(true, false, "ITAÚ")).toBeNull();
	});

	it("ambos false → null", () => {
		expect(resumeAfterCloseSection(false, false, "ITAÚ")).toBeNull();
	});

	it("REGRA DURA proíbe explicitamente os 3 sintomas observados na rodada 1 (3/3 personas)", () => {
		const section = resumeAfterCloseSection(true, true, "ITAÚ") ?? "";
		// persona 1 (Helena): "travou em alguma parte do formulário"
		expect(section).toContain("travou em alguma parte do formulário");
		// persona 2 (Diego): re-perguntar decisão de cenário já tomada
		expect(section).toContain("não re-pergunte uma decisão");
		// persona 3 (Renata): "seguir com a contratação"
		expect(section).toContain('"seguir com a contratação"');
	});
});

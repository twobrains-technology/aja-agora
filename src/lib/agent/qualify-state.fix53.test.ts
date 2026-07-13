import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

// ============================================================================
// FIX-53 (jornada2_revisão.docx — teste manual Bernardo, 2026-06-19)
// ----------------------------------------------------------------------------
// Stakeholder pediu na revisão 2: "Precisa pedir os dados, antes do valor" e
// "Voltou a pedir o valor". O gate `identify` (CPF+celular+LGPD) — que era o
// ÚLTIMO da qualificação — sobe para ANTES do gate `credit` (o seletor de
// valor / present_value_picker). FIX-274 removeu o consent: o identify é o
// primeiro gate estruturado logo após o `desire`. Anti-repetição do valor
// continua garantida pela máquina (gate já respondido não re-dispara).
// ============================================================================

describe("FIX-53 — gate identify ANTES do valor (credit/present_value_picker)", () => {
	const base: ConversationMetadata = {
		desireAsked: true,
		currentCategory: "auto",
	};

	it("logo após o desire, sem identidade → identify (NUNCA credit/valor)", () => {
		expect(nextGate(base, { hasContactName: true })).toBe("identify");
	});

	it("identify precede a coleta de valor — qualificação parcial sem identidade → identify", () => {
		// Mesmo com valor já volunteered, sem identidade o funil cobra identify primeiro.
		expect(
			nextGate(
				{ ...base, qualifyAnswers: { creditMax: 80_000, prazoMeses: 12 } },
				{ hasContactName: true },
			),
		).toBe("identify");
	});

	it("com identidade coletada, AÍ SIM o próximo é o valor (credit)", () => {
		expect(nextGate({ ...base, identityCollected: true }, { hasContactName: true })).toBe("credit");
	});

	it("valor já coletado NÃO re-dispara credit (segue search) — anti-repetição (FIX-103/FIX-215)", () => {
		expect(
			nextGate(
				{ ...base, identityCollected: true, qualifyAnswers: { creditMax: 80_000 } },
				{ hasContactName: true },
			),
		).toBe("search");
	});

	it("FIX-274: sem desireAsked, o funil ainda está no desire — só depois vem o identify", () => {
		const semDesire: ConversationMetadata = {
			currentCategory: "auto",
		};
		expect(nextGate(semDesire, { hasContactName: true })).toBe("desire");
	});

	it("ordem pós-qualificação intacta: identidade + qualificação completa → search", () => {
		expect(
			nextGate(
				{
					...base,
					identityCollected: true,
					qualifyAnswers: {
						creditMax: 80_000,
						prazoMeses: 12,
						hasLance: "no",
						lanceEmbutido: false,
					},
				},
				{ hasContactName: true },
			),
		).toBe("search");
	});
});

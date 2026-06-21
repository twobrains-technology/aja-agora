import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

// ============================================================================
// FIX-53 (jornada2_revisão.docx — teste manual Bernardo, 2026-06-19)
// ----------------------------------------------------------------------------
// Stakeholder pediu na revisão 2: "Precisa pedir os dados, antes do valor" e
// "Voltou a pedir o valor". O gate `identify` (CPF+celular+LGPD) — que era o
// ÚLTIMO da qualificação — sobe para ANTES do gate `credit` (o seletor de
// valor / present_value_picker), logo após o consent. Anti-repetição do valor
// continua garantida pela máquina (gate já respondido não re-dispara).
// ============================================================================

describe("FIX-53 — gate identify ANTES do valor (credit/present_value_picker)", () => {
	const base: ConversationMetadata = {
		currentCategory: "auto",
		experiencePrev: "first",
		qualifyConsented: true,
	};

	it("logo após o consent, sem identidade → identify (NUNCA credit/valor)", () => {
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

	it("valor já coletado NÃO re-dispara credit (segue timeframe) — anti-repetição", () => {
		expect(
			nextGate(
				{ ...base, identityCollected: true, qualifyAnswers: { creditMax: 80_000 } },
				{ hasContactName: true },
			),
		).toBe("timeframe");
	});

	it("antes do consent o funil ainda não chega no identify (consent primeiro)", () => {
		const semConsent: ConversationMetadata = {
			currentCategory: "auto",
			experiencePrev: "first",
		};
		expect(nextGate(semConsent, { hasContactName: true })).toBe("consent");
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

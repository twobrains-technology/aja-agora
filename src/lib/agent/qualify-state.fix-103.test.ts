import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { type Gate, nextGate } from "./qualify-state";

// ============================================================================
// FIX-103 (revisão da jornada de entrada — decisão Kairo 2026-06-28)
// ----------------------------------------------------------------------------
// "usuario so vai falar o valor agora, prazo nao." O gate `timeframe` (prazo
// desejado de contemplação) SAI da qualificação. O campo `prazoMeses` e o tipo
// `Gate` (com "timeframe") seguem existindo por compat com consumidores fora do
// escopo deste bloco (web/whatsapp/orchestrator), mas `nextGate` NUNCA mais
// emite o gate — o funil pula direto de `credit` (valor) pra `lance`.
// ============================================================================

/** Percorre o funil do zero até o terminal, respondendo cada gate como o
 * usuário faria — SEM nunca preencher `prazoMeses` (o usuário não responde mais
 * prazo). Prova que o funil converge sem travar esperando o prazo. */
function walkFunnelSemPrazo(opts: { hasLance: "yes" | "no" }): Gate[] {
	let meta: ConversationMetadata = {};
	let hasName = false;
	const seq: Gate[] = [];

	for (let i = 0; i < 24; i++) {
		const gate = nextGate(meta, { hasContactName: hasName });
		seq.push(gate);
		const q = meta.qualifyAnswers ?? {};
		switch (gate) {
			case "name":
				hasName = true;
				break;
			case "experience":
				meta = { ...meta, experiencePrev: "first" };
				break;
			case "consent":
				meta = { ...meta, qualifyConsented: true };
				break;
			case "identify":
				meta = { ...meta, identityCollected: true };
				break;
			case "credit":
				meta = { ...meta, qualifyAnswers: { ...q, creditMax: 80_000 } };
				break;
			case "lance":
				meta = { ...meta, qualifyAnswers: { ...q, hasLance: opts.hasLance } };
				break;
			case "lance-value":
				meta = { ...meta, qualifyAnswers: { ...q, lanceValue: 8_000 } };
				break;
			case "lance-embutido":
				meta = { ...meta, qualifyAnswers: { ...q, lanceEmbutido: false } };
				break;
			case "search":
				meta = { ...meta, searchDispatched: true, revealCompleted: true };
				break;
			case "simulator-offer":
				meta = { ...meta, simulatorOfferDispatched: true };
				break;
			case "decision":
				return seq; // terminal
			default:
				return seq;
		}
	}
	return seq;
}

describe("FIX-103 — gate de prazo (timeframe) fora da qualificação", () => {
	it("o funil completo NUNCA passa pelo gate timeframe (sem lance)", () => {
		const seq = walkFunnelSemPrazo({ hasLance: "no" });
		expect(seq).not.toContain("timeframe");
		expect(seq).toEqual([
			"name",
			"experience",
			"consent",
			"identify",
			"credit",
			"lance",
			"lance-embutido",
			"search",
			"simulator-offer",
			"decision",
		]);
	});

	it("o funil completo NUNCA passa pelo gate timeframe (com lance)", () => {
		const seq = walkFunnelSemPrazo({ hasLance: "yes" });
		expect(seq).not.toContain("timeframe");
		expect(seq).toEqual([
			"name",
			"experience",
			"consent",
			"identify",
			"credit",
			"lance",
			"lance-value",
			"lance-embutido",
			"search",
			"simulator-offer",
			"decision",
		]);
	});

	it("valor coletado segue DIRETO pra lance (não re-pede prazo)", () => {
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 80_000 },
		};
		// Antes do FIX-103 isto retornava "timeframe"; agora pula direto pro lance.
		expect(nextGate(meta, { hasContactName: true })).toBe("lance");
	});

	it("nextGate NUNCA retorna timeframe mesmo com prazoMeses ausente em qualquer combinação de qualifyAnswers", () => {
		const base: ConversationMetadata = {
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			identityCollected: true,
		};
		const combos: ConversationMetadata[] = [
			{ ...base, qualifyAnswers: { creditMax: 80_000 } },
			{ ...base, qualifyAnswers: { creditMax: 80_000, hasLance: "no" } },
			{ ...base, qualifyAnswers: { creditMax: 80_000, hasLance: "yes" } },
			{ ...base, qualifyAnswers: { creditMax: 80_000, hasLance: "yes", lanceValue: 8_000 } },
		];
		for (const meta of combos) {
			expect(nextGate(meta, { hasContactName: true })).not.toBe("timeframe");
		}
	});
});

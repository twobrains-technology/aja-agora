import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { type Gate, nextGate } from "./qualify-state";

// ============================================================================
// FIX-103 (revisão da jornada de entrada — decisão Kairo 2026-06-28) REVERTIDO
// pelo FIX-233 (handoff agente-vendas-consorcio, decisão Kairo 2026-07-09, D1).
// ----------------------------------------------------------------------------
// O FIX-103 tinha REMOVIDO o gate `timeframe` da qualificação ("usuario so vai
// falar o valor agora, prazo nao"). O handoff pediu o prazo de volta como a
// ponte natural pro simulador de contemplação — o Kairo decidiu reintroduzir
// (ADR docs/decisoes/blocos/2026-07-09-agente-vendas-consorcio.md, D1), agora
// PÓS-recomendação (depois do reveal + experience), não mais na entrada.
//
// Este arquivo mantém o nome (histórico do FIX-103) mas a premissa se
// INVERTEU: prova que `timeframe` VOLTA a aparecer, na nova posição.
// ============================================================================

/** Percorre o funil do zero até o terminal, respondendo cada gate como o
 * usuário faria — incluindo o prazo (timeframe), agora pós-recomendação. */
function walkFunnelComPrazo(opts: { hasLance: "yes" | "no" }): Gate[] {
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
			case "desire":
				meta = { ...meta, desireAsked: true };
				break;
			case "identify":
				meta = { ...meta, identityCollected: true };
				break;
			case "credit":
				meta = { ...meta, qualifyAnswers: { ...q, creditMax: 80_000 } };
				break;
			case "search":
				meta = { ...meta, searchDispatched: true, revealCompleted: true };
				break;
			case "experience":
				meta = { ...meta, experiencePrev: "first" };
				break;
			case "timeframe":
				meta = { ...meta, qualifyAnswers: { ...q, prazoMeses: 6 } };
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

describe("FIX-103 revertido pelo FIX-233 — gate de prazo (timeframe) VOLTA, pós-recomendação", () => {
	it("o funil completo PASSA pelo gate timeframe, depois de experience e antes de lance (sem lance)", () => {
		const seq = walkFunnelComPrazo({ hasLance: "no" });
		expect(seq).toContain("timeframe");
		expect(seq).toEqual([
			"name",
			"desire",
			"identify",
			"credit",
			"search",
			"experience",
			"timeframe",
			"lance",
			"lance-embutido",
			"simulator-offer",
			"decision",
		]);
	});

	it("o funil completo PASSA pelo gate timeframe (com lance)", () => {
		const seq = walkFunnelComPrazo({ hasLance: "yes" });
		expect(seq).toContain("timeframe");
		expect(seq).toEqual([
			"name",
			"desire",
			"identify",
			"credit",
			"search",
			"experience",
			"timeframe",
			"lance",
			"lance-value",
			"lance-embutido",
			"simulator-offer",
			"decision",
		]);
	});

	it("valor coletado + reveal completo, SEM experience/timeframe respondidos → nextGate pede experience primeiro", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			currentCategory: "auto",
			qualifyConsented: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 80_000 },
			searchDispatched: true,
			revealCompleted: true,
		};
		expect(nextGate(meta, { hasContactName: true })).toBe("experience");
	});

	it("experience respondido, timeframe (prazoMeses) ainda ausente → nextGate pede timeframe (nunca pula direto pro lance)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			currentCategory: "auto",
			qualifyConsented: true,
			identityCollected: true,
			experiencePrev: "first",
			qualifyAnswers: { creditMax: 80_000 },
			searchDispatched: true,
			revealCompleted: true,
		};
		expect(nextGate(meta, { hasContactName: true })).toBe("timeframe");
	});

	it("timeframe respondido (prazoMeses definido) → nextGate segue pro lance, nunca re-pede timeframe", () => {
		const base: ConversationMetadata = {
			desireAsked: true,
			currentCategory: "auto",
			qualifyConsented: true,
			identityCollected: true,
			experiencePrev: "first",
			searchDispatched: true,
			revealCompleted: true,
		};
		const combos: ConversationMetadata[] = [
			{ ...base, qualifyAnswers: { creditMax: 80_000, prazoMeses: 0 } },
			{ ...base, qualifyAnswers: { creditMax: 80_000, prazoMeses: 6, hasLance: "no" } },
			{ ...base, qualifyAnswers: { creditMax: 80_000, prazoMeses: 12, hasLance: "yes" } },
		];
		for (const meta of combos) {
			expect(nextGate(meta, { hasContactName: true })).not.toBe("timeframe");
		}
	});
});

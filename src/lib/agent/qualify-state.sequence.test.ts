import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { type Gate, nextGate } from "./qualify-state";

// ============================================================================
// Sequência canônica COMPLETA do funil (jornada-canonica.md passo 2 + FIX-53
// + FIX-215/Refino Ata 2026-07-04). Encadeia nextGate respondendo cada gate
// como o usuário faria, e prova a ORDEM real ponta-a-ponta — o que faltava:
// os testes existentes cobrem cada transição isolada, não a progressão inteira.
//
// Ordem ATUAL (Ata 2026-07-04, item 1 — P0, SUPERSEDE o docx original): valor
// → busca/reveal DIRETO → só DEPOIS a conversa de lance. FIX-53 (revisão 2):
// identidade (CPF+celular) ANTES do valor. FIX-103 (2026-06-28): o gate de
// PRAZO (timeframe) saiu da qualificação. FIX-215 moveu lance/lance-value/
// lance-embutido do PRÉ-search (entre credit e search) pro PÓS-reveal (entre
// search e simulator-offer) — reverte a COLOCAÇÃO de FIX-92/118/212, não o
// conceito. Provado aqui contra regressão de reordenação.
// ============================================================================

/** Percorre o funil do zero até `decision`, respondendo cada gate. */
function walkFunnel(opts: { hasLance: "yes" | "no" }): Gate[] {
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

describe("funil — sequência canônica completa (docx passo 2 + FIX-53 + FIX-103 + FIX-215)", () => {
	it("sem lance: busca/reveal vem DIRETO após o valor; lance só pós-reveal; SEM gate de prazo", () => {
		const seq = walkFunnel({ hasLance: "no" });
		expect(seq).not.toContain("timeframe");
		expect(seq).toEqual([
			"name",
			"experience",
			"consent",
			"identify",
			"credit",
			"search",
			"lance",
			"lance-embutido",
			"simulator-offer",
			"decision",
		]);
	});

	it("com lance: lance-value entra logo após lance, ambos pós-reveal; SEM gate de prazo", () => {
		const seq = walkFunnel({ hasLance: "yes" });
		expect(seq).not.toContain("timeframe");
		expect(seq).toEqual([
			"name",
			"experience",
			"consent",
			"identify",
			"credit",
			"search",
			"lance",
			"lance-value",
			"lance-embutido",
			"simulator-offer",
			"decision",
		]);
	});

	it("INVARIANTE FIX-53/FIX-103/FIX-215: identify < credit < search < lance; prazo fora do funil", () => {
		const seq = walkFunnel({ hasLance: "no" });
		const idx = (g: Gate) => seq.indexOf(g);
		// identidade antes do valor (FIX-53)
		expect(idx("identify")).toBeLessThan(idx("credit"));
		// valor antes da busca/reveal (Ata 2026-07-04: busca direto após o valor)
		expect(idx("credit")).toBeLessThan(idx("search"));
		// FIX-215: busca/reveal vem ANTES do lance (não o contrário)
		expect(idx("search")).toBeLessThan(idx("lance"));
		// FIX-103: prazo (timeframe) não existe mais no funil
		expect(idx("timeframe")).toBe(-1);
	});
});

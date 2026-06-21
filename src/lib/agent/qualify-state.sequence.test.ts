import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { type Gate, nextGate } from "./qualify-state";

// ============================================================================
// Sequência canônica COMPLETA do funil (jornada-canonica.md passo 2 + FIX-53).
// Encadeia nextGate respondendo cada gate como o usuário faria, e prova a ORDEM
// real ponta-a-ponta — o que faltava: os testes existentes cobrem cada transição
// isolada, não a progressão inteira.
//
// Ordem do docx (passo 2): valor → prazo → lance. FIX-53 (revisão 2): identidade
// (CPF+celular) ANTES do valor. Logo o VALOR (credit) precede prazo (timeframe)
// e lance — provado aqui contra regressão de reordenação.
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
			case "timeframe":
				meta = { ...meta, qualifyAnswers: { ...q, prazoMeses: 12 } };
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

describe("funil — sequência canônica completa (docx passo 2 + FIX-53)", () => {
	it("sem lance: identidade e VALOR precedem prazo e lance", () => {
		const seq = walkFunnel({ hasLance: "no" });
		expect(seq).toEqual([
			"name",
			"experience",
			"consent",
			"identify",
			"credit",
			"timeframe",
			"lance",
			"lance-embutido",
			"search",
			"simulator-offer",
			"decision",
		]);
	});

	it("com lance: lance-value entra logo após lance, ainda pós-valor", () => {
		const seq = walkFunnel({ hasLance: "yes" });
		expect(seq).toEqual([
			"name",
			"experience",
			"consent",
			"identify",
			"credit",
			"timeframe",
			"lance",
			"lance-value",
			"lance-embutido",
			"search",
			"simulator-offer",
			"decision",
		]);
	});

	it("INVARIANTE FIX-53/docx: identify e credit(valor) vêm ANTES de timeframe e lance", () => {
		const seq = walkFunnel({ hasLance: "no" });
		const idx = (g: Gate) => seq.indexOf(g);
		// identidade antes do valor (FIX-53)
		expect(idx("identify")).toBeLessThan(idx("credit"));
		// valor antes de prazo e lance (docx passo 2: valor → prazo → lance)
		expect(idx("credit")).toBeLessThan(idx("timeframe"));
		expect(idx("credit")).toBeLessThan(idx("lance"));
		expect(idx("timeframe")).toBeLessThan(idx("lance"));
	});
});

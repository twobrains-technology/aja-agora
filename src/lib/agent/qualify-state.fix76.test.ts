import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate } from "./qualify-state";

// ============================================================================
// FIX-76 — Camada 1 (structural): reabertura do gate de busca na troca de faixa.
// ----------------------------------------------------------------------------
// Bug real (Maria, conversa retomada): pediu um valor-alvo NOVO (130k) sobre um
// reveal antigo (256k). A tool-policy (FIX-68) já reabria search_groups no
// toolset via revealValueTargetChanged, mas o GATE não reabria — o orquestrador
// não FORÇAVA o reveal determinístico e o modelo ficava livre pra alucinar
// "instabilidade" e ressuscitar o 256k do histórico.
//
// Correção: revealValueTargetChanged passa a reabrir o GATE também — nextGate
// volta a "search" e decideShowGate libera mesmo em intent fraco (neutral).
// ============================================================================

/** Reveal completo (256k descoberto), AGORA com valor-alvo trocado pra 130k. */
const REVEAL_TROCA_DE_FAIXA: ConversationMetadata = {
	currentCategory: "auto",
	currentPersona: "auto",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	qualifyAnswers: {
		creditMax: 130_000,
		prazoMeses: 60,
		hasLance: "no",
		lanceEmbutido: false,
	},
	searchDispatched: true,
	revealCompleted: true,
	discoveredCreditTarget: 256_000, // a última busca foi na faixa de 256k
};

/** Mesmo reveal, MAS sem troca de faixa (valor-alvo == descoberto). */
const REVEAL_MESMA_FAIXA: ConversationMetadata = {
	...REVEAL_TROCA_DE_FAIXA,
	qualifyAnswers: { ...REVEAL_TROCA_DE_FAIXA.qualifyAnswers, creditMax: 256_000 },
	discoveredCreditTarget: 256_000,
};

const OPTS = { hasContactName: true } as const;

describe("FIX-76 — gate de busca reabre quando o valor-alvo trocou (retomada)", () => {
	it("nextGate volta a 'search' quando o valor-alvo difere do descoberto (mesmo com searchDispatched)", () => {
		expect(nextGate(REVEAL_TROCA_DE_FAIXA, OPTS)).toBe("search");
	});

	it("decideShowGate libera 'search' mesmo em intent neutral quando houve troca de faixa", () => {
		expect(
			decideShowGate({
				gate: "search",
				intent: "neutral",
				meta: REVEAL_TROCA_DE_FAIXA,
				isUserTurn: true,
			}),
		).toBe(true);
	});

	it("ANTI-REGRESSÃO: sem troca de faixa, nextGate NÃO volta a 'search' (BUG-REVEAL-LOOP)", () => {
		// Mesmo valor → o afirmativo curto pós-reveal segue indo pro simulator-offer,
		// nunca re-disparando a busca (o anti-loop de 2026-06-02 não pode regredir).
		expect(nextGate(REVEAL_MESMA_FAIXA, OPTS)).toBe("simulator-offer");
	});

	it("ANTI-REGRESSÃO: sem troca de faixa, decideShowGate('search', neutral) continua false", () => {
		expect(
			decideShowGate({
				gate: "search",
				intent: "neutral",
				meta: REVEAL_MESMA_FAIXA,
				isUserTurn: true,
			}),
		).toBe(false);
	});
});

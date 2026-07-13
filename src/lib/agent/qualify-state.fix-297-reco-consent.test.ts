import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate } from "./qualify-state";

// ============================================================================
// FIX-297 (rodada 10, loop-de-goal consórcio, 2026-07-12) — reveal em DOIS
// TEMPOS com consentimento. Mockup: search → lista (comparison_table, SEMPRE
// server-side, preserva FIX-290) → gate `experience` → novo gate LEVE
// `reco-consent` ("Posso te mostrar a opção que eu recomendo?") → só com
// resposta afirmativa o hero (recommendation_card) aparece. Fluxos sem-lance
// (hasLance="so_parcela") PULAM reco-consent/hero — não há o que recomendar
// pra quem já recusou a conversa de lance (decisão registrada no ADR do
// bloco: NÃO plugar sinal de auto-seleção de oferta, manter o mecanismo
// simples — divergência consciente do mockup pro caminho Mario).
// ============================================================================

function postExperienceMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		desireAsked: true,
		currentCategory: "auto",
		identityCollected: true,
		qualifyAnswers: { creditMax: 120_000 },
		searchDispatched: true,
		revealCompleted: true,
		experiencePrev: "first",
		...over,
	};
}

describe("FIX-297 — nextGate insere reco-consent entre experience e timeframe", () => {
	it("pós-experience, sem reco-consent ainda resolvido → reco-consent (antes de timeframe)", () => {
		expect(nextGate(postExperienceMeta(), { hasContactName: true })).toBe("reco-consent");
	});

	it("reco-consent já dispatchado → segue pro timeframe normalmente", () => {
		expect(
			nextGate(postExperienceMeta({ recoConsentDispatched: true }), { hasContactName: true }),
		).toBe("timeframe");
	});

	it("caminho sem-lance (hasLance='so_parcela') PULA reco-consent — vai direto pro timeframe", () => {
		const meta = postExperienceMeta({
			qualifyAnswers: { creditMax: 120_000, hasLance: "so_parcela" },
		});
		const gate = nextGate(meta, { hasContactName: true });
		expect(gate).not.toBe("reco-consent");
		expect(gate).toBe("timeframe");
	});

	it("doubts-wait ainda tem precedência sobre reco-consent (experience='doubts' não endereçado)", () => {
		const meta = postExperienceMeta({ experiencePrev: "doubts", doubtsAddressed: false });
		expect(nextGate(meta, { hasContactName: true })).toBe("doubts-wait");
	});
});

describe("FIX-297 — decideShowGate resolve reco-consent como os demais gates binários pós-reveal", () => {
	it("server-authored sempre mostra", () => {
		expect(
			decideShowGate({
				gate: "reco-consent",
				intent: "neutral",
				meta: postExperienceMeta(),
				isUserTurn: false,
			}),
		).toBe(true);
	});

	it("usuário afirmativo (ready_to_proceed/neutral) dispara", () => {
		for (const intent of ["ready_to_proceed", "neutral"] as const) {
			expect(
				decideShowGate({
					gate: "reco-consent",
					intent,
					meta: postExperienceMeta(),
					isUserTurn: true,
				}),
			).toBe(true);
		}
	});

	it("pergunta/dúvida/off-topic NÃO dispara — deixa o agente conversar", () => {
		for (const intent of ["asking_question", "expressing_doubt", "off_topic"] as const) {
			expect(
				decideShowGate({
					gate: "reco-consent",
					intent,
					meta: postExperienceMeta(),
					isUserTurn: true,
				}),
			).toBe(false);
		}
	});
});

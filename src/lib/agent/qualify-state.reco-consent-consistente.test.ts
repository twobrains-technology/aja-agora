import { describe, expect, it } from "vitest";
import { decideShowGate, type UserIntent } from "./qualify-state";

// ============================================================================
// FIX-356 — o convite do reveal (reco-consent) tem que aparecer SEMPRE
// ----------------------------------------------------------------------------
// Achado ao vivo (rodadas 6/7/8, os dois canais): o agente pede "Posso te mostrar
// a opção que eu recomendo?" em UMAS jornadas e em outras não — 2 de 4 na web.
// A decisão da Rodada 10 (mockup) é clara: o reveal é em DOIS TEMPOS, a lista
// aparece sozinha e o hero só depois do consentimento.
//
// Causa: `decideShowGate` só liberava o gate quando o intent era
// `ready_to_proceed` ou `neutral`. Se o usuário respondia dando uma informação
// ("é a primeira vez", "tenho FGTS"), o intent virava `providing_info` — e o
// CONVITE simplesmente nunca era feito.
//
// Mas `reco-consent` não é coleta de dado: é um CONVITE. Ele segue a mesma regra
// de `experience`/`identify` — aparece sempre, MENOS quando o usuário está
// perguntando, em dúvida, confuso ou fora do assunto (aí o agente atende ele
// primeiro; o funil espera).
// ============================================================================

const META_POS_REVEAL = {
	revealCompleted: true,
	identityCollected: true,
	currentCategory: "auto",
	qualifyAnswers: { creditMax: 150_000 },
} as never;

describe("reco-consent: o convite não pode depender do humor do intent", () => {
	const INTENTS_QUE_DEVEM_MOSTRAR: UserIntent[] = [
		"ready_to_proceed",
		"neutral",
		"providing_info", // "é a primeira vez", "tenho FGTS" — o convite SUMIA aqui
	];

	for (const intent of INTENTS_QUE_DEVEM_MOSTRAR) {
		it(`intent "${intent}" → o convite APARECE`, () => {
			expect(
				decideShowGate({
					gate: "reco-consent",
					intent,
					meta: META_POS_REVEAL,
					isUserTurn: true,
				}),
				`o reveal em dois tempos é decisão do cliente (Rodada 10): sem o convite, o hero sai sem consentimento`,
			).toBe(true);
		});
	}

	const INTENTS_QUE_ESPERAM: UserIntent[] = [
		"asking_question",
		"expressing_doubt",
		"confused",
		"off_topic",
	];

	for (const intent of INTENTS_QUE_ESPERAM) {
		it(`intent "${intent}" → o agente atende o usuário primeiro (o funil espera)`, () => {
			expect(
				decideShowGate({
					gate: "reco-consent",
					intent,
					meta: META_POS_REVEAL,
					isUserTurn: true,
				}),
				"quem está perguntando/em dúvida não pode levar um convite na cara — o agente responde primeiro",
			).toBe(false);
		});
	}
});

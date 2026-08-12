// Sonda de conversa real contra a stack local, 2026-08-12 — o cliente disse
// "Quero essa mesma, bora fechar" e recebeu de volta:
//
//   "Show, Itaú fechado: carta de R$ 92.902, parcela de R$ 2.258,47 em 48
//    meses. Ótima escolha pro seu carro de trabalho!
//    Antes de seguirmos pra contratação, me conta uma coisa: você já fez
//    consórcio antes ou essa é a sua primeira vez?"
//
// É o defeito do Caua ainda vivo, por outra porta. O guard em `nextGate`
// (`fechamentoSinalizado`) depende de `meta.escolha`, e `escolha` por TEXTO foi
// removida de propósito no FIX-406 — "só via clique no card; texto livre é para
// conversa, não para comprometer dinheiro". Ou seja: nesse turno não existe
// `escolha` para o guard ver, e ele não tem como agir.
//
// O sinal que EXISTE nesse turno é o intent: `ready_to_proceed`. E o bypass do
// FIX-317 estava deixando `experience` passar justamente nele. O FIX-317 tem
// razão de existir — "Quero ver todas" logo após o reveal silenciava o funil
// inteiro —, mas ele foi desenhado contra intents de DESVIO (pergunta, dúvida,
// off-topic), e `ready_to_proceed` não é desvio: é o oposto, é o cliente
// pedindo pra fechar.
//
// `identify` fica de fora desta exceção de propósito: é gate de COLETA (sem CPF
// a Bevi não simula nem contrata), então ele não cede nem pra quem quer fechar.

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { decideShowGate } from "@/lib/agent/qualify-state";

const posReveal: ConversationMetadata = {
	desireAsked: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	qualifyAnswers: { creditMin: 80_000, creditMax: 100_000 },
};

describe("experience cede a vez pra quem já quer fechar", () => {
	it('"bora fechar" não recebe de volta "você já fez consórcio antes?"', () => {
		expect(
			decideShowGate({
				gate: "experience",
				intent: "ready_to_proceed",
				meta: posReveal,
				isUserTurn: true,
			}),
		).toBe(false);
	});

	it("o bypass do FIX-317 segue de pé para os outros intents", () => {
		for (const intent of ["neutral", "providing_info", "wants_more_options"] as const) {
			expect(
				decideShowGate({ gate: "experience", intent, meta: posReveal, isUserTurn: true }),
				intent,
			).toBe(true);
		}
	});

	it("identify é COLETA e não cede nem pra quem quer fechar — sem CPF a Bevi não contrata", () => {
		expect(
			decideShowGate({
				gate: "identify",
				intent: "ready_to_proceed",
				meta: { ...posReveal, identityCollected: false },
				isUserTurn: true,
			}),
		).toBe(true);
	});

	it("turno server-authored continua conduzindo normalmente", () => {
		expect(
			decideShowGate({
				gate: "experience",
				intent: "ready_to_proceed",
				meta: posReveal,
				isUserTurn: false,
			}),
		).toBe(true);
	});
});

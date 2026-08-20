/**
 * D8 (PRD 19/08/2026, conversa da Rute) — DUAS RECOMENDAÇÕES VIVAS AO MESMO
 * TEMPO.
 *
 * Estado final da conversa que morreu:
 *
 *   recommendedOffer          = ITAÚ / 147 meses / R$ 524.580
 *   pendingRecommendationCard = BANCO DO BRASIL / 217 meses / R$ 499.634
 *
 * Pior que a incoerência: é uma mina armada. O card pendente é liberado assim
 * que a experiência resolve — ou seja, no turno seguinte a cliente, que tinha
 * acabado de focar no Itaú e recebido a simulação dele, veria surgir um card de
 * destaque do Banco do Brasil, do nada.
 *
 * A re-âncora por menção troca a cota em foco e NÃO invalidava o card guardado:
 * são dois trilhos paralelos, e o antigo continuava correndo. Trocou de cota, o
 * card pendente da cota antiga morre — não se guarda uma recomendação que a
 * conversa já deixou para trás.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentGraphStateType } from "../state";

const resolver = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent/orchestrator/choose-offer", () => ({
	resolveAdministradoraMentionForConversation: resolver,
}));

const { advanceFunnelNode } = await import("./advance");

const CARD_DO_BB = {
	id: "bb-217",
	administradora: "BANCO DO BRASIL",
	creditValue: 499_634,
	monthlyPayment: 3_031,
	termMonths: 217,
};

function estado(over: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
	return {
		conversationId: "conv-rute",
		channel: "web",
		contactName: "Rute",
		isUserTurn: true,
		userText: "Itaú",
		intent: "providing_info",
		baseMeta: {},
		gate: undefined,
		events: [],
		messages: [],
		funnel: {
			currentPersona: "helena-imovel",
			currentCategory: "imovel",
			desireAsked: true,
			qualifyAnswers: {},
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			decisionDispatched: false,
			recommendedAdministradora: "BANCO DO BRASIL",
			recommendedOffer: {
				groupId: "bb-217",
				administradora: "BANCO DO BRASIL",
				creditValue: 499_634,
				termMonths: 217,
				monthlyPayment: 3_031,
			},
			pendingRecommendationCard: CARD_DO_BB,
		},
		...over,
	} as unknown as AgentGraphStateType;
}

describe("D8 — reancorar em outra cota desarma o card pendente da anterior", () => {
	beforeEach(() => resolver.mockReset());

	it("o card do Banco do Brasil não sobrevive à mudança de foco para o Itaú", async () => {
		resolver.mockResolvedValue({
			groupId: "ita-147",
			administradora: "ITAÚ",
			creditValue: 524_580,
			termMonths: 147,
			monthlyPayment: 4_519,
		});

		// `experiencePrev` ausente: o hero fica GUARDADO (é o estado real da conversa
		// da Rute), então a liberação não roda e a mina permaneceria armada.
		const out = await advanceFunnelNode(estado());

		expect(out.funnel?.recommendedOffer?.administradora).toBe("ITAÚ");
		expect(out.funnel?.pendingRecommendationCard).toBeUndefined();
	});

	it("mencionar a MESMA cota não joga fora o card guardado", async () => {
		resolver.mockResolvedValue({
			groupId: "bb-217",
			administradora: "BANCO DO BRASIL",
			creditValue: 499_634,
			termMonths: 217,
			monthlyPayment: 3_031,
		});

		const out = await advanceFunnelNode(estado({ userText: "a do Banco do Brasil" }));

		expect(out.funnel?.pendingRecommendationCard).toEqual(CARD_DO_BB);
	});

	it("turno sem menção nenhuma não mexe no card guardado", async () => {
		resolver.mockResolvedValue(null);

		const out = await advanceFunnelNode(estado({ userText: "e como funciona o lance?" }));

		expect(out.funnel?.pendingRecommendationCard).toEqual(CARD_DO_BB);
	});
});

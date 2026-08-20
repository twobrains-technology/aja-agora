/**
 * PRD 19/08/2026, §4.2 — AS TRAVAS QUE SEGURARAM A VENDA DA RUTE.
 *
 * Duas delas vivem aqui:
 *
 * 1. **`timeframe` na frente do fechamento.** O próprio comentário do código diz
 *    que o prazo desejado alimenta o SIMULADOR, não a contratação. A cliente já
 *    estava dentro do simulador, com a simulação na tela, e o funil ainda queria
 *    perguntar em quanto tempo ela quer ser contemplada.
 *
 * 2. **A etapa de decisão só abre com `ready_to_proceed` ou `neutral`.** "A de
 *    prazo mais curto" — a resposta mais decidida da conversa inteira, dada à
 *    pergunta que o próprio agente fez — é classificada como `providing_info`, e
 *    o card de decisão nunca aparecia.
 *
 * A segunda correção é ANCORADA: só cede quando o servidor tinha uma escolha
 * ofertada pendente (`escolhaOfertada`, coagida por ele mesmo). What-if solto
 * ("e se fosse R$ 300 mil?") continua sendo `providing_info` que NÃO abre
 * decisão — senão o card viraria interrupção de quem está explorando números.
 */

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { decideShowGate, nextGate } from "./qualify-state";

const POS_SIMULACAO: ConversationMetadata = {
	currentPersona: "helena-imovel",
	currentCategory: "imovel",
	desireAsked: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "first",
	simulacaoApresentada: true,
	recommendedAdministradora: "ITAÚ",
	recommendedOffer: {
		groupId: "ita-147",
		administradora: "ITAÚ",
		creditValue: 524_580,
		termMonths: 147,
		monthlyPayment: 4_519,
	},
	qualifyAnswers: { creditMin: 450_000, creditMax: 500_000, hasLance: "no" },
} as ConversationMetadata;

describe("timeframe não barra quem já está dentro do simulador", () => {
	it("com a simulação na tela, o funil segue para a decisão em vez de perguntar o prazo", () => {
		expect(nextGate(POS_SIMULACAO, { hasContactName: true })).not.toBe("timeframe");
	});

	it("sem simulação nenhuma, o prazo continua sendo perguntado (é insumo do simulador)", () => {
		const semSimulacao = { ...POS_SIMULACAO, simulacaoApresentada: undefined };
		expect(nextGate(semSimulacao, { hasContactName: true })).toBe("timeframe");
	});

	it("o prazo já respondido segue pulando o gate, como antes", () => {
		const comPrazo = {
			...POS_SIMULACAO,
			simulacaoApresentada: undefined,
			qualifyAnswers: { ...POS_SIMULACAO.qualifyAnswers, prazoMeses: 120 },
		} as ConversationMetadata;
		expect(nextGate(comPrazo, { hasContactName: true })).not.toBe("timeframe");
	});
});

describe("a decisão abre para quem respondeu a pergunta de escolha do agente", () => {
	const metaComEscolhaOfertada = {
		...POS_SIMULACAO,
		escolhaOfertada: { groupIds: ["ita-147", "ita-158"] },
	} as ConversationMetadata;

	it('"A de prazo mais curto" (providing_info) abre a decisão quando o agente perguntou', () => {
		expect(
			decideShowGate({
				gate: "decision",
				intent: "providing_info",
				meta: metaComEscolhaOfertada,
				isUserTurn: true,
			}),
		).toBe(true);
	});

	it("what-if solto, sem pergunta de escolha pendente, NÃO abre decisão", () => {
		expect(
			decideShowGate({
				gate: "decision",
				intent: "providing_info",
				meta: POS_SIMULACAO,
				isUserTurn: true,
			}),
		).toBe(false);
	});

	it("dúvida continua deixando o agente conversar, mesmo com escolha ofertada", () => {
		expect(
			decideShowGate({
				gate: "decision",
				intent: "expressing_doubt",
				meta: metaComEscolhaOfertada,
				isUserTurn: true,
			}),
		).toBe(false);
	});

	it("recusa nunca abre a decisão", () => {
		expect(
			decideShowGate({
				gate: "decision",
				intent: "declines",
				meta: metaComEscolhaOfertada,
				isUserTurn: true,
			}),
		).toBe(false);
	});
});

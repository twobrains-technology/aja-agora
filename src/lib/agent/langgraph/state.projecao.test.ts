// Guard estrutural da projeção manual do funil (não é teste de comportamento).
//
// O estado do funil atravessa cada turno por DUAS funções escritas à mão —
// `funnelFromMeta` na entrada, `projectToMeta` na saída — e `persistMeta`
// substitui a coluna `metadata` INTEIRA. Um campo novo no `FunnelState` que
// alguém esqueça de espalhar nas duas some sem erro nenhum: o grafo escreve, a
// persistência não leva, e o sintoma aparece turnos depois como o agente
// repetindo uma pergunta que o cliente já respondeu. Aconteceu três vezes
// (`valorDoBemAlvo`, `parcelaAlvo`, `embeddedBidDispatched`) — este arquivo
// existe pra que a quarta seja impossível em vez de improvável.
//
// Como fecha o cerco:
//   1. `FUNNEL_KEYS` (state.ts) faz o `tsc` recusar campo novo não registrado;
//   2. o teste de cobertura abaixo obriga o campo a ganhar um valor no fixture;
//   3. o teste de ida-e-volta prova que o valor sobrevive ao ciclo.
// Pular qualquer um dos três quebra a build, não a produção.

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { projectToMeta } from "./emit";
import type { AgentGraphStateType } from "./state";
import { FUNNEL_KEYS, FUNNEL_QUALIFY_KEYS, type FunnelState, funnelFromMeta } from "./state";

/** Um valor DISTINTO por campo — sentinelas iguais deixariam passar uma troca
 * de campo por outro na projeção. Booleanos vão todos em `true` porque o
 * default de quase todos é `false`/`undefined`: é o valor que denuncia a perda. */
const FUNIL_COMPLETO: FunnelState = {
	currentPersona: "especialista",
	currentCategory: "imovel",
	desireAsked: true,
	desireAnswered: true,
	qualifyAnswers: {
		creditMin: 111_000,
		creditMax: 222_000,
		desiredItem: "apartamento na praia",
		motivation: "sair do aluguel",
		prazoMeses: 180,
		objetivo: "investimento",
		hasLance: "so_parcela",
		lanceValue: 33_000,
		lanceEmbutido: true,
		lanceEmbutidoPercent: 30,
		valorDoBemAlvo: 444_000,
		parcelaAlvo: 1_777,
		embeddedBidDispatched: true,
	},
	identityCollected: true,
	searchDispatched: true,
	discoveredCreditTarget: 555_000,
	revealCompleted: true,
	recommendedAdministradora: "Canopus",
	recommendedOffer: {
		administradora: "Canopus",
		category: "imovel",
		creditValue: 666_000,
		termMonths: 200,
		monthlyPayment: 2_888,
		groupId: "grupo-teste-1",
		avgBidValue: 99_000,
	},
	motivationAsked: true,
	motivationMirrored: true,
	experiencePrev: "doubts",
	doubtsAddressed: true,
	explicouComoFunciona: true,
	topicPickerDispatched: true,
	recoConsentDispatched: true,
	recoConsentAnswered: true,
	recoConsentDeclined: true,
	pendingRecommendationCard: { marcador: "hero-segurado" },
	pendingSimulationResult: { marcador: "simulacao-segurada" },
	simulatorOfferDispatched: true,
	simulatorOfferAnswered: true,
	decisionDispatched: true,
	escolha: {
		groupId: "grupo-escolhido-9",
		administradora: "Itaú",
		creditValue: 300_000,
		termMonths: 120,
		monthlyPayment: 2_100,
		origem: "criterio",
	},
	handoffSuggested: true,
	handoffReason: "cliente pediu falar com humano",
	contractFormDispatched: true,
};

function idaEVolta(funnel: FunnelState): FunnelState {
	const meta = projectToMeta({
		baseMeta: {} as ConversationMetadata,
		funnel,
	} as AgentGraphStateType);
	return funnelFromMeta(meta);
}

describe("projeção do funil (grafo ↔ metadata persistido)", () => {
	it("o fixture cobre todo campo registrado — campo novo obriga um valor aqui", () => {
		expect(Object.keys(FUNIL_COMPLETO).sort()).toEqual(Object.keys(FUNNEL_KEYS).sort());
		expect(Object.keys(FUNIL_COMPLETO.qualifyAnswers).sort()).toEqual(
			Object.keys(FUNNEL_QUALIFY_KEYS).sort(),
		);
	});

	it("nenhum campo do funil se perde na ida e volta pelo metadata", () => {
		const volta = idaEVolta(FUNIL_COMPLETO);
		for (const campo of Object.keys(FUNNEL_KEYS) as (keyof FunnelState)[]) {
			expect(
				volta[campo],
				`o campo "${campo}" não sobreviveu ao ciclo — falta em projectToMeta (emit.ts) ou em funnelFromMeta (state.ts)`,
			).toEqual(FUNIL_COMPLETO[campo]);
		}
	});

	it("nenhuma resposta de qualificação se perde na ida e volta", () => {
		const volta = idaEVolta(FUNIL_COMPLETO).qualifyAnswers;
		for (const campo of Object.keys(
			FUNNEL_QUALIFY_KEYS,
		) as (keyof FunnelState["qualifyAnswers"])[]) {
			expect(
				volta[campo],
				`qualifyAnswers.${campo} não sobreviveu ao ciclo — falta na projeção`,
			).toEqual(FUNIL_COMPLETO.qualifyAnswers[campo]);
		}
	});

	it("preserva os campos do metadata que o grafo ainda não entende", () => {
		// `persistMeta` troca a coluna inteira: se a projeção não devolvesse o
		// `baseMeta` por baixo, cada turno apagaria contrato, opt-in de WhatsApp e
		// memória — os ~80 campos fora do slice.
		const baseMeta = {
			contractClosed: true,
			whatsappOptIn: true,
			gateStuckTurns: 3,
		} as unknown as ConversationMetadata;
		const meta = projectToMeta({ baseMeta, funnel: FUNIL_COMPLETO } as AgentGraphStateType);
		expect(meta.contractClosed).toBe(true);
		expect((meta as Record<string, unknown>).whatsappOptIn).toBe(true);
		expect((meta as Record<string, unknown>).gateStuckTurns).toBe(3);
	});
});

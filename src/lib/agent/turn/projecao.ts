// PROJEÇÃO DO TURNO → `ConversationMetadata` e eventos de meta.
//
// Veio de `langgraph/emit.ts` (B2 da campanha 2026-10-19). O trabalho é o mesmo:
// o estado do turno é a AUTORIDADE do fluxo, e no fim do turno ele é projetado de
// volta pros campos do meta que a superfície compartilhada lê — sempre em MERGE
// por cima do `baseMeta` completo, porque `persistMeta` substitui a coluna
// inteira e o runtime não entende os ~80 campos legados.
//
// Sem framework: nada aqui precisa saber que houve um grafo um dia.
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { FunnelState } from "./estado";

/**
 * Projeta `FunnelState` (autoridade do fluxo, dentro do grafo) de volta pros
 * campos de `ConversationMetadata` que a superfície COMPARTILHADA lê — não é
 * "diff cego idêntico" (o grafo não entende os ~80 campos do meta legado),
 * é o CONJUNTO EXPLÍCITO abaixo, escolhido por quem consome cada um:
 *
 * - `currentPersona`/`currentCategory` — roteamento de persona/toolset
 *   (tool-policy.ts `allowedTools`, builder.ts).
 * - `qualifyAnswers.{creditMin,creditMax,desiredItem,motivation}` —
 *   `gatePartData`/`gateQuestion` (web/adapter.ts) leem `creditMax` pro
 *   slider e pro texto da pergunta; `desiredItem`/`motivation` alimentam o
 *   prompt (system-context.ts).
 * - `identityCollected` — guarda de rota (`nextGate`, I1: nunca discovery
 *   sem identidade) + `tool-policy.ts` (search_groups só libera com isto).
 * - `searchDispatched`/`revealCompleted` — idempotência do nó `discovery`
 *   (nunca re-busca a Bevi no mesmo turno/faixa) + guarda de rota pós-reveal.
 * - `recommendedAdministradora`/`recommendedOffer` — âncora do hero (I3: a
 *   UI nunca mostra número que não veio de um grupo REAL) + contexto do
 *   card de decisão.
 * - `decisionDispatched` — idempotência do card `decision_prompt`.
 *
 * IMPORTANTE: faz merge por cima de `baseMeta` (o `ConversationMetadata`
 * COMPLETO carregado do banco no início do turno) — nunca zera os ~80
 * campos que este runtime ainda não entende (lance, contract, whatsapp
 * opt-in, memória Letta, etc.). `persistMeta` SUBSTITUI a coluna inteira
 * (não faz merge no banco), então quem chama `projectToMeta` é responsável
 * por já ter o `baseMeta` certo em `state.baseMeta`.
 */
export function projectToMeta(state: {
	baseMeta: ConversationMetadata;
	funnel: FunnelState;
}): ConversationMetadata {
	const { baseMeta, funnel } = state;
	return {
		...baseMeta,
		currentPersona: funnel.currentPersona,
		currentCategory: funnel.currentCategory,
		desireAsked: funnel.desireAsked,
		desireAnswered: funnel.desireAnswered,
		identityCollected: funnel.identityCollected,
		searchDispatched: funnel.searchDispatched,
		discoveryEmptyStreak: funnel.discoveryEmptyStreak,
		discoveredCreditTarget: funnel.discoveredCreditTarget,
		discoveredParcelaTarget: funnel.discoveredParcelaTarget,
		recommendedOfferStale: funnel.recommendedOfferStale,
		bemAbandonado: funnel.bemAbandonado,
		revealCompleted: funnel.revealCompleted,
		recommendedAdministradora: funnel.recommendedAdministradora,
		recommendedOffer: funnel.recommendedOffer,
		motivationAsked: funnel.motivationAsked,
		motivationMirrored: funnel.motivationMirrored,
		experiencePrev: funnel.experiencePrev,
		doubtsAddressed: funnel.doubtsAddressed,
		explicouComoFunciona: funnel.explicouComoFunciona,
		experienceDispatched: funnel.experienceDispatched,
		nameCardAdiado: funnel.nameCardAdiado,
		nameCardExibido: funnel.nameCardExibido,
		turnosDoCliente: funnel.turnosDoCliente,
		nomeDispensado: funnel.nomeDispensado,
		topicPickerDispatched: funnel.topicPickerDispatched,
		recoConsentDispatched: funnel.recoConsentDispatched,
		recoConsentAnswered: funnel.recoConsentAnswered,
		recoConsentDeclined: funnel.recoConsentDeclined,
		pendingRecommendationCard: funnel.pendingRecommendationCard,
		pendingSimulationResult: funnel.pendingSimulationResult,
		simulatorOfferDispatched: funnel.simulatorOfferDispatched,
		simulatorOfferAnswered: funnel.simulatorOfferAnswered,
		decisionDispatched: funnel.decisionDispatched,
		decisionAccepted: funnel.decisionAccepted,
		scarcityDispatched: funnel.scarcityDispatched,
		simulacaoApresentada: funnel.simulacaoApresentada,
		escolha: funnel.escolha,
		escolhaOfertada: funnel.escolhaOfertada,
		contractOffer: funnel.contractOffer,
		// O encaminhamento pro atendente humano PRECISA sobreviver ao turno: é o
		// que o painel lê pra alguém assumir a conversa.
		...(funnel.handoffSuggested ? { handoffSuggested: true } : {}),
		...(funnel.handoffReason ? { handoffReason: funnel.handoffReason } : {}),
		contractFormDispatched: funnel.contractFormDispatched,
		qualifyAnswers: {
			...baseMeta.qualifyAnswers,
			creditMin: funnel.qualifyAnswers.creditMin,
			creditMax: funnel.qualifyAnswers.creditMax,
			// FIX-377 — o piso que a Bevi informou tem que sobreviver ao ciclo:
			// sem ele, o turno seguinte volta a usar o default e pode barrar (ou
			// liberar) uma faixa pelo número errado.
			creditoMinimoInformado: funnel.qualifyAnswers.creditoMinimoInformado,
			desiredItem: funnel.qualifyAnswers.desiredItem,
			motivation: funnel.qualifyAnswers.motivation,
			prazoMeses: funnel.qualifyAnswers.prazoMeses,
			objetivo: funnel.qualifyAnswers.objetivo,
			hasLance: funnel.qualifyAnswers.hasLance,
			lanceValue: funnel.qualifyAnswers.lanceValue,
			lanceEmbutido: funnel.qualifyAnswers.lanceEmbutido,
			lanceEmbutidoPercent: funnel.qualifyAnswers.lanceEmbutidoPercent,
			// Faltavam na projeção: o grafo os escrevia e a persistência os perdia.
			// `valorDoBemAlvo` é o preço do BEM (o que o cliente pediu) quando o
			// alvo da busca vira `bem ÷ (1 − pct)` pelo embutido — sem ele, o aviso
			// de divergência do fechamento dizia "você pediu R$ 428.571" a quem
			// tinha pedido R$ 300 mil, apresentando a conta interna como fala do
			// cliente. `embeddedBidDispatched` guarda a idempotência do card.
			valorDoBemAlvo: funnel.qualifyAnswers.valorDoBemAlvo,
			parcelaAlvo: funnel.qualifyAnswers.parcelaAlvo,
			// Sem o discriminante na projeção, o turno seguinte reconstrói o funil
			// sem ele e a busca volta a ser por valor — que é exatamente a busca
			// errada para quem acabou de dizer quanto cabe no bolso.
			alvoDeBusca: funnel.qualifyAnswers.alvoDeBusca,
			embeddedBidDispatched: funnel.qualifyAnswers.embeddedBidDispatched,
		},
	};
}

/** Monta o evento `meta-update` a partir do estado do turno. */
export function metaUpdateEvent(state: {
	baseMeta: ConversationMetadata;
	funnel: FunnelState;
}): Extract<TurnEvent, { type: "meta-update" }> {
	return { type: "meta-update", meta: projectToMeta(state) };
}

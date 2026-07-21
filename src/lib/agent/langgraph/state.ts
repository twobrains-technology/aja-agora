// Contrato de estado do grafo LangGraph (FIX-357, fundação — Rodada 0). Struct
// LIMPO: NÃO copia flags de remendo do runtime Vercel (ex.: `gateStuckTurns`,
// `pendingGateSince`) — esses existem pra segurar o if-cascade implícito do
// `nextGate()`, um problema que o grafo explícito resolve estruturalmente.
//
// `funnel` guarda só os campos do SLICE desta fundação (name→desire→credit→
// identify→discovery→reveal→decision). O resto de `ConversationMetadata`
// (~80 campos — lance, contract, whatsapp opt-in, etc.) fica de fora por
// enquanto: `run-turn.ts` faz merge do `funnel` projetado por cima do
// `ConversationMetadata` completo carregado do banco (nunca substitui os
// campos que este runtime ainda não entende) — ver `projectToMeta` em
// `emit.ts`. TODO(rodada-1): nós de funil completos (ITEM D do goal doc)
// devem estender `FunnelState` conforme cobrem mais gates.
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { Channel, TurnEvent, TurnInput } from "@/lib/agent/orchestrator/types";
import type { Category, ConversationMetadata, ExperiencePrev, Persona } from "@/lib/agent/personas";
import type { Gate, UserIntent } from "@/lib/agent/qualify-state";

/** O contrato que `runTurnLangGraph` cumpre — mesma assinatura de
 * `runTurnVercel` (orchestrator/index.ts), o que faz do dispatcher (FIX-355)
 * uma troca sem custo de tipos nos dois lados. */
export type RuntimeAdapter = (input: TurnInput) => AsyncGenerator<TurnEvent>;

/** Subconjunto de `QualifyAnswers` (personas.ts) que o slice desta fundação
 * lê/escreve. Tipo estrutural (não `Pick<>`) — os campos batem 1:1 com os de
 * `ConversationMetadata["qualifyAnswers"]` de propósito, pra `projectToMeta`
 * fazer merge raso sem transformação. */
export type FunnelQualifyAnswers = {
	creditMin?: number;
	creditMax?: number;
	desiredItem?: string;
	motivation?: string;
	// FIX-360 (funil completo, Rodada 1) — campos dos gates pós-reveal
	// (timeframe/lance/lance-value/lance-embutido). Mesmos nomes/tipos de
	// `QualifyAnswers` (personas.ts) de propósito — `projectToMeta` faz merge
	// raso sem transformação.
	prazoMeses?: number;
	hasLance?: "yes" | "maybe" | "no" | "so_parcela";
	lanceValue?: number;
	lanceEmbutido?: boolean;
	lanceEmbutidoPercent?: 30 | 50;
};

export type FunnelState = {
	currentPersona: Persona;
	currentCategory?: Category;
	desireAsked: boolean;
	// FIX-360 — marca que o gate `desire` recebeu RESPOSTA (independente do que
	// o analyzer extraiu como `desiredItem`) — já setado por `analyzeAndMerge`
	// (reusado tal-e-qual, ver `nodes/analyze.ts`); só precisava sobreviver ao
	// turno via `funnelFromMeta`/`projectToMeta`.
	desireAnswered?: boolean;
	qualifyAnswers: FunnelQualifyAnswers;
	identityCollected: boolean;
	searchDispatched: boolean;
	// FIX-360 — snapshot do `creditMax` efetivamente buscado na última
	// descoberta (equivalente a `discoveredCreditTarget` do runtime Vercel,
	// tool-policy.ts `revealValueTargetChanged`) — permite ao `route` decidir
	// re-disparar a descoberta quando o usuário pede uma faixa de valor NOVA
	// pós-reveal, sem re-buscar em afirmativos curtos na MESMA faixa.
	discoveredCreditTarget?: number;
	revealCompleted: boolean;
	recommendedAdministradora?: string;
	recommendedOffer?: ConversationMetadata["recommendedOffer"];
	// FIX-360 — rapport (motivo + espelho, `qualify-state.ts` `shouldAskMotive`/
	// `shouldMirrorMotivation`, reusados tal-e-qual): marca que o beat de cada
	// turno-próprio já rodou, pra não repetir a pergunta/o espelho.
	motivationAsked?: boolean;
	motivationMirrored?: boolean;
	// FIX-360 — pós-reveal (`experience`/`doubts-wait`, D2 do ADR
	// agente-vendas-consorcio): experiência do usuário com consórcio +
	// resolução do beat de dúvidas.
	experiencePrev?: ExperiencePrev;
	doubtsAddressed?: boolean;
	// FIX-360 — card único (`topic_picker`) pro usuário novato logo após
	// `experience` resolver, antes do convite de recomendação.
	topicPickerDispatched?: boolean;
	// FIX-360 — "reveal em dois tempos": convite de recomendação
	// (`reco-consent`) e resposta reconhecida.
	recoConsentDispatched?: boolean;
	recoConsentAnswered?: boolean;
	// FIX-360 — convite do simulador de contemplação pós-lance.
	simulatorOfferDispatched?: boolean;
	simulatorOfferAnswered?: boolean;
	decisionDispatched: boolean;
};

/** Constrói o `FunnelState` inicial a partir do `ConversationMetadata`
 * persistido (carregado do banco no início do turno) — projeção INVERSA de
 * `projectToMeta` (emit.ts). Só lê os campos do slice; o resto do meta
 * segue intacto em `AgentGraphStateType.baseMeta` pra `projectToMeta`
 * devolver no merge final. */
export function funnelFromMeta(meta: ConversationMetadata): FunnelState {
	return {
		currentPersona: meta.currentPersona ?? "concierge",
		currentCategory: meta.currentCategory,
		desireAsked: meta.desireAsked ?? false,
		desireAnswered: meta.desireAnswered,
		qualifyAnswers: {
			creditMin: meta.qualifyAnswers?.creditMin,
			creditMax: meta.qualifyAnswers?.creditMax,
			desiredItem: meta.qualifyAnswers?.desiredItem,
			motivation: meta.qualifyAnswers?.motivation,
			prazoMeses: meta.qualifyAnswers?.prazoMeses,
			hasLance: meta.qualifyAnswers?.hasLance,
			lanceValue: meta.qualifyAnswers?.lanceValue,
			lanceEmbutido: meta.qualifyAnswers?.lanceEmbutido,
			lanceEmbutidoPercent: meta.qualifyAnswers?.lanceEmbutidoPercent,
		},
		identityCollected: meta.identityCollected ?? false,
		searchDispatched: meta.searchDispatched ?? false,
		discoveredCreditTarget: meta.discoveredCreditTarget,
		revealCompleted: meta.revealCompleted ?? false,
		recommendedAdministradora: meta.recommendedAdministradora,
		recommendedOffer: meta.recommendedOffer,
		motivationAsked: meta.motivationAsked,
		motivationMirrored: meta.motivationMirrored,
		experiencePrev: meta.experiencePrev,
		doubtsAddressed: meta.doubtsAddressed,
		topicPickerDispatched: meta.topicPickerDispatched,
		recoConsentDispatched: meta.recoConsentDispatched,
		recoConsentAnswered: meta.recoConsentAnswered,
		simulatorOfferDispatched: meta.simulatorOfferDispatched,
		simulatorOfferAnswered: meta.simulatorOfferAnswered,
		decisionDispatched: meta.decisionDispatched ?? false,
	};
}

export const AgentGraphState = Annotation.Root({
	...MessagesAnnotation.spec,

	// ── Contexto imutável do turno (setado uma vez na entrada) ──
	conversationId: Annotation<string>(),
	channel: Annotation<Channel>(),
	contactName: Annotation<string | null>(),
	isUserTurn: Annotation<boolean>(),
	userText: Annotation<string>(),

	// ── Snapshot completo do meta persistido — `projectToMeta` faz merge do
	// `funnel` por cima disto no fim do turno (nunca perde campos que este
	// runtime ainda não entende). ──
	baseMeta: Annotation<ConversationMetadata>(),

	// ── Produzido pelo nó `analyze` ──
	intent: Annotation<UserIntent | undefined>(),

	// ── Produzido pelo nó `route` — guarda a decisão de roteamento do turno. ──
	gate: Annotation<Gate | undefined>(),

	// ── Autoridade do fluxo (mutado pelos nós conforme o turno avança) ──
	funnel: Annotation<FunnelState>(),

	// ── TurnEvents acumulados pelos nós (persist os lê no fim; run-turn.ts
	// também os re-emite via streaming em tempo real — ver `emit.ts`) ──
	events: Annotation<TurnEvent[]>({
		reducer: (a, b) => a.concat(b),
		default: () => [],
	}),
});

export type AgentGraphStateType = typeof AgentGraphState.State;
export type AgentGraphUpdateType = typeof AgentGraphState.Update;

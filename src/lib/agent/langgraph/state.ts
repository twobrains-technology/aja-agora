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
import type { Category, ConversationMetadata, Persona } from "@/lib/agent/personas";
import type { Channel, TurnEvent, TurnInput } from "@/lib/agent/orchestrator/types";
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
};

export type FunnelState = {
	currentPersona: Persona;
	currentCategory?: Category;
	desireAsked: boolean;
	qualifyAnswers: FunnelQualifyAnswers;
	identityCollected: boolean;
	searchDispatched: boolean;
	revealCompleted: boolean;
	recommendedAdministradora?: string;
	recommendedOffer?: ConversationMetadata["recommendedOffer"];
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
		qualifyAnswers: {
			creditMin: meta.qualifyAnswers?.creditMin,
			creditMax: meta.qualifyAnswers?.creditMax,
			desiredItem: meta.qualifyAnswers?.desiredItem,
			motivation: meta.qualifyAnswers?.motivation,
		},
		identityCollected: meta.identityCollected ?? false,
		searchDispatched: meta.searchDispatched ?? false,
		revealCompleted: meta.revealCompleted ?? false,
		recommendedAdministradora: meta.recommendedAdministradora,
		recommendedOffer: meta.recommendedOffer,
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

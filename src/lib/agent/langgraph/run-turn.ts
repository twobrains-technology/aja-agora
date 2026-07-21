// `runTurnLangGraph` — o `RuntimeAdapter` real (FIX-358 walking skeleton +
// FIX-359 streaming ao vivo). Carrega o estado da conversa (reloadMeta→
// funnel), roda o grafo (analyze→route→converse→[discovery?]→emitCard→
// persist) via `graph.stream(..., { streamMode: ["custom", "values"] })` e
// devolve os TurnEvent.
//
// DECISÃO DE DESIGN (FIX-359): dois canais de streaming, drenados na MESMA
// ordem em que o LangGraph os entrega:
//  - "custom" — o que os nós empurram via `config.writer(...)` (hoje só
//    `nodes/converse.ts`: `text-delta`/`tool-call`) — sai AO VIVO, evento a
//    evento, enquanto o nó ainda está rodando (prova: run-turn.streaming.
//    test.ts — ≥2 text-delta chegam ao chamador ANTES do nó `persist`
//    gravar no banco).
//  - "values" — o estado completo após CADA superstep; guardamos só o
//    ÚLTIMO (pós-`persist`, garantido por ser o nó final da topologia) e, ao
//    fim do stream, emitimos `state.events` FILTRANDO os tipos que já
//    saíram ao vivo (`text-delta`/`tool-call` — `LIVE_EVENT_TYPES` abaixo) —
//    sem isso, duplicaria: o node `converse` empilha esses eventos tanto no
//    `config.writer` quanto no `state.events` que ele devolve (persist.ts
//    precisa deles ali pra reconstruir `assistantText`).
// Ordem "persistMeta antes de qualquer gate/artifact" continua garantida
// por TOPOLOGIA (persist é sempre o último nó a contribuir pro "values"
// final) — nunca por timing.
import { eq } from "drizzle-orm";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import type { TurnEvent, TurnInput } from "@/lib/agent/orchestrator/types";
import { loadConversationHistory } from "@/lib/conversation/messages";
import { metaOf } from "@/lib/conversation/meta";
import { buildAgentGraph } from "./graph";
import { type AgentGraphStateType, funnelFromMeta } from "./state";

function toBaseMessage(m: { role: "user" | "assistant"; content: string }): BaseMessage {
	return m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content);
}

/** Tipos que os nós já empurram via `config.writer` (streaming ao vivo,
 * canal "custom") — ao drenar `state.events` do "values" final, estes
 * ficam de fora pra não duplicar o que o chamador já recebeu ao vivo. */
const LIVE_EVENT_TYPES: ReadonlySet<TurnEvent["type"]> = new Set(["text-delta", "tool-call"]);

/** Factory — injeta um `model` (default `makeLangGraphModel()`, real) pro
 * grafo. O walking skeleton testa com `FakeStreamingChatModel`
 * (`@langchain/core/utils/testing`) — sem gateway real (card FIX-358: "modelo
 * MOCKADO"). */
export function createRunTurnLangGraph(deps?: {
	model?: BaseChatModel;
}): (input: TurnInput) => AsyncGenerator<TurnEvent> {
	const graph = buildAgentGraph(deps);

	return async function* runTurnLangGraphImpl(input: TurnInput): AsyncGenerator<TurnEvent> {
		const { channel, conversationId, userText, isUserTurn, contactName } = input;
		if (!conversationId) {
			throw new Error("[langgraph] conversationId is required");
		}

		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const baseMeta = metaOf(conv);
		const knownName = contactName ?? conv?.contactName ?? null;
		const history = await loadConversationHistory(conversationId);

		const initialState: AgentGraphStateType = {
			messages: history.map(toBaseMessage),
			conversationId,
			channel,
			contactName: knownName,
			isUserTurn,
			userText,
			baseMeta,
			intent: undefined,
			gate: undefined,
			funnel: funnelFromMeta(baseMeta),
			events: [],
		};

		const stream = await graph.stream(initialState, {
			streamMode: ["custom", "values"],
		});

		let finalState: AgentGraphStateType | undefined;
		for await (const [mode, chunk] of stream as AsyncIterable<
			["custom", TurnEvent] | ["values", AgentGraphStateType]
		>) {
			if (mode === "custom") {
				yield chunk as TurnEvent;
			} else {
				finalState = chunk as AgentGraphStateType;
			}
		}
		if (!finalState) {
			throw new Error("[langgraph] graph.stream() terminou sem estado final (values)");
		}

		for (const ev of finalState.events as TurnEvent[]) {
			if (LIVE_EVENT_TYPES.has(ev.type)) continue;
			yield ev;
		}
	};
}

/** `RuntimeAdapter` resolvido com o provider real — é o que o dispatcher
 * (`runTurn`, orchestrator/index.ts) importa. */
export const runTurnLangGraph = createRunTurnLangGraph();

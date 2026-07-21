// `runTurnLangGraph` — o `RuntimeAdapter` real (FIX-358, walking skeleton).
// Carrega o estado da conversa (reloadMeta→funnel), roda o grafo mínimo
// (analyze→route→converse→[discovery?]→emitCard→persist) e devolve os
// TurnEvent acumulados.
//
// DECISÃO DE DESIGN (documentar no .done/): esta fundação roda o grafo
// INTEIRO via `graph.invoke()` (não `graph.stream()`) e só emite os
// TurnEvent DEPOIS que o turno inteiro — persistência incluída — terminou.
// Sacrifica o streaming de token ao vivo (UX) em troca de simplicidade e da
// garantia de ordem "persistMeta antes de qualquer 'gate'" por TOPOLOGIA
// (nenhum evento sai antes do fim). Os nós já chamam `config.writer(...)`
// pros tipos sem dependência de leitura fresca do banco (`text-delta`,
// `tool-call` — ver `nodes/converse.ts`) — infraestrutura pronta pra Rodada 1
// trocar `invoke` por `stream(..., { streamMode: ["custom", "values"] })` e
// ligar o streaming ao vivo de verdade sem tocar nos nós.
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

		const finalState = await graph.invoke(initialState);

		for (const ev of finalState.events as TurnEvent[]) {
			yield ev;
		}
	};
}

/** `RuntimeAdapter` resolvido com o provider real — é o que o dispatcher
 * (`runTurn`, orchestrator/index.ts) importa. */
export const runTurnLangGraph = createRunTurnLangGraph();

// `runTurnLangGraph` — o `RuntimeAdapter` real. Runtime DIRIGIDO POR INTERRUPT:
// o grafo (graph.ts) pausa no nó `human` a cada turno (estado salvo no
// checkpointer Postgres por thread_id=conversationId), e ESTE arquivo decide,
// a cada chamada, se INICIA o grafo (1º turno) ou RESUME do interrupt
// (`Command({resume: userText})`). Isso é o que dá o avanço DETERMINÍSTICO —
// a posição no funil é durável, não recalculada "na sorte".
//
// Streaming: `graph.stream(..., { streamMode: ["custom","values"] })`.
//  - "custom": `config.writer(...)` dos nós (text-delta/tool-call) sai AO VIVO.
//  - "values": último snapshot (pós-`persist`) → drena `state.events` filtrando
//    o que já saiu ao vivo (LIVE_EVENT_TYPES) pra não duplicar.
import { eq } from "drizzle-orm";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import type { TurnEvent, TurnInput } from "@/lib/agent/orchestrator/types";
import { loadConversationHistory } from "@/lib/conversation/messages";
import { metaOf } from "@/lib/conversation/meta";
import { type AgentGraph, buildAgentGraph } from "./graph";
import { type AgentGraphStateType, funnelFromMeta } from "./state";

function toBaseMessage(m: { role: "user" | "assistant"; content: string }): BaseMessage {
	return m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content);
}

const LIVE_EVENT_TYPES: ReadonlySet<TurnEvent["type"]> = new Set(["text-delta", "tool-call"]);

export function createRunTurnLangGraph(deps?: {
	model?: BaseChatModel;
}): (input: TurnInput) => AsyncGenerator<TurnEvent> {
	// Build lazy/assíncrono — `buildAgentGraph` awaita o checkpointer Postgres.
	let graphPromise: Promise<AgentGraph> | null = null;
	const getGraph = () => {
		graphPromise ??= buildAgentGraph(deps);
		return graphPromise;
	};

	return async function* runTurnLangGraphImpl(input: TurnInput): AsyncGenerator<TurnEvent> {
		const { channel, conversationId, userText, isUserTurn, contactName } = input;
		if (!conversationId) throw new Error("[langgraph] conversationId is required");

		const graph = await getGraph();
		// `configurable` sozinho pro getState; o `streamMode` só entra no stream.
		// Sem separar, o `as const` deixava o array `readonly` e o tipo do Pregel
		// (que espera StreamMode[] mutável) não casava — erro de tsc que passaria
		// batido porque o gate do container não roda typecheck.
		const config = { configurable: { thread_id: conversationId } };
		const streamMode: Array<"custom"> = ["custom"];

		// Já existe um checkpoint pausado num interrupt? → resume. Senão → inicia.
		let interrupted = false;
		try {
			const snapshot = await graph.getState(config);
			interrupted = (snapshot?.next?.length ?? 0) > 0;
		} catch {
			interrupted = false; // sem checkpointer (testes) → sempre inicia
		}

		// A meta do banco é a AUTORIDADE, todo turno. Antes ela era lida uma única
		// vez (só no start), e o grafo ficava surdo a tudo que os handlers de card
		// escrevem por fora dele — submit de CPF (`storeIdentity`), nome, slider de
		// valor. Efeito ao vivo: o usuário mandava CPF+celular, `route.ts` gravava
		// `identityCollected: true`, mas o grafo seguia com `false` e `nextGate`
		// re-emitia o MESMO formulário de identidade, para sempre — e a busca nunca
		// liberava (`readyForDiscovery` exige identidade).
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const baseMeta = metaOf(conv);

		let streamInput: Command | AgentGraphStateType;
		if (interrupted) {
			// O `human` estava pausado; o resume vira o retorno do interrupt(). O
			// `update` re-hidrata o estado com o que o banco sabe AGORA.
			streamInput = new Command({
				resume: userText,
				update: {
					// A ORIGEM do turno vem do chamador, sempre. Sem isto o `human`
					// cravava `isUserTurn: true` e directive de servidor virava fala do
					// cliente no banco e na tela.
					isUserTurn,
					baseMeta,
					funnel: funnelFromMeta(baseMeta),
					contactName: contactName ?? conv?.contactName ?? null,
				},
			});
		} else {
			const history = await loadConversationHistory(conversationId);
			streamInput = {
				messages: history.map(toBaseMessage),
				conversationId,
				channel,
				contactName: contactName ?? conv?.contactName ?? null,
				isUserTurn,
				userText,
				baseMeta,
				intent: undefined,
				gate: undefined,
				answeredGate: undefined,
				modelAskedQuestion: false,
			apresentaOfertaNesteTurno: false,
			streamedArtifactIds: [],
				funnel: funnelFromMeta(baseMeta),
				events: [],
			} satisfies AgentGraphStateType;
		}

		// biome-ignore lint/suspicious/noExplicitAny: input é estado-inicial completo OU Command(resume)
		const stream = await graph.stream(streamInput as any, { ...config, streamMode });

		// Os nós emitem TODOS os eventos ao vivo via `config.writer` (streamMode
		// "custom"), então aqui é só repasse. O drain do `values` final foi
		// REMOVIDO de propósito: quando o grafo pausa no `interrupt()`, o último
		// chunk de "values" não é o estado — é o sentinela `{__interrupt__:[…]}`,
		// que não tem `events`. Guardá-lo como estado final fazia o drain iterar
		// sobre `undefined ?? []` e NENHUM card (gate, artifact, meta-update,
		// finish) chegava ao cliente, nos dois canais.
		for await (const [mode, chunk] of stream as AsyncIterable<["custom", TurnEvent]>) {
			if (mode === "custom") yield chunk as TurnEvent;
		}
	};
}

export const runTurnLangGraph = createRunTurnLangGraph();

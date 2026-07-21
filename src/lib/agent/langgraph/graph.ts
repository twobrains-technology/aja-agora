// Grafo do runtime LangGraph — DIRIGIDO POR INTERRUPT (boa prática LangGraph
// pra funil multi-turno: interrupt() + checkpointer + Command, doc oficial).
//
// Topologia (LOOP, não passe único):
//   START → capture → analyze → route → advance → routeFinal → converse
//         → [discovery?] → emitCard → persist → human(interrupt) ─┐
//                                                     ▲            │
//                                                     └── resume ──┘  (goto capture)
//
// Por que interrupt: o funil PAUSA no `human` (estado salvo no checkpointer
// Postgres por thread_id=conversationId) e o próximo turno RESUME daquele ponto
// — a posição no funil é DURÁVEL, nunca recalculada "na sorte". O avanço é
// determinístico (route computa o próximo gate; converse fala; human espera),
// NUNCA um beco sem saída onde o modelo reage e não avança.
//
// `capture` roda ANTES do analyze e faz a captura determinística que o analyzer
// livre não pega (o nome no gate `name`) — o gate anterior (`gate`) diz o que a
// resposta deste turno responde.
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Command, MemorySaver, START, StateGraph, interrupt } from "@langchain/langgraph";
import { getCheckpointer } from "./checkpointer";
import { advanceFunnelNode } from "./nodes/advance";
import { analyzeNode } from "./nodes/analyze";
import { captureAnswerNode } from "./nodes/capture";
import { createConverseNode } from "./nodes/converse";
import { discoveryNode } from "./nodes/discovery";
import { emitCardNode } from "./nodes/emit-card";
import { persistNode } from "./nodes/persist";
import { routeNode, routeToDiscovery } from "./nodes/route";
import { makeLangGraphModel } from "./provider";
import { AgentGraphState, type AgentGraphStateType } from "./state";

/** Nó `human` — o coração do interrupt. Pausa o grafo e devolve a mensagem do
 * usuário no resume. Nada roda ANTES do interrupt (o nó re-executa no resume,
 * então side-effect antes = duplicado). Reseta o estado do turno e volta pro
 * topo do loop (`capture`). */
function humanNode(_state: AgentGraphStateType): Command {
	const userText = interrupt<string, string>("aguardando-resposta-do-usuario");
	return new Command({
		update: {
			userText: userText ?? "",
			// `isUserTurn` NÃO é cravado aqui. Cravar `true` fazia TODO turno de
			// servidor (directive) que entra pelo resume ser reclassificado como fala
			// do cliente — o `persist` gravava com role "user" e o prompt interno
			// inteiro aparecia na tela, em balão azul, como se o cliente tivesse
			// digitado. Quem sabe se o turno é do usuário é o chamador (`run-turn`),
			// que passa o valor no `update` do Command de resume.
			events: null, // sentinela: reseta os TurnEvents pro novo turno (ver state.ts)
			intent: undefined,
			// `gate` NÃO é resetado — o `capture` (próximo nó) precisa saber qual
			// gate o usuário está respondendo. `route`/`routeFinal` sobrescrevem.
		},
		goto: "capture",
	});
}

export async function buildAgentGraph(deps?: { model?: BaseChatModel; checkpointer?: unknown }) {
	const model = deps?.model ?? makeLangGraphModel();
	const converseNode = createConverseNode(model);
	// O grafo TEM um nó `human` com `interrupt()`, e `interrupt` exige
	// checkpointer — sem ele o Pregel lança `No checkpointer set` assim que o
	// fluxo chega no `human`. Deixar os testes (que injetam `model`) sem
	// checkpointer quebrava o grafo inteiro, não só a persistência.
	//
	// Produção: o singleton compartilhado (`getCheckpointer`). Testes com model
	// injetado: um saver PRÓPRIO por build — o interrupt funciona e nenhum teste
	// enxerga o thread de outro.
	const checkpointer =
		deps?.checkpointer !== undefined
			? deps.checkpointer
			: deps?.model
				? new MemorySaver()
				: await getCheckpointer();

	const builder = new StateGraph(AgentGraphState)
		.addNode("capture", captureAnswerNode)
		.addNode("analyze", analyzeNode)
		.addNode("route", routeNode)
		.addNode("advance", advanceFunnelNode)
		.addNode("routeFinal", routeNode)
		.addNode("converse", converseNode)
		.addNode("discovery", discoveryNode)
		.addNode("emitCard", emitCardNode)
		.addNode("persist", persistNode)
		.addNode("human", humanNode, { ends: ["capture"] })
		.addEdge(START, "capture")
		.addEdge("capture", "analyze")
		.addEdge("analyze", "route")
		.addEdge("route", "advance")
		// A busca roda ANTES de o modelo falar. Antes era o contrário (`converse` →
		// `discovery`): o modelo abria a boca sem nenhum resultado na mão, produzia
		// "só um segundo que já te trago — enquanto isso, me conta..." e o gate da
		// pergunta seguinte só disparava no turno DEPOIS, colidindo com o que o
		// usuário tivesse clicado (ex.: "Simular ITAÚ" respondido com "você já fez
		// consórcio antes?"). Agora: descobre → recalcula o gate com o resultado já
		// no estado → o modelo apresenta as ofertas REAIS e faz UMA pergunta, no
		// mesmo turno em que os cards aparecem.
		.addConditionalEdges("advance", routeToDiscovery, ["discovery", "routeFinal"])
		.addEdge("discovery", "routeFinal")
		.addEdge("routeFinal", "converse")
		.addEdge("converse", "emitCard")
		.addEdge("emitCard", "persist")
		.addEdge("persist", "human");

	// biome-ignore lint/suspicious/noExplicitAny: tipo do checkpointer varia
	return builder.compile(checkpointer ? { checkpointer: checkpointer as any } : undefined);
}

export type AgentGraph = Awaited<ReturnType<typeof buildAgentGraph>>;

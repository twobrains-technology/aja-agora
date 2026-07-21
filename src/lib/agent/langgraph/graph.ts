// Grafo mínimo end-to-end (FIX-358, walking skeleton). Topologia do slice
// desta fundação: analyze → route → converse → [discovery? emitCard] →
// persist. Aresta de escape embutida na própria topologia: `converse`
// SEMPRE fala (nunca pulado), e a aresta condicional pós-converse cai em
// `emitCard` direto (sem card nenhum, se `state.gate` for undefined) sempre
// que a descoberta não estiver pronta — o usuário desviando do funil nunca
// trava o turno, só não dispara um card estruturado.
//
// `deps.model` — injeção de dependência do `ChatAnthropic` (default,
// `makeLangGraphModel()`) por um `BaseChatModel` qualquer (`FakeStreaming
// ChatModel` nos testes, sem gateway real).
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { END, START, StateGraph } from "@langchain/langgraph";
import { advanceFunnelNode } from "./nodes/advance";
import { analyzeNode } from "./nodes/analyze";
import { createConverseNode } from "./nodes/converse";
import { discoveryNode } from "./nodes/discovery";
import { emitCardNode } from "./nodes/emit-card";
import { persistNode } from "./nodes/persist";
import { routeAfterConverse, routeNode } from "./nodes/route";
import { makeLangGraphModel } from "./provider";
import { AgentGraphState } from "./state";

export function buildAgentGraph(deps?: { model?: BaseChatModel }) {
	const model = deps?.model ?? makeLangGraphModel();
	const converseNode = createConverseNode(model);

	return (
		new StateGraph(AgentGraphState)
			.addNode("analyze", analyzeNode)
			.addNode("route", routeNode)
			.addNode("advance", advanceFunnelNode)
			// FIX-360 — `routeNode` roda DE NOVO (mesmíssima função pura,
			// `nextGate`/`decideShowGate` reusados) depois que `advance` já
			// aplicou os marcadores de dispatch/resposta deste turno (ex.:
			// `recoConsentAnswered`) — sem isso, o evento "gate" mostraria o
			// gate ANTIGO (o que o usuário acabou de responder) no mesmo turno
			// em que ele já avançou. Idempotente: turnos onde `advance` não muda
			// nada recomputam o MESMO gate.
			.addNode("routeFinal", routeNode)
			.addNode("converse", converseNode)
			.addNode("discovery", discoveryNode)
			.addNode("emitCard", emitCardNode)
			.addNode("persist", persistNode)
			.addEdge(START, "analyze")
			.addEdge("analyze", "route")
			.addEdge("route", "advance")
			.addEdge("advance", "routeFinal")
			.addEdge("routeFinal", "converse")
			.addConditionalEdges("converse", routeAfterConverse, ["discovery", "emitCard"])
			.addEdge("discovery", "emitCard")
			.addEdge("emitCard", "persist")
			.addEdge("persist", END)
			.compile()
	);
}

export type AgentGraph = ReturnType<typeof buildAgentGraph>;

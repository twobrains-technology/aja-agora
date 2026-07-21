// Nó `route` — guarda de rota do grafo (reusa `nextGate`/`decideShowGate`,
// `qualify-state.ts`, ZERO lógica nova de sequenciamento). Decide SE/QUANDO
// mostrar um card estruturado (`state.gate`); NUNCA decide o que o modelo
// fala — isso é sempre do nó `converse` (lei-mãe "não engessar").
//
// `readyForDiscovery` é o invariante I1 desta fundação — "descoberta nunca
// dispara sem identidade + valor" — vira PREDICADO PURO exportado pra teste
// direto (TDD strict), não side-effect escondido dentro do nó.
import { decideShowGate, nextGate } from "@/lib/agent/qualify-state";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType, FunnelState } from "../state";

export function readyForDiscovery(funnel: FunnelState): boolean {
	return (
		funnel.identityCollected &&
		funnel.qualifyAnswers.creditMax !== undefined &&
		Boolean(funnel.currentCategory) &&
		!funnel.searchDispatched
	);
}

export function routeNode(state: AgentGraphStateType): Partial<AgentGraphStateType> {
	const meta = projectToMeta(state);
	const gate = nextGate(meta, { hasContactName: Boolean(state.contactName) });
	const showGate = decideShowGate({
		gate,
		intent: state.intent ?? "neutral",
		meta,
		isUserTurn: state.isUserTurn,
	});
	return { gate: showGate ? gate : undefined };
}

/** Aresta condicional pós-`converse`: dispara `discovery` quando o slice
 * está pronto (I1); senão pula direto pro `emitCard` (aresta de escape —
 * usuário desviou, gate não pronto, ou já buscado neste turno). */
export function routeAfterConverse(state: AgentGraphStateType): "discovery" | "emitCard" {
	return readyForDiscovery(state.funnel) ? "discovery" : "emitCard";
}

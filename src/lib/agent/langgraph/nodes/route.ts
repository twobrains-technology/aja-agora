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
	const base =
		funnel.identityCollected &&
		funnel.qualifyAnswers.creditMax !== undefined &&
		Boolean(funnel.currentCategory);
	if (!base) return false;
	if (!funnel.searchDispatched) return true;
	// FIX-360 — troca de faixa de valor PÓS-reveal re-dispara a descoberta
	// (equivalente a `revealValueTargetChanged`, tool-policy.ts): só quando o
	// valor-alvo ATUAL diverge do que foi de fato buscado da última vez —
	// afirmativo curto na MESMA faixa (`discoveredCreditTarget` ausente ou
	// igual) segue idempotente (I1 original preservado).
	return (
		funnel.discoveredCreditTarget !== undefined &&
		funnel.qualifyAnswers.creditMax !== funnel.discoveredCreditTarget
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

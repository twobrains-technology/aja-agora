// Nó `route` — guarda de rota do grafo (reusa `nextGate`/`decideShowGate`,
// `qualify-state.ts`, ZERO lógica nova de sequenciamento). Decide SE/QUANDO
// mostrar um card estruturado (`state.gate`); NUNCA decide o que o modelo
// fala — isso é sempre do nó `converse` (lei-mãe "não engessar").
//
// `readyForDiscovery` é o invariante I1 desta fundação — "descoberta nunca
// dispara sem identidade + valor" — vira PREDICADO PURO exportado pra teste
// direto (TDD strict), não side-effect escondido dentro do nó.
import { decideShowGate, nextGate, shouldAskMotive } from "@/lib/agent/qualify-state";
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
	// Beat do MOTIVO tem turno próprio (`shouldAskMotive`), e nele o card é os
	// ATALHOS DE RESPOSTA da pergunta que o modelo acabou de fazer — não uma
	// segunda pergunta competindo no mesmo balão (que é o que `decideShowGate`
	// suprime). Por isso ele é forçado aqui, e só ele.
	if (state.isUserTurn && shouldAskMotive(meta)) {
		return { gate: "desire", answeredGate: "desire" };
	}
	const gate = nextGate(meta, { hasContactName: Boolean(state.contactName) });
	const showGate = decideShowGate({
		gate,
		intent: state.intent ?? "neutral",
		meta,
		isUserTurn: state.isUserTurn,
	});
	// Uma linha por decisão de rota — é o que permite ler no log POR QUE o funil
	// parou onde parou (o "travou e não seguiu" sempre nasce aqui). Barato e sem
	// PII: só o nome do gate e as flags que o decidem.
	console.log(
		`[route] gate=${gate} show=${showGate} intent=${state.intent} isUserTurn=${state.isUserTurn} reveal=${meta.revealCompleted} decision=${meta.decisionDispatched} form=${meta.contractFormDispatched}`,
	);
	// `answeredGate` guarda o gate COMPUTADO (o que o funil aguarda), mesmo quando
	// o card é suprimido — é o que o `capture` lê no turno seguinte.
	return { gate: showGate ? gate : undefined, answeredGate: gate };
}

/** Aresta condicional pós-`advance`: dispara `discovery` quando o slice está
 * pronto (I1); senão vai direto pro `routeFinal`. A busca acontece ANTES de o
 * modelo falar — ele apresenta números que já existem, nunca promete "já te
 * trago". */
export function routeToDiscovery(state: AgentGraphStateType): "discovery" | "routeFinal" {
	return readyForDiscovery(state.funnel) ? "discovery" : "routeFinal";
}

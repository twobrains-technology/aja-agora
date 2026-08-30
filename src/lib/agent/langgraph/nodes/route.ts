// Nó `route` — guarda de rota do grafo (reusa `nextGate`/`decideShowGate`,
// `qualify-state.ts`, ZERO lógica nova de sequenciamento). Decide SE/QUANDO
// mostrar um card estruturado (`state.gate`); NUNCA decide o que o modelo
// fala — isso é sempre do nó `converse` (lei-mãe "não engessar").
//
// `readyForDiscovery` é o invariante I1 desta fundação — "descoberta nunca
// dispara sem identidade + valor" — vira PREDICADO PURO exportado pra teste
// direto (TDD strict), não side-effect escondido dentro do nó.

import { alvoDeBusca } from "@/lib/agent/qualify-answers";
import { decideShowGate, nextGate, shouldAskMotive } from "@/lib/agent/qualify-state";
import { vitrineDisponivel } from "@/lib/bevi/identidade-vitrine";
import { creditoBuscavel } from "@/lib/consorcio/credito-minimo";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType, FunnelState } from "../state";

/**
 * Quantas tentativas VAZIAS o mesmo alvo pode gastar antes de o funil parar de
 * insistir.
 *
 * Duas, e não uma, porque a Bevi cai de verdade: um retry cobre a falha
 * transitória, e é também o que o FIX-380 usa como gatilho para trocar de
 * estratégia (na segunda vazia o funil volta a pedir o valor em vez de prometer
 * de novo). O que não pode é o que aconteceu em `fa0533a0-…`: quatro chamadas
 * idênticas, uma por turno, à mesma faixa impossível.
 */
const TENTATIVAS_VAZIAS_POR_ALVO = 2;

/** O alvo corrente é exatamente o que a última busca já levou à Bevi? */
function mesmoAlvoJaTentado(funnel: FunnelState): boolean {
	if (alvoDeBusca(funnel.qualifyAnswers) === "parcela") {
		return (
			funnel.discoveredParcelaTarget !== undefined &&
			funnel.qualifyAnswers.parcelaAlvo === funnel.discoveredParcelaTarget
		);
	}
	return (
		funnel.discoveredCreditTarget !== undefined &&
		funnel.qualifyAnswers.creditMax === funnel.discoveredCreditTarget
	);
}

export function readyForDiscovery(funnel: FunnelState): boolean {
	const base =
		// A identidade deixa de ser pré-requisito da BUSCA (2026-08-27): quando há
		// vitrine configurada, a proposta Bevi que a simulação exige é criada com
		// a identidade da casa (`identidade-vitrine.ts`) e o cliente vê a carta
		// antes de entregar documento nenhum. Sem vitrine, a condição volta a ser
		// exatamente a de antes. O CPF real continua obrigatório para CONTRATAR —
		// `nextGate` pede no fecho e `startContract` recusa a identidade de
		// vitrine.
		(funnel.identityCollected || vitrineDisponivel()) &&
		// FIX-377 — não basta EXISTIR: tem que ser buscável. Faixa abaixo do piso
		// da Bevi volta vazia sempre, e o `discovery` tratava vazio com silêncio +
		// retry liberado — o que virava loop de "vou pesquisar agora". Barrar aqui
		// economiza a chamada e devolve o funil pro gate `credit`.
		// FIX-382 — a parcela tambem e um alvo de busca valido (a Bevi busca por
		// `INSTALLMENT_VALUE`). Quem so disse quanto cabe no bolso deixa de ficar
		// preso no gate `credit` sem nenhuma saida.
		(creditoBuscavel(
			funnel.qualifyAnswers.creditMax,
			funnel.qualifyAnswers.creditoMinimoInformado,
		) ||
			(funnel.qualifyAnswers.parcelaAlvo ?? 0) > 0) &&
		Boolean(funnel.currentCategory);
	if (!base) return false;
	// Busca que voltou VAZIA não marca `searchDispatched` (o retry precisa ficar
	// liberado quando a Bevi cai). Mas ela registra o alvo tentado — e repetir a
	// pergunta idêntica não muda a resposta: a mesma faixa impossível foi à Bevi
	// quatro turnos seguidos em `fa0533a0-…`. Enquanto o alvo não mudar, não há
	// o que buscar de novo.
	if (!funnel.searchDispatched) {
		const esgotou =
			mesmoAlvoJaTentado(funnel) &&
			(funnel.discoveryEmptyStreak ?? 0) >= TENTATIVAS_VAZIAS_POR_ALVO;
		return !esgotou;
	}
	// Alvo por PARCELA tem o snapshot dele. Sem isto, quem trocava de alvo
	// (valor → parcela) nunca re-disparava a busca: o `creditMax` continuava
	// igual ao já buscado, a condição abaixo dava false, e o cliente ouvia
	// "deixa eu buscar o que cabe em R$ 200" sem que busca nenhuma acontecesse.
	if (alvoDeBusca(funnel.qualifyAnswers) === "parcela") {
		return funnel.qualifyAnswers.parcelaAlvo !== funnel.discoveredParcelaTarget;
	}
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

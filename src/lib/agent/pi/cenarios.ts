// OS 3 CENÁRIOS DE CONTEMPLAÇÃO — cálculo DETERMINÍSTICO a partir da carta real.
//
// Na main o card de cenários vinha de `compute_scenarios`, tool de DADO: o
// payload era o RESULTADO dela e o modelo só carregava a chave. A refatoração
// cortou as tools do funil (`present_*`/`compute_*`), não o comportamento — e o
// motor continua de pé em `src/lib/agent/scenarios.ts`, que por sua vez usa o
// mesmo `computeContemplationDial` do simulador-agulha. É ele que chamamos aqui,
// com os números de uma carta que a conversa JÁ mostrou.
//
// O que o modelo pode dizer é QUAL carta (`groupId`); mês-alvo, percentual de
// lance e valor de oferta não entram na conta. Sem carta não há cenário — quem
// monta o card recusa e manda buscar primeiro.

import type { GroupSummary } from "@/lib/adapters/types";
import { computeScenarios } from "@/lib/agent/scenarios";
import type { ScenariosPayload } from "@/lib/chat/types";

/**
 * O payload de `scenarios` para uma carta REAL da conversa.
 *
 * `lanceDeclarado` é o dinheiro que o cliente já disse ter (qualificação): ele
 * entra como recursos do próprio bolso e o embutido cobre só o que faltar —
 * mesma entrada que a tool da main passava como `ownCashAvailable`. Sem ele, o
 * motor calcula o lance inteiro pelo embutido.
 */
export function cenariosDaCarta(
	grupo: GroupSummary,
	lanceDeclarado?: number | null,
): ScenariosPayload {
	const cenarios = computeScenarios({
		creditValue: grupo.creditValue,
		termMonths: grupo.termMonths,
		monthlyPayment: grupo.monthlyPayment,
		...(typeof grupo.avgBidValue === "number" ? { averageBid: grupo.avgBidValue } : {}),
		...(typeof lanceDeclarado === "number" && lanceDeclarado > 0
			? { ownCashAvailable: lanceDeclarado }
			: {}),
	});
	return {
		groupId: grupo.id,
		administradora: grupo.administradora,
		creditValue: grupo.creditValue,
		termMonths: grupo.termMonths,
		scenarios: {
			// Cópia por campo: só as seis chaves de `ScenarioPayload` vão para a
			// tela — nada de campo interno do motor vazando para o renderer.
			conservador: {
				lancePercent: cenarios.conservador.lancePercent,
				lanceValue: cenarios.conservador.lanceValue,
				ownResourcesValue: cenarios.conservador.ownResourcesValue,
				expectedTermMonths: cenarios.conservador.expectedTermMonths,
				strategy: cenarios.conservador.strategy,
				disclaimer: cenarios.conservador.disclaimer,
			},
			provavel: {
				lancePercent: cenarios.provavel.lancePercent,
				lanceValue: cenarios.provavel.lanceValue,
				ownResourcesValue: cenarios.provavel.ownResourcesValue,
				expectedTermMonths: cenarios.provavel.expectedTermMonths,
				strategy: cenarios.provavel.strategy,
				disclaimer: cenarios.provavel.disclaimer,
			},
			acelerado: {
				lancePercent: cenarios.acelerado.lancePercent,
				lanceValue: cenarios.acelerado.lanceValue,
				ownResourcesValue: cenarios.acelerado.ownResourcesValue,
				expectedTermMonths: cenarios.acelerado.expectedTermMonths,
				strategy: cenarios.acelerado.strategy,
				disclaimer: cenarios.acelerado.disclaimer,
			},
		},
	};
}

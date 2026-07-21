/**
 * Cenários de contemplação (bug #16 — Bruna v1 review).
 *
 * Premissas pré-cravadas em CLAUDE.md plan (refináveis com dados reais):
 * - Conservador: 0% lance, contemplação só por sorteio — prazo nominal
 * - Provável: 20% lance parcial — prazo ≈ 60% do nominal
 * - Acelerado: 30% lance embutido + recursos próprios — prazo ≈ 35% do nominal
 *
 * Risco regulatório: prazo é ESTIMATIVA, não garantia. Disclaimer obrigatório
 * em cada cenário (CDC art. 30/37).
 */

import { computeContemplationDial } from "@/lib/consorcio/contemplation-dial";

export interface ScenarioInput {
	creditValue: number;
	termMonths: number;
	/** Parcela da oferta real. Quando presente (junto com os demais dados do
	 * grupo), o lance de cada cenário passa a sair do MESMO motor que o
	 * simulador de contemplação usa — ver `computeScenarios`. */
	monthlyPayment?: number;
	/** Lance médio do grupo em R$ (fonte preferencial da curva). */
	averageBid?: number;
	/** Dinheiro que o cliente já tem pra lance. */
	ownCashAvailable?: number;
	/** Teto de embutido do grupo; 0 quando o cliente recusou embutido. */
	maxEmbutidoPct?: number;
}

export interface Scenario {
	lancePercent: number;
	/** Valor do lance em R$ (lancePercent × creditValue). */
	lanceValue: number;
	/** R$ que o usuário precisa colocar do próprio bolso (>0 só no acelerado). */
	ownResourcesValue: number;
	expectedTermMonths: number;
	strategy: string;
	disclaimer: string;
}

export interface ScenariosResult {
	conservador: Scenario;
	provavel: Scenario;
	acelerado: Scenario;
}

const DISCLAIMER =
	"Estimativa baseada em premissa de mercado. Contemplação real depende de sorteio/lance da assembleia — não há garantia de prazo.";

// Acelerado: 30% lance + 10% recursos próprios (cenário Bruna v1).
const ACELERADO_LANCE_PCT = 30;
const ACELERADO_OWN_RESOURCES_PCT = 10;

export function computeScenarios(input: ScenarioInput): ScenariosResult {
	const { creditValue, termMonths } = input;
	const provavelMonths = Math.max(1, Math.ceil(termMonths * 0.6));
	const aceleradoMonths = Math.max(1, Math.ceil(termMonths * 0.35));

	// MESMO MÊS, MESMO LANCE — os dois caminhos falam o mesmo número.
	//
	// Estes cenários usavam percentuais cravados (20% no provável, 30% no
	// acelerado) enquanto o simulador de contemplação calculava pela curva real
	// do grupo. O cliente ouvia "pro mês 30 o lance é 20% (R$ 26.231)" e, no
	// turno seguinte, "pro mês 30 o lance é 14% (R$ 18.361,84)" — mesma carta,
	// mesmo mês, dois motores. Com os dados da oferta real na mão, o lance de
	// cada cenário passa a sair do motor único; sem eles (chamador legado), o
	// comportamento cravado continua valendo.
	const doMotor = (targetMonth: number): { pct: number; lance: number; bolso: number } | null => {
		if (!input.monthlyPayment) return null;
		const d = computeContemplationDial({
			creditValue,
			termMonths,
			monthlyPayment: input.monthlyPayment,
			targetMonth,
			...(input.averageBid != null ? { averageBid: input.averageBid } : {}),
			...(input.ownCashAvailable != null ? { ownCashAvailable: input.ownCashAvailable } : {}),
			...(input.maxEmbutidoPct != null ? { maxEmbutidoPct: input.maxEmbutidoPct } : {}),
		});
		return { pct: d.requiredLancePct, lance: d.requiredLanceValue, bolso: d.ownCashValue };
	};
	const provavel = doMotor(provavelMonths);
	const acelerado = doMotor(aceleradoMonths);

	if (provavel && acelerado) {
		return {
			conservador: {
				lancePercent: 0,
				lanceValue: 0,
				ownResourcesValue: 0,
				expectedTermMonths: termMonths,
				strategy:
					"Sem lance — contemplação por sorteio. Mais cauteloso, mas pode demorar até o fim do prazo.",
				disclaimer: DISCLAIMER,
			},
			provavel: {
				lancePercent: provavel.pct,
				lanceValue: provavel.lance,
				ownResourcesValue: provavel.bolso,
				expectedTermMonths: provavelMonths,
				strategy: `Lance de ${provavel.pct}% da carta — equilíbrio entre velocidade e custo inicial.`,
				disclaimer: DISCLAIMER,
			},
			acelerado: {
				lancePercent: acelerado.pct,
				lanceValue: acelerado.lance,
				ownResourcesValue: acelerado.bolso,
				expectedTermMonths: aceleradoMonths,
				strategy: `Lance de ${acelerado.pct}% da carta — maior chance de contemplar nos primeiros meses.`,
				disclaimer: DISCLAIMER,
			},
		};
	}

	return {
		conservador: {
			lancePercent: 0,
			lanceValue: 0,
			ownResourcesValue: 0,
			expectedTermMonths: termMonths,
			strategy:
				"Sem lance — contemplação por sorteio. Mais cauteloso, mas pode demorar até o fim do prazo.",
			disclaimer: DISCLAIMER,
		},
		provavel: {
			lancePercent: 20,
			lanceValue: Math.round(creditValue * 0.2),
			ownResourcesValue: 0,
			expectedTermMonths: provavelMonths,
			strategy: "Lance parcial de 20% do crédito — equilíbrio entre velocidade e custo inicial.",
			disclaimer: DISCLAIMER,
		},
		acelerado: {
			lancePercent: ACELERADO_LANCE_PCT,
			lanceValue: Math.round(creditValue * (ACELERADO_LANCE_PCT / 100)),
			ownResourcesValue: Math.round(creditValue * (ACELERADO_OWN_RESOURCES_PCT / 100)),
			expectedTermMonths: aceleradoMonths,
			strategy:
				"Lance embutido (30%) + recursos próprios (10%) — maior chance de contemplar nos primeiros meses.",
			disclaimer: DISCLAIMER,
		},
	};
}

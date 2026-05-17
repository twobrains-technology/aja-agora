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

export interface ScenarioInput {
	creditValue: number;
	termMonths: number;
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

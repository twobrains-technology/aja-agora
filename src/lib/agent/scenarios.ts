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

export function computeScenarios(input: ScenarioInput): ScenariosResult {
	const { termMonths } = input;
	const provavelMonths = Math.max(1, Math.ceil(termMonths * 0.6));
	const aceleradoMonths = Math.max(1, Math.ceil(termMonths * 0.35));
	return {
		conservador: {
			lancePercent: 0,
			expectedTermMonths: termMonths,
			strategy:
				"Sem lance — contemplação por sorteio. Mais cauteloso, mas pode demorar até o fim do prazo.",
			disclaimer: DISCLAIMER,
		},
		provavel: {
			lancePercent: 20,
			expectedTermMonths: provavelMonths,
			strategy: "Lance parcial de 20% do crédito — equilíbrio entre velocidade e custo inicial.",
			disclaimer: DISCLAIMER,
		},
		acelerado: {
			lancePercent: 30,
			expectedTermMonths: aceleradoMonths,
			strategy:
				"Lance embutido (30%) + recursos próprios — maior chance de contemplar nos primeiros meses.",
			disclaimer: DISCLAIMER,
		},
	};
}

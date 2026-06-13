import type { ConsorcioCategory } from "@/lib/adapters/types";

/**
 * Tabela Price (PMT) — parcela fixa de um financiamento.
 *
 *   PMT = principal × i / (1 - (1 + i)^-n)
 *
 * onde i = taxa mensal (decimal), n = prazo em meses.
 *
 * Recebe taxa anual em PERCENTUAL (ex: 10 = 10%/ano) e converte para
 * mensal NOMINAL (a / 12), convenção do mercado brasileiro de
 * financiamento (não a taxa equivalente composta). 12% a.a. ≡ 1% a.m.
 *
 * Caso degenerado: taxa anual zero → PMT = principal / prazo.
 */
export function computePMT(
	principal: number,
	termMonths: number,
	annualRatePercent: number,
): number {
	if (termMonths <= 0) throw new Error("termMonths must be > 0");
	if (annualRatePercent === 0) return principal / termMonths;
	const monthlyRate = annualRatePercent / 100 / 12;
	return (principal * monthlyRate) / (1 - (1 + monthlyRate) ** -termMonths);
}

/**
 * Premissas de taxa anual (CET aproximado) por categoria. Refinável via env
 * (FINANCING_RATE_IMOVEL etc.) — defaults conservadores baseados em CET
 * BACEN típico maio 2026.
 */
export const DEFAULT_FINANCING_RATES: Record<ConsorcioCategory, number> = {
	imovel: 10,
	auto: 22,
	moto: 28,
	servicos: 25,
};

export interface FinancingComparisonInput {
	creditValue: number;
	termMonths: number;
	category: ConsorcioCategory;
	consorcioMonthlyPayment: number;
	consorcioTotalCost: number;
	/** Override pra premissa de CET anual (default: DEFAULT_FINANCING_RATES[category]). */
	annualRateOverride?: number;
}

export interface FinancingComparisonResult {
	consorcio: {
		monthlyPayment: number;
		totalCost: number;
	};
	financing: {
		monthlyPayment: number;
		totalCost: number;
		annualRate: number;
	};
	diff: {
		monthlyDelta: number; // consorcio - financing (negativo se consórcio mais barato)
		totalDelta: number;
	};
	disclaimer: string;
}

/**
 * Compara parcela e custo total entre consórcio (números reais já calculados
 * pelo adapter) e financiamento (PMT estimado via Price). Bug #17 — Bruna
 * pediu comparador inline.
 *
 * Risco regulatório: comparação de produtos financeiros sem premissa
 * explícita = publicidade comparativa enganosa (CDC art. 37). O campo
 * `disclaimer` é obrigatório no copy ao usuário.
 */
export function compareWithFinancing(input: FinancingComparisonInput): FinancingComparisonResult {
	const annualRate = input.annualRateOverride ?? DEFAULT_FINANCING_RATES[input.category];
	const financingMonthly = computePMT(input.creditValue, input.termMonths, annualRate);
	const financingTotal = financingMonthly * input.termMonths;
	return {
		consorcio: {
			monthlyPayment: input.consorcioMonthlyPayment,
			totalCost: input.consorcioTotalCost,
		},
		financing: {
			monthlyPayment: Math.round(financingMonthly * 100) / 100,
			totalCost: Math.round(financingTotal * 100) / 100,
			annualRate,
		},
		diff: {
			monthlyDelta: Math.round((input.consorcioMonthlyPayment - financingMonthly) * 100) / 100,
			totalDelta: Math.round((input.consorcioTotalCost - financingTotal) * 100) / 100,
		},
		disclaimer: `Comparação estimativa baseada em taxa CET de ${annualRate}% ao ano (média do mercado para ${input.category}). Não é garantia: taxa real de financiamento depende de análise de crédito.`,
	};
}

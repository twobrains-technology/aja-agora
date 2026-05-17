import type { RateInfo } from "../types";

export interface QuotaComputationInput {
	creditValue: number;
	termMonths: number;
	adminFeePercent: number;
	reserveFundPercent: number;
	insurancePercent: number;
}

export interface QuotaComputation {
	adminFeeTotal: number;
	reserveFundTotal: number;
	insuranceMonthly: number;
	insuranceTotal: number;
	totalCost: number;
	monthlyPayment: number;
	effectiveRate: number;
}

const FALLBACK_INSURANCE_PERCENT = 0.03;

export function computeQuota(input: QuotaComputationInput): QuotaComputation {
	const adminFeeTotal = input.creditValue * (input.adminFeePercent / 100);
	const reserveFundTotal = input.creditValue * (input.reserveFundPercent / 100);
	const insuranceMonthly = input.creditValue * (input.insurancePercent / 100);
	const insuranceTotal = insuranceMonthly * input.termMonths;
	const totalCost = input.creditValue + adminFeeTotal + reserveFundTotal + insuranceTotal;
	const monthlyPayment = totalCost / input.termMonths;
	const effectiveRate = ((totalCost - input.creditValue) / input.creditValue) * 100;
	return {
		adminFeeTotal,
		reserveFundTotal,
		insuranceMonthly,
		insuranceTotal,
		totalCost,
		monthlyPayment,
		effectiveRate,
	};
}

export function resolveInsurancePercent(
	rates: ReadonlyArray<RateInfo>,
	administradora: string,
	category: string,
): number {
	const found = rates.find((r) => r.administradora === administradora && r.category === category);
	return found?.insurancePercent ?? FALLBACK_INSURANCE_PERCENT;
}

import type { ConsorcioCategory, GroupSummary } from "@/lib/adapters/types";

// ---- Scoring weights ----

export const WEIGHTS = {
	monthlyFit: 0.4,
	contemplation: 0.25,
	adminFee: 0.2,
	termMatch: 0.15,
} as const;

// ---- Factor scoring functions (all pure, deterministic) ----

/**
 * How well the monthly payment fits the user's budget.
 * Sweet spot: 70-100% of budget. Sharp penalty for over-budget.
 */
export function monthlyFitScore(payment: number, budget: number): number {
	if (budget <= 0) return 0;
	const ratio = payment / budget;
	if (ratio <= 1.0) {
		// Under budget: quadratic curve, peaks at ratio=1.0
		// At ratio=0.3 (~30% usage) score ~0.02, at ratio=0.7 score ~0.82
		return Math.max(0, 1 - (1 - ratio) ** 2 * 2);
	}
	// Over budget: sharp linear penalty (20% over = score 0)
	return Math.max(0, 1 - (ratio - 1) * 5);
}

/**
 * Normalize contemplation rate to 0-1.
 * Typical range: 2-8% per month. 8%+ gets a perfect score.
 * 0 = "sem dado" (mock sem histórico) → neutro 0.5, não zero.
 */
export function contemplationScore(ratePercent: number): number {
	if (ratePercent <= 0) return 0.5;
	return Math.min(1, Math.max(0, ratePercent / 8));
}

/**
 * Lower admin fee = higher score. Normalized against market range per category.
 */
export function adminFeeScore(
	feePercent: number,
	category: ConsorcioCategory,
): number {
	const ranges: Record<ConsorcioCategory, { min: number; max: number }> = {
		imovel: { min: 15, max: 22 },
		auto: { min: 12, max: 18 },
		servicos: { min: 15, max: 20 },
	};
	const { min, max } = ranges[category];
	if (feePercent <= min) return 1;
	if (feePercent >= max) return 0;
	return 1 - (feePercent - min) / (max - min);
}

/**
 * How close the term is to user's desired timeline.
 * No preference (0) = neutral score of 0.5.
 */
export function termMatchScore(
	termMonths: number,
	desiredMonths: number,
): number {
	if (desiredMonths <= 0) return 0.5;
	const diff = Math.abs(termMonths - desiredMonths);
	return Math.max(0, 1 - diff / desiredMonths);
}

// ---- Composite scoring ----

export interface ScoringInput {
	/** User's monthly budget in BRL */
	budget: number;
	/** User's desired timeline in months (0 = no preference) */
	desiredTermMonths: number;
}

export interface ScoredGroup {
	group: GroupSummary;
	/** 0-1 composite score */
	score: number;
	factors: {
		monthlyFit: number;
		contemplation: number;
		adminFee: number;
		termMatch: number;
	};
}

/**
 * Score and rank groups by weighted multi-factor analysis.
 * Returns top N groups sorted by score descending.
 *
 * DETERMINISTIC: Same inputs always produce same output.
 * No randomness, no LLM involvement.
 */
export function rankGroups(
	groups: GroupSummary[],
	input: ScoringInput,
	topN = 3,
): ScoredGroup[] {
	const scored: ScoredGroup[] = groups.map((group) => {
		const factors = {
			monthlyFit: monthlyFitScore(group.monthlyPayment, input.budget),
			contemplation: contemplationScore(group.contemplationRate),
			adminFee: adminFeeScore(group.adminFeePercent, group.category),
			termMatch: termMatchScore(group.termMonths, input.desiredTermMonths),
		};

		const score =
			factors.monthlyFit * WEIGHTS.monthlyFit +
			factors.contemplation * WEIGHTS.contemplation +
			factors.adminFee * WEIGHTS.adminFee +
			factors.termMatch * WEIGHTS.termMatch;

		return {
			group,
			score: Math.round(score * 10000) / 10000, // 4 decimal precision
			factors,
		};
	});

	return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}

import type {
	AdministradoraAdapter,
	ConsorcioCategory,
	GroupSummary,
	SearchGroupsParams,
} from "@/lib/adapters/types";

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
 * 0 = "sem dado" (oferta real sem histórico de contemplação) → neutro 0.5, não zero.
 */
export function contemplationScore(ratePercent: number): number {
	if (ratePercent <= 0) return 0.5;
	return Math.min(1, Math.max(0, ratePercent / 8));
}

/**
 * Lower admin fee = higher score. Normalized against market range per category.
 */
export function adminFeeScore(feePercent: number, category: ConsorcioCategory): number {
	const ranges: Record<ConsorcioCategory, { min: number; max: number }> = {
		imovel: { min: 15, max: 22 },
		auto: { min: 12, max: 18 },
		moto: { min: 14, max: 20 },
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
export function termMatchScore(termMonths: number, desiredMonths: number): number {
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
export function rankGroups(groups: GroupSummary[], input: ScoringInput, topN = 3): ScoredGroup[] {
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

// ---- Fallback: garantia de ≥3 opções (bug #09) ----

const MIN_OPTIONS = 3;
const EXPANSION_STEPS = [0.2, 0.5] as const;

export interface RecommendationResult {
	groups: Array<GroupSummary & { alternativa: boolean }>;
	/** Quanto a faixa de crédito foi expandida (0.2, 0.5) ou null se filtro estrito bastou. */
	expansionUsed: number | null;
	/** True se mesmo após expansão máxima não atingiu MIN_OPTIONS — agente deve comunicar. */
	insufficientOptions: boolean;
}

function expandRange(params: SearchGroupsParams, factor: number): SearchGroupsParams {
	const center = ((params.creditMin ?? 0) + (params.creditMax ?? 0)) / 2 || params.creditMin || 0;
	const expand = center * factor;
	return {
		...params,
		creditMin: Math.max(0, (params.creditMin ?? 0) - expand),
		creditMax: (params.creditMax ?? Number.MAX_SAFE_INTEGER) + expand,
	};
}

/**
 * Busca grupos garantindo ≥3 opções: filtro estrito → ±20% → ±50%. Marca
 * alternativos. Se mesmo ±50% não basta, retorna o que tem com flag
 * insufficientOptions=true. Bug #09 (Bruna v1 review).
 */
export async function recommendWithFallback(
	adapter: AdministradoraAdapter,
	params: SearchGroupsParams,
): Promise<RecommendationResult> {
	const strict = await adapter.searchGroups(params);
	if (strict.length >= MIN_OPTIONS) {
		return {
			groups: strict.map((g) => ({ ...g, alternativa: false })),
			expansionUsed: null,
			insufficientOptions: false,
		};
	}

	const seenIds = new Set(strict.map((g) => g.id));
	const result: Array<GroupSummary & { alternativa: boolean }> = strict.map((g) => ({
		...g,
		alternativa: false,
	}));

	for (const factor of EXPANSION_STEPS) {
		const expanded = await adapter.searchGroups(expandRange(params, factor));
		for (const g of expanded) {
			if (!seenIds.has(g.id)) {
				seenIds.add(g.id);
				result.push({ ...g, alternativa: true });
			}
		}
		if (result.length >= MIN_OPTIONS) {
			return { groups: result, expansionUsed: factor, insufficientOptions: false };
		}
	}

	return {
		groups: result,
		expansionUsed: EXPANSION_STEPS[EXPANSION_STEPS.length - 1],
		insufficientOptions: true,
	};
}

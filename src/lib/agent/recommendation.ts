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
	/** FIX-193: usuário tem apetite de lance (qualifyAnswers.hasLance==="yes").
	 * Desempata modalidades do MESMO grupo (SPECIAL_OFFER × FREE_BID) quando o
	 * score empata — prioriza a coerente com lance (FREE_BID). Critério INVISÍVEL
	 * (tipoOferta nunca vai pra UI). Ausente/false = desempate estável por ordem. */
	hasLance?: boolean;
}

/** FIX-193: a oferta é da modalidade de lance livre? (case-insensitive, tolerante
 * a variações do enum). Usado só como critério interno de desempate/dedup. */
function isLanceCoherent(group: GroupSummary): boolean {
	const t = (group.tipoOferta ?? "").toUpperCase();
	return t.includes("FREE_BID") || t.includes("EMBEDDED");
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
 * Score and rank ALL groups by weighted multi-factor analysis — sem teto, nunca
 * descarta grupo (Kairo, 2026-07-01: "não pode limitar"). `topN`, se passado,
 * é só um corte de exibição opcional — o comportamento default é devolver tudo.
 *
 * DETERMINISTIC: Same inputs always produce same output.
 * No randomness, no LLM involvement.
 */
export function rankGroups(
	groups: GroupSummary[],
	input: ScoringInput,
	topN = Number.POSITIVE_INFINITY,
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

	const sorted = scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		// FIX-193: desempate por afinidade de lance — só quando o usuário tem
		// apetite de lance, a modalidade coerente (FREE_BID) vem antes. Assim a
		// dedup abaixo (que mantém o 1º por administradora+grupo) preserva a
		// modalidade certa quando o mesmo grupo vem em SPECIAL_OFFER e FREE_BID.
		if (input.hasLance) {
			const af = isLanceCoherent(a.group) ? 0 : 1;
			const bf = isLanceCoherent(b.group) ? 0 : 1;
			if (af !== bf) return af - bf;
		}
		return 0;
	});

	// FIX-193: dedup por (administradora + grupo) — o MESMO grupo pode vir em duas
	// modalidades (SPECIAL_OFFER + FREE_BID) e não pode aparecer 2x. Roda SEMPRE
	// (independe de topN), sobre a lista já ordenada → o 1º por chave é o
	// sobrevivente (melhor score; empate → FREE_BID quando hasLance). Só dedupa
	// quando `grupo` está presente — shapes sem o nº do grupo (fixtures/legado)
	// seguem tratados como únicos (preserva o FIX-56).
	// FIX-219: a chave INCLUI `embeddedVariant` — o mesmo grupo físico agora pode
	// vir de DUAS buscas (com/sem lance embutido, bevi-self-contract-adapter.ts)
	// e as modalidades NÃO podem colapsar uma na outra (números diferentes:
	// crédito líquido menor com embutido). Grupos sem o marcador (legado/mesma
	// variante) seguem dedupados como antes — o sufixo vazio é estável.
	const seenGroupKeys = new Set<string>();
	const deduped: ScoredGroup[] = [];
	for (const s of sorted) {
		const grupo = s.group.grupo;
		const admin = s.group.administradora;
		if (typeof grupo === "string" && grupo.length > 0 && admin) {
			const key = `${admin}::${grupo}::${s.group.embeddedVariant ?? ""}`;
			if (seenGroupKeys.has(key)) continue;
			seenGroupKeys.add(key);
		}
		deduped.push(s);
	}

	// FIX-56 (jornada2 revisão 2): diversifica por administradora. Em vez de só
	// fatiar o top N por score (que deixava 2 grupos da mesma adm entrarem
	// juntos), monta o top N com no máximo 1 grupo por administradora, na ordem
	// de score. Se faltar administradora distinta pra preencher N, completa com
	// os melhores grupos restantes (fallback — não corta abaixo de N à toa).
	const seenAdmins = new Set<string>();
	const picked: ScoredGroup[] = [];
	const leftovers: ScoredGroup[] = [];
	for (const s of deduped) {
		const admin = s.group.administradora;
		if (picked.length < topN && admin && !seenAdmins.has(admin)) {
			seenAdmins.add(admin);
			picked.push(s);
		} else {
			leftovers.push(s);
		}
	}
	for (const s of leftovers) {
		if (picked.length >= topN) break;
		picked.push(s);
	}
	return picked;
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

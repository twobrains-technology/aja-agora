// FIX-73 (QA dono-de-produto 2026-07-02, jornada AUTO web em prod): o payload
// do present_recommendation_card NÃO passava por coerção server-side — ao
// contrário de simulation_result/contemplation_dial (FIX-C3/FIX-6), o runner
// caía em `payload = input` cru. O modelo anunciou "R$ 70.000 / parcela
// R$ 892,48 (99,2% do teto)" e a proposta CONTRATADA saiu "R$ 100.000 /
// parcela R$ 1.438,28" (Grupo 533) — bait-and-switch. Decisão de produto
// (Kairo, 2026-07-02): recomendar a COTA REAL — o número decisório é o
// mesmo número contratado. Este módulo espelha coerceSimulationPayload: coage
// o card contra o retorno REAL do recommend_groups do mesmo turno.

/** Shape relevante de 1 item do retorno do recommend_groups (ModelGroupSummary
 * + score/scoreBreakdown de executeRecommendGroups). Campos numéricos
 * copiados LITERALMENTE pro card. */
export interface RecommendationCandidate {
	id: string;
	administradora?: string;
	category?: string;
	creditValue: number;
	monthlyPayment: number;
	adminFeePercent?: number;
	termMonths: number;
	contemplationRate?: number;
	availableSlots?: number;
	score?: number;
	scoreBreakdown?: {
		monthlyFit: number;
		contemplation: number;
		adminFee: number;
		termMatch: number;
	};
}

function isUsableCandidate(r: unknown): r is RecommendationCandidate {
	if (!r || typeof r !== "object") return false;
	const x = r as Record<string, unknown>;
	return (
		typeof x.id === "string" &&
		x.id.length > 0 &&
		Number(x.creditValue) > 0 &&
		Number(x.monthlyPayment) > 0 &&
		Number(x.termMonths) > 0
	);
}

/** Extrai a lista de candidatos utilizáveis do retorno do recommend_groups
 * (shape `{ recommendations: [...] }`). Formatos inválidos/vazios → []. */
function extractCandidates(recommendGroupsOutput: unknown): RecommendationCandidate[] {
	if (!recommendGroupsOutput || typeof recommendGroupsOutput !== "object") return [];
	const recs = (recommendGroupsOutput as { recommendations?: unknown }).recommendations;
	if (!Array.isArray(recs)) return [];
	return recs.filter(isUsableCandidate);
}

/** Coage o payload do recommendation_card contra o retorno REAL do
 * recommend_groups do mesmo turno. Casa por id LITERAL (fonte de verdade,
 * FIX-71) — nunca pelo score/texto do modelo; fallback por administradora;
 * sem casamento algum, cai no top-ranked real (índice 0 = maior score,
 * rankGroups já ordena desc) — nunca deixa número FABRICADO passar pro
 * usuário. Sem retorno utilizável do recommend_groups → payload intacto
 * (não inventa). */
export function coerceRecommendationPayload(
	input: Record<string, unknown>,
	recommendGroupsOutput: unknown,
): Record<string, unknown> {
	const candidates = extractCandidates(recommendGroupsOutput);
	if (candidates.length === 0) return input;

	const inputId = typeof input.id === "string" ? input.id : undefined;
	const inputAdmin = typeof input.administradora === "string" ? input.administradora : undefined;
	const match =
		candidates.find((r) => inputId != null && r.id === inputId) ??
		candidates.find((r) => inputAdmin != null && r.administradora === inputAdmin) ??
		candidates[0];

	return {
		...input,
		id: match.id,
		...(match.administradora ? { administradora: match.administradora } : {}),
		...(match.category ? { category: match.category } : {}),
		creditValue: match.creditValue,
		monthlyPayment: match.monthlyPayment,
		termMonths: match.termMonths,
		...(match.adminFeePercent != null ? { adminFeePercent: match.adminFeePercent } : {}),
		...(match.contemplationRate != null ? { contemplationRate: match.contemplationRate } : {}),
		...(match.availableSlots != null ? { contempladosMes: match.availableSlots } : {}),
		...(match.score != null ? { score: match.score } : {}),
		...(match.scoreBreakdown != null ? { scoreBreakdown: match.scoreBreakdown } : {}),
	};
}

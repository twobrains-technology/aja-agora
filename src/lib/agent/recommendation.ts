import type {
	AdministradoraAdapter,
	ConsorcioCategory,
	GroupSummary,
	SearchGroupsParams,
} from "@/lib/adapters/types";

// ---- Scoring weights ----

// FIX-276: o usuário nunca informa orçamento mensal (só o valor do bem) — o
// `budget` de ScoringInput é INVENTADO pelo LLM (recommend_groups exige o
// campo, mas não há de onde vir um número real). Com monthlyFit a 0.4 do
// peso, um budget inventado alto empurrava a recomendação pra carta MAIS CARA
// que o valor pedido (risco CDC — recomendar acima do que o cliente pediu).
// `creditProximity` ancora no dado REAL do cliente (o valor do bem pedido,
// `creditMax`) e passa a ser o fator DOMINANTE; monthlyFit perde peso (não
// some — ainda desempata por conforto de parcela quando a proximidade empata).
export const WEIGHTS = {
	creditProximity: 0.35,
	monthlyFit: 0.12,
	contemplation: 0.15,
	adminFee: 0.13,
	termMatch: 0.08,
	// O cliente diz que tem R$ 100 mil, o grupo recomendado pede R$ 183 mil de
	// lance médio, e o card seguia rotulado "melhor opção" — ninguém confrontava.
	// Entre dois grupos parecidos, o que ele CONSEGUE disputar vale mais que o de
	// parcela um pouco menor. Só pesa quando há sinal de lance; sem isso o fator
	// é neutro e o ranking não muda.
	bidReach: 0.17,
} as const;

// ---- Factor scoring functions (all pure, deterministic) ----

/**
 * FIX-276 — quão próxima a carta está do valor do bem PEDIDO (`creditMax`),
 * o âncora real do cliente. Carta == pedido pontua 1; quanto mais distante
 * (pra cima OU pra baixo), mais penaliza, linear em `|creditValue - creditMax| / creditMax`.
 * Sem `creditMax` (busca sem faixa) → neutro 0.5, mesmo padrão dos demais
 * fatores quando falta dado (contemplationScore/termMatchScore).
 */
export function creditProximityScore(creditValue: number, creditMax: number | undefined): number {
	if (!creditMax || creditMax <= 0) return 0.5;
	const ratio = Math.abs(creditValue - creditMax) / creditMax;
	return Math.max(0, 1 - ratio);
}

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
	/** FIX-276: valor do bem PEDIDO pelo usuário (creditMax do input de busca) —
	 * o âncora real do cliente, usado por `creditProximityScore`. Ausente
	 * (busca sem faixa) → o fator vira neutro (0.5), não interfere no ranking. */
	creditMax?: number;
	/** FIX-193: usuário tem apetite de lance (qualifyAnswers.hasLance==="yes").
	 * Desempata modalidades do MESMO grupo (SPECIAL_OFFER × FREE_BID) quando o
	 * score empata — prioriza a coerente com lance (FREE_BID). Critério INVISÍVEL
	 * (tipoOferta nunca vai pra UI). Ausente/false = desempate estável por ordem. */
	hasLance?: boolean;
	/** Lance que o cliente REALMENTE consegue juntar (bolso + embutido, R$).
	 * Alimenta `bidReachScore`. Ausente → fator neutro. */
	lanceDisponivel?: number;
	/** FIX-226 (D6): invariante duro — quando o usuário tem apetite de lance
	 * (`hasLance`) e este guardrail está configurado, candidatas de embutido
	 * (`embeddedVariant === "com"`) cujo netCredit fica ABAIXO do valor do bem
	 * são REORDENADAS pra depois das que respeitam (nunca descartadas — "não
	 * pode limitar", Kairo 2026-07-01). Candidatas "sem" embutido nunca são
	 * avaliadas por este guardrail. */
	embutidoGuardrail?: {
		/** Valor do bem que o usuário quer comprar (R$). */
		valorDoBem: number;
		/** Teto do lance embutido do grupo (fração 0-1, ex.: 0.3 = 30%). */
		maxEmbutidoPct: number;
	};
}

/**
 * GUARDRAIL D6 (FIX-226) — o crédito líquido nunca pode ficar abaixo do bem
 * desejado. Sem isso, o cliente contempla mais rápido usando embutido mas
 * recebe dinheiro que não compra o que veio comprar — a falha silenciosa mais
 * perigosa do embutido. `maxEmbutidoPct` é fração 0-1 (ex.: 0.3 = 30%).
 */
export function respectsNetCreditGuardrail(
	creditValue: number,
	maxEmbutidoPct: number,
	valorDoBem: number,
): boolean {
	const netCredit = creditValue - creditValue * maxEmbutidoPct;
	return netCredit >= valorDoBem;
}

/**
 * O lance que o cliente consegue juntar (bolso + embutido) alcança o lance médio
 * do grupo? 1 = alcança com folga, 0 = muito longe. Sem sinal de lance do
 * cliente OU sem lance médio na oferta → 0.5 (neutro: não penaliza nem premia).
 */
export function bidReachScore(
	avgBidValue: number | undefined,
	lanceDisponivel: number | undefined,
): number {
	if (!avgBidValue || avgBidValue <= 0) return 0.5;
	if (lanceDisponivel === undefined || lanceDisponivel <= 0) return 0.5;
	const ratio = lanceDisponivel / avgBidValue;
	if (ratio >= 1) return 1;
	// Abaixo do lance médio cai linearmente; em 40% do necessário já é ~0.
	return Math.max(0, (ratio - 0.4) / 0.6);
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
		creditProximity: number;
		monthlyFit: number;
		contemplation: number;
		adminFee: number;
		termMatch: number;
	};
}

/**
 * Score UM grupo — fatores + composite ponderado (WEIGHTS). Pura,
 * determinística. Extraída de `rankGroups` (FIX-334) pra ser reutilizável
 * fora do ranking em lote: `coerceRecommendationPayload` a usa pra
 * RECALCULAR o score do hero a partir do grupo REAL já indexado, sem
 * depender do número que o modelo ecoou (que deixou de receber o score cru
 * no tool-result — Lei 4, `docs/correcoes/done/fix-334-*.md`).
 */
export function scoreGroup(group: GroupSummary, input: ScoringInput): ScoredGroup {
	const factors = {
		creditProximity: creditProximityScore(group.creditValue, input.creditMax),
		monthlyFit: monthlyFitScore(group.monthlyPayment, input.budget),
		contemplation: contemplationScore(group.contemplationRate),
		adminFee: adminFeeScore(group.adminFeePercent, group.category),
		termMatch: termMatchScore(group.termMonths, input.desiredTermMonths),
		bidReach: bidReachScore(group.avgBidValue, input.lanceDisponivel),
	};

	const score =
		factors.creditProximity * WEIGHTS.creditProximity +
		factors.monthlyFit * WEIGHTS.monthlyFit +
		factors.contemplation * WEIGHTS.contemplation +
		factors.adminFee * WEIGHTS.adminFee +
		factors.termMatch * WEIGHTS.termMatch +
		factors.bidReach * WEIGHTS.bidReach;

	return {
		group,
		score: Math.round(score * 10000) / 10000, // 4 decimal precision
		factors,
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
	// PARCELA VOLTA A DECIDIR. Sem orçamento declarado (`budget = 0`, que é o
	// caso NORMAL — o cliente informa o valor do bem, nunca quanto pode pagar por
	// mês), `monthlyFitScore` devolvia 0 pra TODOS os candidatos: o peso da
	// parcela virava zero e a recomendação saía pela taxa/contemplação. Ao vivo
	// isso recomendou a parcela MAIS CARA da mesa (R$ 3.728,90 quando existia
	// R$ 2.025,62 na mesma carta) exibindo "Orçamento 0%" na tela. Num consórcio
	// a parcela é a variável nº 1 da decisão. Sem orçamento, o parâmetro passa a
	// ser RELATIVO ao conjunto: a menor parcela entre os candidatos vale 1.0 e as
	// demais são penalizadas na proporção em que passam dela.
	const menorParcela = groups.reduce(
		(min, g) => (g.monthlyPayment > 0 && g.monthlyPayment < min ? g.monthlyPayment : min),
		Number.POSITIVE_INFINITY,
	);
	const inputEfetivo: ScoringInput =
		input.budget > 0 || !Number.isFinite(menorParcela) ? input : { ...input, budget: menorParcela };
	const scored: ScoredGroup[] = groups.map((group) => scoreGroup(group, inputEfetivo));

	// FIX-226 (D6): quando há apetite de lance E o guardrail está configurado,
	// candidatas de embutido ("com") que violam netCredit >= valorDoBem são
	// REORDENADAS pra depois das que respeitam — critério PRIMÁRIO (antes do
	// score), pra "a estratégia de embutido recomendada nunca aponta pra uma
	// carta que viole netCredit". Candidatas "sem" e sem guardrail configurado
	// sempre "passam" (não interfere).
	const guardrail = input.hasLance ? input.embutidoGuardrail : undefined;
	const passesEmbutidoGuardrail = (group: GroupSummary): boolean => {
		if (!guardrail || group.embeddedVariant !== "com") return true;
		return respectsNetCreditGuardrail(
			group.creditValue,
			guardrail.maxEmbutidoPct,
			guardrail.valorDoBem,
		);
	};

	const sorted = scored.sort((a, b) => {
		if (guardrail) {
			const aPass = passesEmbutidoGuardrail(a.group) ? 0 : 1;
			const bPass = passesEmbutidoGuardrail(b.group) ? 0 : 1;
			if (aPass !== bPass) return aPass - bPass;
		}
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
 *
 * FIX-289: `seedGroups`, quando presente, substitui a busca estrita
 * (`adapter.searchGroups(params)`) — reaproveita grupos que o MESMO turno já
 * buscou (ex.: via `search_groups`) em vez de rebuscar do zero. A lógica de
 * expansão (`EXPANSION_STEPS`) segue intacta, só se o conjunto reaproveitado
 * for insuficiente (essas chamadas continuam batendo a Bevi de verdade).
 */
export async function recommendWithFallback(
	adapter: AdministradoraAdapter,
	params: SearchGroupsParams,
	seedGroups?: GroupSummary[],
): Promise<RecommendationResult> {
	const strict = seedGroups ?? (await adapter.searchGroups(params));
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

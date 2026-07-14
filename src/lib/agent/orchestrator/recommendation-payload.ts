// FIX-191 (refino da tela de recomendação, 2026-07-01): o `recommendation_card`
// era o ÚNICO artifact do reveal SEM coerção server-side — o runner empurrava
// `payload = input` (números digitados pela LLM), e o "36 contemplados/mês" saía
// FABRICADO (prova completa: spec §2, file:line). Mesma classe do FIX-C3
// (simulation) e do FIX-6 (dial): número de dinheiro/contagem do hero NUNCA fica
// na mão do modelo (Lei 3 — nunca apresentar sobre entidade não-ancorada; Lei 4 —
// coerção em CÓDIGO, não regra-no-prompt).
//
// O runner captura os grupos REAIS do `recommend_groups`/`search_groups` do turno
// (indexRevealGroups) e este módulo reescreve cada cota do reveal (hero +
// seletor) a partir do grupo real ancorado por `id`.
//
// CONTRATO com bloco-b (nível 3, adendo B8): cada cota coagida carrega
// `groupId`/`ofertaId`/`quotaId` + `availableSlots` REAL (0 quando ausente) — pra
// o seletor emitir `choose_offer` com o grupo já resolvido. `tipoOferta` é
// critério INTERNO de ranking/dedup (FIX-193): NUNCA entra no payload de UI.

import type { ConsorcioCategory } from "@/lib/adapters/types";
import { matchAdministradoraLogo } from "@/lib/consorcio/administradora-logo";
import { scoreGroup, type ScoringInput } from "../recommendation";
import type { KnownGroupValue } from "../tools/known-credit-values";

/** Grupo real (model-facing) capturado do tool-result de recommend/search. É o
 * `toModelGroupSummary` (+ rank no recommend, FIX-334). */
export interface RevealGroupLike {
	id: string;
	administradora?: string;
	category?: string;
	creditValue?: number;
	monthlyPayment?: number;
	adminFeePercent?: number;
	termMonths?: number;
	availableSlots?: number;
	contemplationRate?: number;
	/** UUID de sessão da oferta (Bevi) — campo do CONTRATO, quando propagado. */
	ofertaId?: string;
	/** FIX-334: posição ordinal no ranking de `recommend_groups` (0 = melhor) —
	 * substitui `score` cru como sinal de "é o top-1" (o modelo não recebe mais
	 * o número, só a posição relativa via ordem + `scoreLabel` qualitativo).
	 * `score`/`scoreBreakdown` REAIS são recalculados sob demanda por
	 * `scoreGroup` (recommendation.ts), nunca lidos daqui. */
	rank?: number;
	/** FIX-223: lance médio do grupo (R$), quando a fonte o traz. */
	avgBidValue?: number;
}

export type RevealGroupIndex = Map<string, RevealGroupLike>;

/** Indexa os grupos reais do tool-result por `id`. `recommend_groups` sobrescreve
 * `search_groups` (traz score/scoreBreakdown). Tolerante a shapes desconhecidos
 * (tool sem contexto devolve `{ error }` → sem `recommendations`/`groups` → no-op). */
export function indexRevealGroups(
	index: RevealGroupIndex,
	toolName: string,
	output: unknown,
): void {
	const rows =
		toolName === "recommend_groups"
			? (output as { recommendations?: unknown[] } | null)?.recommendations
			: toolName === "search_groups"
				? (output as { groups?: unknown[] } | null)?.groups
				: null;
	if (!Array.isArray(rows)) return;
	const overwrite = toolName === "recommend_groups";
	for (const row of rows) {
		if (!row || typeof row !== "object") continue;
		const g = row as RevealGroupLike;
		if (typeof g.id !== "string" || g.id.length === 0) continue;
		if (overwrite || !index.has(g.id)) index.set(g.id, g);
	}
}

/** O grupo tem os 3 números obrigatórios pra coagir? (descarta shape de erro). */
function isUsableGroup(g: RevealGroupLike | undefined): g is RevealGroupLike {
	return (
		!!g && Number(g.creditValue) > 0 && Number(g.monthlyPayment) > 0 && Number(g.termMonths) > 0
	);
}

/**
 * Coage os campos numéricos + de identidade de UMA cota do reveal a partir do
 * grupo REAL. FIX-315 (rodada 10, onda 4 — Rodada A.3, achado de dados
 * financeiros 100% fabricados chegando ao usuário): esta função reconstrói o
 * payload por ALLOWLIST (Lei 2 — allowlist, não blocklist), não mais por
 * `{...rest}` menos 3 campos removidos. Sob a versão antiga, quando o modelo
 * inventava um `id`/administradora que não batia com NENHUM grupo real
 * (`!isUsableGroup(group)`), a função devolvia `input` quase intacto — todo
 * numero fabricado (creditValue, monthlyPayment, adminFeePercent, termMonths)
 * e até campos de schema inteiramente inventados (`awardingPattern`,
 * `avgWinningBidPct`, etc., vistos ao vivo num dossiê real) atravessavam sem
 * checagem. Agora: SEM grupo real ancorado, a cota fica só com identidade
 * (id/administradora/category) — NENHUM número financeiro passa. Isso é
 * causa-raiz também de `two_paths`/fechamento divergente do escolhido pelo
 * cliente (a proposta se ancorava em cotas fabricadas).
 */
export function coerceRevealCota(
	input: Record<string, unknown>,
	group: RevealGroupLike | undefined,
	logosByAdministradora?: ReadonlyMap<string, string>,
	/** FIX-287/FIX-292: cenário REAL já simulado por groupId (turno corrente +
	 * histórico da conversa — ver `known-credit-values.ts`). O search/recommend
	 * só traz o valor-ALVO que a Bevi aproxima na busca (offer-mapper.ts:141);
	 * quando esse groupId já foi simulado, esse mapa é a fonte única MULTI-CAMPO
	 * (creditValue + monthlyPayment + termMonths) — comparison_table/
	 * recommendation_card nunca misturam campo de um cenário com campo de outro
	 * dentro do MESMO artifact. */
	knownCreditValueByGroupId?: ReadonlyMap<string, KnownGroupValue>,
): Record<string, unknown> {
	// ALLOWLIST (FIX-315): só identidade sai do input do modelo. Category é um
	// enum fechado no schema (Zod já valida) — seguro copiar. Nenhum campo
	// numérico/financeiro do modelo entra aqui; todos vêm do `group` real abaixo.
	const id = typeof input.id === "string" && input.id.length > 0 ? input.id : undefined;
	const out: Record<string, unknown> = {};
	if (id) out.id = id;
	if (typeof input.category === "string") out.category = input.category;
	// CONTRATO: groupId/quotaId sempre presentes quando há id (bloco-b emite choose_offer).
	if (id) {
		out.groupId = id;
		out.quotaId = id;
	}
	const administradoraName =
		(isUsableGroup(group) ? group.administradora : undefined) ??
		(typeof input.administradora === "string" ? input.administradora : undefined);
	if (administradoraName) out.administradora = administradoraName;
	// FIX-222: logoUrl casado por administradora contra o cadastro (nunca uma
	// URL que a LLM inventou).
	const logoUrl = matchAdministradoraLogo(logosByAdministradora, administradoraName);
	if (logoUrl) out.logoUrl = logoUrl;
	if (!isUsableGroup(group)) return out;

	out.creditValue = group.creditValue;
	out.monthlyPayment = group.monthlyPayment;
	out.termMonths = group.termMonths;
	if (typeof group.adminFeePercent === "number") out.adminFeePercent = group.adminFeePercent;
	if (typeof group.contemplationRate === "number") out.contemplationRate = group.contemplationRate;
	if (typeof group.availableSlots === "number") out.availableSlots = group.availableSlots;
	if (typeof group.ofertaId === "string" && group.ofertaId.length > 0)
		out.ofertaId = group.ofertaId;
	// FIX-192: contempladosMes só do dado REAL (>0); 0/ausente → nunca exibido.
	if (Number(group.availableSlots) > 0) out.contempladosMes = group.availableSlots;
	if (typeof group.avgBidValue === "number") out.avgBidValue = group.avgBidValue;

	// FIX-287/FIX-292: o groupId já foi simulado (nesta conversa) — o cenário
	// conhecido é a fonte única MULTI-CAMPO: creditValue, monthlyPayment e
	// termMonths (quando disponível) vêm SEMPRE do MESMO registro conhecido,
	// nunca um campo do cenário antigo (estimativa) ao lado de um campo do
	// cenário novo (real). rawCreditValue só quando o creditValue diverge do
	// valor-alvo que a busca aproximou (mesmo contrato de aviso do FIX-197/261
	// — a UI já sabe renderizar "você pediu X, a carta real é Y").
	const known = id ? knownCreditValueByGroupId?.get(id) : undefined;
	if (known && known.creditValue > 0) {
		if (Math.round(known.creditValue) !== Math.round(out.creditValue as number)) {
			out.rawCreditValue = out.creditValue;
		}
		out.creditValue = known.creditValue;
		out.monthlyPayment = known.monthlyPayment;
		if (typeof known.termMonths === "number") out.termMonths = known.termMonths;
	}

	return out;
}

/** Hero (`recommendation_card`): coage a cota + score/scoreBreakdown REAIS
 * (também server-computed pelo rankGroups — o modelo não os digita). */
export function coerceRecommendationPayload(
	input: Record<string, unknown>,
	index: RevealGroupIndex,
	logosByAdministradora?: ReadonlyMap<string, string>,
	/** FIX-261 (rodada 5, veredito Fable r4): valor de crédito PEDIDO pelo
	 * usuário (meta.qualifyAnswers.creditClampedFrom ?? creditMax) — fonte do
	 * aviso de ajuste (mesmo padrão do FIX-197/240 no real_offer). Ausente →
	 * sem aviso (degradação graciosa, caminho legado). */
	requestedCreditValue?: number,
	/** FIX-287/FIX-292: ver `coerceRevealCota`. */
	knownCreditValueByGroupId?: ReadonlyMap<string, KnownGroupValue>,
	/** FIX-334: input de scoring (budget/desiredTermMonths/creditMax/hasLance)
	 * pra RECALCULAR score/scoreBreakdown a partir do grupo real — desde que
	 * `recommend_groups` parou de devolver o score cru pro modelo (só
	 * `scoreLabel`, ver ai-sdk.ts), `group.score`/`group.scoreBreakdown` não
	 * chegam mais indexados. Ausente → card sai sem score (degradação
	 * graciosa, caminho legado/sem contexto de scoring). */
	scoringInput?: ScoringInput,
): Record<string, unknown> {
	const id = typeof input.id === "string" ? input.id : undefined;
	const group = id ? index.get(id) : undefined;
	const out = coerceRevealCota(input, group, logosByAdministradora, knownCreditValueByGroupId);
	if (isUsableGroup(group) && scoringInput) {
		const scored = scoreGroup(
			{
				id: group.id,
				administradora: group.administradora ?? "",
				category: (group.category ?? "auto") as ConsorcioCategory,
				creditValue: group.creditValue as number,
				monthlyPayment: group.monthlyPayment as number,
				adminFeePercent: group.adminFeePercent ?? 0,
				termMonths: group.termMonths as number,
				totalParticipants: 0,
				availableSlots: group.availableSlots ?? 0,
				contemplationRate: group.contemplationRate ?? 0,
			},
			scoringInput,
		);
		out.score = scored.score;
		out.scoreBreakdown = scored.factors;
	}
	// FIX-220 (Ata 2026-07-04): a 1ª lista é SEMPRE neutra — ainda não existe
	// nenhum caminho de produto que colete dado de lance/recurso próprio antes do
	// reveal (isso é o estágio 2, ONDA 2, jornada-canonica.md item 6). Hardcoded
	// "neutral" em CÓDIGO (Lei 4 — invariante crítico não vira regra-no-prompt):
	// a LLM NUNCA decide sozinha quando "personalizar" a recomendação.
	out.recommendationStage = "neutral";
	// FIX-261: o hero do reveal podia divergir do valor PEDIDO (denominação real
	// da Bevi) sem uma palavra de aviso — só o real_offer do fechamento tinha
	// esse cuidado. rawCreditValue aciona o aviso já implementado no componente
	// (hasCreditAdjustment, recommendation-card.tsx); nunca confirma silenciosamente.
	if (
		typeof requestedCreditValue === "number" &&
		Number.isFinite(requestedCreditValue) &&
		typeof out.creditValue === "number" &&
		Math.round(requestedCreditValue) !== Math.round(out.creditValue)
	) {
		out.rawCreditValue = requestedCreditValue;
	}
	return out;
}

// FIX-286 (P0, veredito Sonnet r9pos2, guard tool-error suprime reveal
// legítimo): quando o guard de tool-error (FIX-262) interrompe o turno DEPOIS
// de `recommend_groups` já ter retornado grupos reais (ranqueados
// server-side por `rankGroups`, nunca a LLM), o grupo de `rank` 0 É a mesma
// recomendação que `present_recommendation_card` teria mostrado — a escolha
// não depende de nenhum julgamento adicional do modelo. Considera só
// entradas com `rank` definido (só `recommend_groups` o preenche;
// `search_groups` sozinho não basta pra materializar o hero, ver
// `buildFirstRevealRecoveryFallback` em `directives.ts` pro caso sem ranking).
// FIX-334: usava `score` cru — desde que o modelo parou de receber esse
// número (só `scoreLabel`), a posição ordinal (`rank`) é o sinal que sobra.
export function pickBestRankedGroup(index: RevealGroupIndex): RevealGroupLike | null {
	let best: RevealGroupLike | null = null;
	for (const group of index.values()) {
		if (typeof group.rank !== "number") continue;
		if (!isUsableGroup(group)) continue;
		if (!best || group.rank < (best.rank ?? Number.POSITIVE_INFINITY)) best = group;
	}
	return best;
}

/** FIX-286 — materializa o `recommendation_card` inteiro a partir de um grupo
 * REAL já indexado (sem depender de um `input` de tool-call que nunca chegou
 * a existir, pois a apresentação falhou em `tool-error`). Reaproveita
 * `coerceRecommendationPayload` (mesma coerção do caminho feliz) montando um
 * `input` mínimo cujos campos numéricos são todos sobrescritos pelo grupo. */
export function buildRecommendationCardFromRevealGroup(
	group: RevealGroupLike,
	logosByAdministradora?: ReadonlyMap<string, string>,
	requestedCreditValue?: number,
	/** FIX-334: ver `coerceRecommendationPayload` — sem isso, o card sai sem
	 * score/scoreBreakdown (degradação graciosa, não quebra o fluxo). */
	scoringInput?: ScoringInput,
): Record<string, unknown> {
	const input: Record<string, unknown> = {
		id: group.id,
		administradora: group.administradora,
		category: group.category,
	};
	const index: RevealGroupIndex = new Map([[group.id, group]]);
	return coerceRecommendationPayload(
		input,
		index,
		logosByAdministradora,
		requestedCreditValue,
		undefined,
		scoringInput,
	);
}

/** FIX-290: quantos grupos REAIS (não o shape de erro) estão indexados neste
 * turno — usado pelo runner pra decidir se o ramo é "2+ grupos" (força
 * comparison_table junto do hero) ou "1 grupo único" (nunca força, mesma
 * regra documentada do reveal: "só pulam os DOIS juntos quando a busca
 * devolveu 1 grupo único"). */
export function usableRevealGroupCount(index: RevealGroupIndex): number {
	let count = 0;
	for (const group of index.values()) {
		if (isUsableGroup(group)) count += 1;
	}
	return count;
}

// FIX-290 (P0 sistêmico, veredito r9pos3 Sonnet §3): o pareamento
// `recommendation_card` × `comparison_table` era só regra-no-prompt
// (directives.ts:348, "REGRA DURA... INSEPARÁVEIS") — sem invariante em código,
// se o modelo parasse de gerar tool-calls após a 1ª, a tabela comparativa
// simplesmente sumia. Materializa o `comparison_table` inteiro a partir dos
// grupos REAIS já indexados neste turno (sem depender de um `input` de
// tool-call que nunca chegou a existir) — mesmo padrão do FIX-286
// (`buildRecommendationCardFromRevealGroup`) pro hero.
export function buildComparisonTableFromRevealGroups(
	index: RevealGroupIndex,
	logosByAdministradora?: ReadonlyMap<string, string>,
	knownCreditValueByGroupId?: ReadonlyMap<string, KnownGroupValue>,
): Record<string, unknown> {
	const usable = [...index.values()].filter(isUsableGroup);
	const input: Record<string, unknown> = {
		groups: usable.map((g) => ({
			id: g.id,
			administradora: g.administradora,
			category: g.category,
		})),
	};
	return coerceComparisonPayload(input, index, logosByAdministradora, knownCreditValueByGroupId);
}

/** Seletor (`comparison_table`): coage CADA cota por `id` — é a lista de cotas do
 * reveal que o bloco-b renderiza como chips (adendo B8). */
export function coerceComparisonPayload(
	input: Record<string, unknown>,
	index: RevealGroupIndex,
	logosByAdministradora?: ReadonlyMap<string, string>,
	/** FIX-287/FIX-292: ver `coerceRevealCota`. */
	knownCreditValueByGroupId?: ReadonlyMap<string, KnownGroupValue>,
): Record<string, unknown> {
	// FIX-315: FAIL-CLOSED — `groups` que não chega como array de verdade (visto
	// ao vivo: o modelo mandou uma STRING JSON-serializada) vira lista VAZIA,
	// nunca o input cru fabricado. Antes: `return input` passava o payload
	// inteiro adiante sem nenhuma coerção.
	const groups = Array.isArray(input.groups) ? input.groups : [];
	const coerced = groups
		.map((g) => {
			if (!g || typeof g !== "object") return null;
			const cota = g as Record<string, unknown>;
			const id = typeof cota.id === "string" ? cota.id : undefined;
			const group = id ? index.get(id) : undefined;
			// FIX-315: cota sem grupo REAL ancorado é DESCARTADA da tabela — uma
			// linha comparativa sem número real não tem por que existir (ao
			// contrário do hero, que é 1 cota só e pode aparecer incompleta).
			if (!isUsableGroup(group)) return null;
			return coerceRevealCota(cota, group, logosByAdministradora, knownCreditValueByGroupId);
		})
		.filter((cota): cota is Record<string, unknown> => cota !== null);
	return { ...input, groups: coerced };
}

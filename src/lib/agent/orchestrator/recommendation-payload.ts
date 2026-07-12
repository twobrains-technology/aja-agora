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

import { matchAdministradoraLogo } from "@/lib/consorcio/administradora-logo";
import type { KnownGroupValue } from "../tools/known-credit-values";

/** Grupo real (model-facing) capturado do tool-result de recommend/search. É o
 * `toModelGroupSummary` (+ score/scoreBreakdown no recommend). */
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
	score?: number;
	scoreBreakdown?: Record<string, number>;
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
 * grupo REAL. SEMPRE remove o `contempladosMes` que o modelo digitou (o "36"
 * fabricado — spec §2) e o re-adiciona APENAS do `availableSlots` REAL > 0
 * (FIX-192; 0/ausente → oculto pelo bloco-b). `tipoOferta`/`grupo` NUNCA entram
 * (critério interno — FIX-193). Sem grupo utilizável (não deveria ocorrer no
 * reveal canônico), ainda assim remove o `contempladosMes` fabricado e mantém o
 * `groupId`/`quotaId` derivado do `id` — nunca deixa o número inventado passar.
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
	// Descarta o contempladosMes do modelo SEMPRE (fonte única = availableSlots
	// real) e tipoOferta/grupo (critério INTERNO de ranking/dedup — FIX-193;
	// nunca vaza pra UI, mesmo se aparecer no input).
	const { contempladosMes: _dropModel, tipoOferta: _dropTipo, grupo: _dropGrupo, ...rest } = input;
	const out: Record<string, unknown> = { ...rest };
	const id = typeof rest.id === "string" && rest.id.length > 0 ? rest.id : undefined;
	// CONTRATO: groupId/quotaId sempre presentes quando há id (bloco-b emite choose_offer).
	if (id) {
		out.groupId = id;
		out.quotaId = id;
	}
	// FIX-223: lance médio SEMPRE do grupo real — nunca o que a LLM digitou.
	// FIX-222: idem pro logoUrl — casado por administradora contra o cadastro
	// (nunca uma URL que a LLM inventou). Descarta incondicionalmente aqui
	// (mesmo sem grupo ancorado); só volta abaixo com dado real (D11). O nome
	// da administradora em si já não é coagido nesta função (a LLM copia do
	// resultado real da busca) — casar o logo por ele é o mesmo nível de
	// confiança já aceito pro resto do payload.
	delete out.avgBidValue;
	delete out.logoUrl;
	const administradoraName =
		(isUsableGroup(group) ? group.administradora : undefined) ??
		(typeof rest.administradora === "string" ? rest.administradora : undefined);
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
): Record<string, unknown> {
	const id = typeof input.id === "string" ? input.id : undefined;
	const group = id ? index.get(id) : undefined;
	const out = coerceRevealCota(input, group, logosByAdministradora, knownCreditValueByGroupId);
	if (isUsableGroup(group)) {
		if (typeof group.score === "number") out.score = group.score;
		if (group.scoreBreakdown && typeof group.scoreBreakdown === "object") {
			out.scoreBreakdown = group.scoreBreakdown;
		}
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
// server-side por `rankGroups`, nunca a LLM), o grupo de maior `score` É a
// mesma recomendação que `present_recommendation_card` teria mostrado — a
// escolha não depende de nenhum julgamento adicional do modelo. Considera só
// entradas com `score` definido (só `recommend_groups` o preenche;
// `search_groups` sozinho não basta pra materializar o hero, ver
// `buildFirstRevealRecoveryFallback` em `directives.ts` pro caso sem ranking).
export function pickBestRankedGroup(index: RevealGroupIndex): RevealGroupLike | null {
	let best: RevealGroupLike | null = null;
	for (const group of index.values()) {
		if (typeof group.score !== "number") continue;
		if (!isUsableGroup(group)) continue;
		if (!best || group.score > (best.score ?? -Infinity)) best = group;
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
): Record<string, unknown> {
	const input: Record<string, unknown> = {
		id: group.id,
		administradora: group.administradora,
		category: group.category,
		score: group.score,
		scoreBreakdown: group.scoreBreakdown,
	};
	const index: RevealGroupIndex = new Map([[group.id, group]]);
	return coerceRecommendationPayload(input, index, logosByAdministradora, requestedCreditValue);
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
	const groups = Array.isArray(input.groups) ? input.groups : null;
	if (!groups) return input;
	return {
		...input,
		groups: groups.map((g) => {
			if (!g || typeof g !== "object") return g;
			const cota = g as Record<string, unknown>;
			const id = typeof cota.id === "string" ? cota.id : undefined;
			return coerceRevealCota(
				cota,
				id ? index.get(id) : undefined,
				logosByAdministradora,
				knownCreditValueByGroupId,
			);
		}),
	};
}

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
	return out;
}

/** Hero (`recommendation_card`): coage a cota + score/scoreBreakdown REAIS
 * (também server-computed pelo rankGroups — o modelo não os digita). */
export function coerceRecommendationPayload(
	input: Record<string, unknown>,
	index: RevealGroupIndex,
): Record<string, unknown> {
	const id = typeof input.id === "string" ? input.id : undefined;
	const group = id ? index.get(id) : undefined;
	const out = coerceRevealCota(input, group);
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
	return out;
}

/** Seletor (`comparison_table`): coage CADA cota por `id` — é a lista de cotas do
 * reveal que o bloco-b renderiza como chips (adendo B8). */
export function coerceComparisonPayload(
	input: Record<string, unknown>,
	index: RevealGroupIndex,
): Record<string, unknown> {
	const groups = Array.isArray(input.groups) ? input.groups : null;
	if (!groups) return input;
	return {
		...input,
		groups: groups.map((g) => {
			if (!g || typeof g !== "object") return g;
			const cota = g as Record<string, unknown>;
			const id = typeof cota.id === "string" ? cota.id : undefined;
			return coerceRevealCota(cota, id ? index.get(id) : undefined);
		}),
	};
}

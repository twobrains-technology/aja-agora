// FIX-195 (P0, qa-dono-produto conv fe2e8a09, 2026-07-01): ao escolher outra cota
// por TEXTO LIVRE ("quero seguir com o BB"), o agente tentava re-resolver o
// grupo/ID e falhava → despejava meta-narrativa admitindo falha técnica ao cliente
// ("esse grupo deu um problema", "preciso trazer os IDs reais") → LOOP.
//
// A cura de raiz é um caminho ESTRUTURADO: o seletor (bloco-b) emite
// `{kind:"choose_offer", groupId, ofertaId?}` e ESTE módulo resolve o grupo
// escolhido server-side (a partir dos artifacts REAIS já exibidos no reveal),
// ancorando a administradora + prazo pro fechamento fechar NO GRUPO CERTO — sem
// re-busca, sem re-resolução, sem meta-narrativa (CONTRATO com bloco-b, adendo B8).

/** Campos ancorados da cota escolhida — alimentam recommendedAdministradora +
 * recommendedOffer (que buildStartContractInput usa como administradoraPreferida
 * + prazoPreferido no fechamento). */
export interface ChosenOffer {
	groupId: string;
	administradora?: string;
	creditValue?: number;
	termMonths?: number;
	monthlyPayment?: number;
}

interface ArtifactRow {
	type: string;
	payload: unknown;
}

/** A cota casa com o groupId escolhido? Aceita as 3 chaves do CONTRATO/reveal
 * (groupId coagido == id == quotaId). */
function matchesGroupId(p: Record<string, unknown>, groupId: string): boolean {
	return p.groupId === groupId || p.id === groupId || p.quotaId === groupId;
}

function pickOffer(p: Record<string, unknown>, groupId: string): ChosenOffer {
	return {
		groupId,
		administradora: typeof p.administradora === "string" ? p.administradora : undefined,
		creditValue: typeof p.creditValue === "number" ? p.creditValue : undefined,
		termMonths: typeof p.termMonths === "number" ? p.termMonths : undefined,
		monthlyPayment: typeof p.monthlyPayment === "number" ? p.monthlyPayment : undefined,
	};
}

/** Procura a cota escolhida (por groupId) entre os artifacts do reveal já
 * persistidos (comparison_table/recommendation_card/group_card/simulation_result).
 * PURO — testável sem DB. Null quando o groupId não foi exibido em nenhum card
 * (nunca inventa um grupo — Lei 3). */
export function findChosenOffer(rows: ArtifactRow[], groupId: string): ChosenOffer | null {
	if (!groupId) return null;
	for (const row of rows) {
		const p = row.payload;
		if (!p || typeof p !== "object" || Array.isArray(p)) continue;
		const payload = p as Record<string, unknown>;
		if (row.type === "comparison_table" && Array.isArray(payload.groups)) {
			for (const g of payload.groups) {
				if (g && typeof g === "object" && matchesGroupId(g as Record<string, unknown>, groupId)) {
					return pickOffer(g as Record<string, unknown>, groupId);
				}
			}
			continue;
		}
		if (matchesGroupId(payload, groupId)) return pickOffer(payload, groupId);
	}
	return null;
}

async function loadArtifactRows(conversationId: string): Promise<ArtifactRow[]> {
	const { db } = await import("@/db");
	const { artifacts: artifactsTable, messages: messagesTable } = await import("@/db/schema");
	const { eq } = await import("drizzle-orm");
	return db
		.select({ type: artifactsTable.type, payload: artifactsTable.payload })
		.from(artifactsTable)
		.innerJoin(messagesTable, eq(artifactsTable.messageId, messagesTable.id))
		.where(eq(messagesTable.conversationId, conversationId));
}

/** Resolve a cota escolhida a partir dos artifacts persistidos da conversa. */
export async function resolveChosenOffer(
	conversationId: string,
	groupId: string,
): Promise<ChosenOffer | null> {
	const rows = await loadArtifactRows(conversationId);
	return findChosenOffer(rows, groupId);
}

// FIX-251 (P0, veredito Fable FINAL §N-A, 2026-07-10): "nunca aja sobre
// entidade não-ancorada" no ponto mais caro da jornada — o fechamento
// (present_contract_form) confiava cegamente em meta.recommendedOffer mesmo
// quando um what-if REJEITADO tinha deixado o snapshot ancorado noutra
// administradora. Re-resolve pela administradora que o PRÓPRIO turno de
// fechamento anuncia, contra os grupos REALMENTE exibidos no reveal
// (findOfferByAdministradora) — nunca a meta potencialmente stale.

/** Normaliza nome de administradora pra comparação (maiúsculas, sem acento). */
export function normalizeAdministradora(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase()
		.trim();
}

/** Lista TODAS as cotas distintas (por groupId) já exibidas nos artifacts do
 * reveal — comparison_table (seletor) + cards individuais. PURO. */
export function listShownOffers(rows: ArtifactRow[]): ChosenOffer[] {
	const out: ChosenOffer[] = [];
	const seen = new Set<string>();
	const add = (p: Record<string, unknown>, idKey: "id" | "groupId") => {
		const id = p[idKey];
		if (typeof id !== "string" || id.length === 0 || seen.has(id)) return;
		seen.add(id);
		out.push(pickOffer(p, id));
	};
	for (const row of rows) {
		const p = row.payload;
		if (!p || typeof p !== "object" || Array.isArray(p)) continue;
		const payload = p as Record<string, unknown>;
		if (row.type === "comparison_table" && Array.isArray(payload.groups)) {
			for (const g of payload.groups) {
				if (g && typeof g === "object" && !Array.isArray(g)) {
					add(g as Record<string, unknown>, "id");
				}
			}
			continue;
		}
		if (row.type === "simulation_result") {
			add(payload, "groupId");
			continue;
		}
		if (row.type === "group_card" || row.type === "recommendation_card") {
			add(payload, "id");
		}
	}
	return out;
}

/** Acha a cota exibida cuja administradora bate com o nome dado (normalizado).
 * Ambíguo (2+ grupos da mesma administradora exibidos) → null, nunca chuta
 * qual dos dois (Lei 3). */
export function findOfferByAdministradora(
	rows: ArtifactRow[],
	administradora: string,
): ChosenOffer | null {
	if (!administradora) return null;
	const target = normalizeAdministradora(administradora);
	const matches = listShownOffers(rows).filter(
		(o) => o.administradora && normalizeAdministradora(o.administradora) === target,
	);
	return matches.length === 1 ? matches[0] : null;
}

/** Resolve o groupId a partir dos artifacts persistidos + a administradora
 * anunciada pelo turno de fechamento (present_contract_form). */
export async function resolveOfferForAdministradora(
	conversationId: string,
	administradora: string,
): Promise<ChosenOffer | null> {
	const rows = await loadArtifactRows(conversationId);
	return findOfferByAdministradora(rows, administradora);
}

// FIX-252 ("pro teto" #3, veredito Fable FINAL, 2026-07-10): a mesma lei, num
// segundo ponto — a LLM podia nomear/errar o grupo certo em texto livre ("a de
// 92 mil" resolvendo pro grupo de 100k, achado do FIX-249 "PARCIAL"; gap
// registrado como fora de escopo no próprio commit cd716058).
// resolveOfferByMention resolve DETERMINISTICAMENTE por nome de administradora
// ou valor aproximado contra os grupos JÁ EXIBIDOS — nunca inventa (Lei 3).

/** Extrai valores monetários mencionados no texto livre — "92 mil", "R$
 * 92.902,00", "92.902" (formatação pt-BR). PURO, sem heurística de moeda
 * implícita em números soltos pequenos (evita falso-positivo em "12 meses"). */
function extractMoneyMentions(text: string): number[] {
	const out: number[] = [];
	for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*mil\b/gi)) {
		const n = Number(m[1].replace(",", "."));
		if (!Number.isNaN(n)) out.push(n * 1000);
	}
	for (const m of text.matchAll(/R\$\s*([\d.,]+)/gi)) {
		const n = parsePtBrNumber(m[1]);
		if (n !== null) out.push(n);
	}
	for (const m of text.matchAll(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b/g)) {
		const n = parsePtBrNumber(m[0]);
		if (n !== null) out.push(n);
	}
	return out;
}

function parsePtBrNumber(raw: string): number | null {
	const cleaned = raw.trim();
	const normalized = cleaned.includes(",")
		? cleaned.replace(/\./g, "").replace(",", ".")
		: cleaned.replace(/\./g, "");
	const n = Number(normalized);
	return Number.isNaN(n) ? null : n;
}

// FIX-265 (menor #2, veredito Fable r5, N6): o runner precisa distinguir
// re-simulação PEDIDA (usuário citou um valor-alvo) de what-if EXPLORATÓRIO
// da LLM (nenhum valor citado) antes de aceitar uma nova simulação como a
// âncora do fechamento/dial. Reusa a mesma extração/tolerância de
// `resolveOfferByMention` — um só lugar decide "o que conta como valor
// mencionado pelo usuário".
/** O texto do usuário menciona (aproximadamente, ≤10%) o valor dado? PURO. */
export function isCreditValueMentioned(text: string, creditValue: number): boolean {
	if (!text || typeof creditValue !== "number" || creditValue <= 0) return false;
	return extractMoneyMentions(text).some((m) => Math.abs(creditValue - m) / m <= 0.1);
}

// FIX-264 (P1, veredito Fable r5 — FIX-252/258 "PARCIAL"): "RODOBENS de 90
// mil" com a RODOBENS exibida a 90k desistia por "conflito nome×valor" quando
// outro grupo exibido empatava no MESMO crédito — o "best" global (menor diff,
// primeiro no array) elegia arbitrariamente o empate errado em vez do grupo
// nomeado. Correção: valor vira CONJUNTO por menção (todos os empates no
// mínimo, não só o 1º encontrado); nome único resolve se seu PRÓPRIO valor
// está no conjunto — não precisa ser o único elemento dele. Menção negada
// ("deixa X pra lá"/"esquece"/"cancela") remove X do conjunto de nomes antes
// de resolver — nunca conta uma administradora explicitamente rejeitada.

const NEGATION_TRIGGER = /\b(PRA LA|DE LADO|ESQUECE|ESQUECA|CANCELA|CANCELE|NAO QUERO)\b/;

/** Administradoras mencionadas dentro de uma cláusula com gatilho de negação
 * explícito ("deixa a X pra lá", "esquece a X", "cancela a X") — nunca conta
 * um uso afirmativo de "deixa" sem o gatilho ("Deixa a X que você recomendou"
 * continua resolvendo — regressão FIX-252). PURO. */
function extractNegatedAdministradoras(text: string, offers: ChosenOffer[]): Set<string> {
	const negated = new Set<string>();
	for (const clause of text.split(/[.!?;]/)) {
		const normalizedClause = normalizeAdministradora(clause);
		if (!NEGATION_TRIGGER.test(normalizedClause)) continue;
		for (const o of offers) {
			if (o.administradora && normalizedClause.includes(normalizeAdministradora(o.administradora))) {
				negated.add(normalizeAdministradora(o.administradora));
			}
		}
	}
	return negated;
}

/** Todos os valores monetários mencionados no texto casados contra as cotas
 * exibidas — por menção, o CONJUNTO empatado no menor diff (não só o 1º
 * encontrado), unido entre as várias menções do texto. PURO. */
function matchValueMentions(offers: ChosenOffer[], mentions: number[]): ChosenOffer[] {
	const matched = new Map<string, ChosenOffer>();
	for (const m of mentions) {
		let minDiff = Number.POSITIVE_INFINITY;
		let tied: ChosenOffer[] = [];
		for (const o of offers) {
			if (typeof o.creditValue !== "number") continue;
			const diff = Math.abs(o.creditValue - m) / m;
			if (diff > 0.1) continue;
			if (diff < minDiff) {
				minDiff = diff;
				tied = [o];
			} else if (diff === minDiff) {
				tied.push(o);
			}
		}
		for (const o of tied) matched.set(o.groupId, o);
	}
	return [...matched.values()];
}

/** Resolve determinística de menção textual (nome de administradora OU valor
 * aproximado) pra uma das cotas JÁ EXIBIDAS — nunca inventa (Lei 3): null
 * quando genuinamente ambíguo ou sem match. Nome único cujo PRÓPRIO valor
 * está no conjunto de valores mencionados resolve SEMPRE — mesmo se outro
 * grupo exibido empata no mesmo valor (LEI: nome/valor casando um grupo
 * exibido nunca desiste/nega). Menção negada é descartada antes de resolver. */
export function resolveOfferByMention(offers: ChosenOffer[], text: string): ChosenOffer | null {
	if (!text || offers.length === 0) return null;
	const normalizedText = normalizeAdministradora(text);
	const negated = extractNegatedAdministradoras(text, offers);

	const nameMatches = offers.filter(
		(o) =>
			o.administradora &&
			!negated.has(normalizeAdministradora(o.administradora)) &&
			normalizedText.includes(normalizeAdministradora(o.administradora)),
	);

	const mentions = extractMoneyMentions(text);
	const valueMatches = mentions.length > 0 ? matchValueMentions(offers, mentions) : [];

	if (nameMatches.length === 1) {
		const named = nameMatches[0];
		if (valueMatches.length === 0) return named;
		return valueMatches.some((o) => o.groupId === named.groupId) ? named : null;
	}
	if (nameMatches.length > 1) {
		const overlap = nameMatches.filter((o) => valueMatches.some((v) => v.groupId === o.groupId));
		return overlap.length === 1 ? overlap[0] : null;
	}
	if (valueMatches.length === 1) return valueMatches[0];
	return null;
}

/** Resolve por menção textual a partir dos artifacts persistidos da conversa. */
export async function resolveOfferMentionForConversation(
	conversationId: string,
	text: string,
): Promise<ChosenOffer | null> {
	const rows = await loadArtifactRows(conversationId);
	return resolveOfferByMention(listShownOffers(rows), text);
}

// FIX-258 (P1, veredito Fable r4: FIX-252 "NÃO" — a resolução por menção
// (acima) só corrigia a âncora PÓS-simulação; o modo de falha real acontecia
// ANTES: o usuário nomeia "a ITAÚ"/"a de 92 mil" (visível na comparison_table)
// e a LLM adivinha o groupId ou tenta re-buscar com um sentinela, alimentando
// a espiral de negação (FIX-257). `buildMentionedOfferDirective` transforma o
// resultado de `resolveOfferByMention` numa diretiva ACIONÁVEL, injetada no
// prompt ANTES da LLM decidir (rota determinística — Lei 1/4, "nunca aja
// sobre entidade não-ancorada" ao contrário: aqui a entidade JÁ está ancorada
// em tela, então a LLM não pode agir como se não estivesse).

/** Diretiva pro sistema injetar no prompt do turno quando o texto do usuário
 * resolveu deterministicamente pra uma cota JÁ EXIBIDA. Nomeia o groupId
 * LITERAL pra LLM usar direto — nunca re-buscar, nunca inventar outro id,
 * nunca negar que a oferta existe. */
export function buildMentionedOfferDirective(offer: ChosenOffer): string {
	const detalhes: string[] = [`groupId="${offer.groupId}"`];
	if (offer.administradora) detalhes.push(`administradora=${offer.administradora}`);
	if (typeof offer.creditValue === "number") {
		detalhes.push(`crédito=${offer.creditValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
	}
	if (typeof offer.termMonths === "number") detalhes.push(`prazo=${offer.termMonths}m`);
	return (
		`O usuário está se referindo à cota JÁ EXIBIDA em tela (${detalhes.join(", ")}). ` +
		`Use ESSE groupId LITERAL diretamente em simulate_quota/get_group_details — NÃO chame ` +
		`search_groups de novo pra achar esse grupo, NÃO invente nem adivinhe outro id/sentinela. ` +
		`NUNCA negue que essa oferta existe: ela está na tabela/card que você mesmo apresentou.`
	);
}

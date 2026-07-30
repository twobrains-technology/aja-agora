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

import { falaRecusa } from "./yes-no";

// FIX-403/407 — `falaRecusa`, o predicado ÚNICO de recusa, nasceu aqui e MUDOU
// para `yes-no.ts`. O motivo da mudança é o mesmo que o motivo de ele existir:
// sete revisões acharam sete portas da mesma família porque cada correção criava
// uma cópia nova da lógica de negação. Quando o proxy do WhatsApp precisou dela,
// não pôde importar deste módulo e acabou reusando METADE (só `detectYesNoText`).
// Em `yes-no.ts` — o módulo neutro que os dois runtimes e os dois canais já
// importam sem criar ciclo — não há como isso se repetir.

/** Só o que a fala PEDE, sem as cláusulas que ela recusa — minúsculo, pronto pra
 * casar critério. FIX-405. */
function clausulasAfirmativas(text: string): string {
	return (text ?? "")
		.split(/[.!?;,]|\bmas\b|\bpor[ée]m\b/i)
		.filter((c) => c.trim() && !clausulaRecusa(c))
		.join(" ")
		.toLowerCase();
}

/** Nenhuma cláusula da fala é um pedido — só então desistir.
 *
 * FIX-405: aplicar `falaRecusa` à frase INTEIRA gerava falso positivo. "nunca fiz
 * consórcio antes, mas quero a Itaú" tem uma cláusula negativa (sobre a
 * experiência dele) e uma afirmativa (o pedido) — bloquear tudo por causa da
 * primeira mata a venda. Desiste-se só quando não sobra nenhuma cláusula pedindo
 * algo. */
function todasAsClausulasRecusam(text: string): boolean {
	const clausulas = (text ?? "").split(/[.!?;,]|\bmas\b|\bpor[ée]m\b/i).filter((c) => c.trim());
	if (clausulas.length === 0) return false;
	return clausulas.every((c) => clausulaRecusa(c) || !/[a-zà-ú]/i.test(c));
}

/** Campos ancorados da cota escolhida — alimentam recommendedAdministradora +
 * recommendedOffer (que buildStartContractInput usa como administradoraPreferida
 * + prazoPreferido no fechamento). */
export interface ChosenOffer {
	groupId: string;
	administradora?: string;
	creditValue?: number;
	termMonths?: number;
	monthlyPayment?: number;
	/** Lance médio DO GRUPO — viaja junto com o resto da cota. Ficava de fora, e
	 * como a re-âncora por menção fazia merge, o lance médio do grupo ANTIGO era
	 * herdado pelo novo: daí "ainda falta R$ 106.013" numa cota onde faltavam
	 * ~R$ 23.000. Campo de cota não pode existir só no card. */
	avgBidValue?: number;
	/** FIX-375: vagas reais do grupo (Bevi `monthlyAwardedQuotas`), como veio no
	 * artifact persistido — fonte do card de escassez quando a re-âncora por
	 * menção ("Bora fechar com o Itaú") reconstrói `recommendedOffer` a partir
	 * daqui. Sem ele, a re-âncora por menção sempre apagava o `availableSlots`
	 * que `discovery.ts` tinha propagado corretamente no reveal (FIX-374). */
	availableSlots?: number;
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
		avgBidValue: typeof p.avgBidValue === "number" ? p.avgBidValue : undefined,
		availableSlots: typeof p.availableSlots === "number" ? p.availableSlots : undefined,
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

/** A cláusula EXCLUI esta marca especificamente? — FIX-412.
 *
 * A 1ª versão (FIX-408) era um gatilho de CLÁUSULA: se a cláusula contivesse
 * `SEM (A|O)` em qualquer posição, toda marca citada nela — ou na cláusula
 * vizinha — era dada como excluída. A 10ª revisão independente mediu e mostrou
 * que isso recriou, dentro da correção, o bug que este arquivo documenta em
 * `resolveOfertaPorCriterio` ("o cliente escolheu a Canopus e o contrato saiu
 * Itaú, sem uma palavra sobre a troca"):
 *
 *   "quero a RODOBENS, sem a menor dúvida"    → contrato saía CANOPUS
 *   "quero a RODOBENS, sem a burocracia toda" → contrato saía CANOPUS
 *
 * Ênfase virou recusa porque "sem" é preposição comum e o gatilho não olhava do
 * que ela estava excluindo. A correção é ADJACÊNCIA: a exclusão só conta quando
 * incide sobre a MARCA — "menos a Rodobens", "sem ser a Rodobens", "a Rodobens
 * tá fora". Isso é precisão, não mais uma palavra na lista.
 *
 * ⚠️ Também saíram `CARA DEMAIS|CARO DEMAIS`: objeção de preço é SENTIMENTO, e a
 * própria justificativa do FIX-408 dizia que exclusão é família sintática, não
 * sentimento. Manter aquilo tornava arbitrária a ausência de "salgada", "pesa no
 * bolso", "muito cara" — que foi exatamente o que a 10ª revisão apontou.
 *
 * Opera sobre texto normalizado (maiúsculas, sem acento). */
function excluiMarca(clauseNormalizada: string, marcaNormalizada: string): boolean {
	const M = marcaNormalizada.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const artigo = "(?:A|O|AS|OS|ESSA|ESSE|ESTA|ESTE|DA|DO|DE|DAS|DOS)?";
	/** Exclusão ANTES da marca: "menos a X", "sem ser a X", "exceto a X". */
	const antes = new RegExp(
		`\\b(?:MENOS|SEM SER|SEM|EXCETO|EXCECAO|TIRANDO|TIRA|TIREI|FORA|EXCLUI|EXCLUINDO|NAO SEJA|NAO SER|DESCARTO|DESCARTEI|ELIMINEI|ELIMINANDO)\\s+${artigo}\\s*${M}\\b`,
	);
	/** Exclusão DEPOIS da marca: "a X tá fora", "a X eu descarto", "a X foi
	 * eliminada" — a mesma família, com a marca à esquerda. */
	const depois = new RegExp(
		`\\b${M}\\b[^.!?;,]{0,24}?\\b(?:TA FORA|ESTA FORA|FORA DA LISTA|DESCARTADA|DESCARTADO|ELIMINADA|ELIMINADO|DESCARTO|DESCARTEI|ELIMINEI|EXCLUI)\\b`,
	);
	return antes.test(clauseNormalizada) || depois.test(clauseNormalizada);
}

/** A cláusula recusa/exclui? Predicado ÚNICO usado pelos DOIS laços de
 * `extractNegatedAdministradoras`. FIX-408.
 *
 * Antes havia duas noções diferentes de "isto é um não" dentro da MESMA função:
 * o laço da contaminação usava só `falaRecusa`, o laço do nome usava
 * `NEGATION_TRIGGER` + `falaRecusa` copiado inline. "Rodobens, tá fora" escapava
 * exatamente por essa fresta — a exclusão vinha na cláusula seguinte, e o laço
 * que trata esse caso não sabia reconhecer exclusão.
 *
 * Duas noções de recusa dentro de uma função é a versão em miniatura do que
 * aconteceu no sistema inteiro por nove rodadas. Uma só. */
function clausulaRecusa(clause: string): boolean {
	// FIX-412 — a EXCLUSÃO saiu daqui de propósito. Ela agora é avaliada por
	// MARCA (`excluiMarca`), não por cláusula: como gatilho de cláusula ela
	// contaminava a marca da cláusula VIZINHA, e "quero a Rodobens, sem a menor
	// dúvida" mandava o contrato pra outra administradora.
	return NEGATION_TRIGGER.test(normalizeAdministradora(clause)) || falaRecusa(clause);
}

/** A fala RECUSA/EXCLUI esta administradora especificamente? — FIX-414.
 *
 * Existe porque a tool `escolher_cota` (converse.ts) era o caminho mais
 * PERMISSIVO do sistema, apesar de ser o "estruturado": ela vetava recusa
 * genérica (`falaRecusa`) e não sabia nada de EXCLUSÃO. Medido pela 11ª revisão
 * independente, no grafo real:
 *
 *   "qualquer uma menos a Rodobens, quero fechar" → tool ancorava RODOBENS
 *
 * A ironia que fechou o argumento: `resolveAdministradoraMention` — o resolvedor
 * de TEXTO, o "inseguro" — REJEITA essas mesmas falas. O campo criado pra ser a
 * parede era mais frouxo que o campo que ele substituiu.
 *
 * Reusa `extractNegatedAdministradoras`, a mesma peça que o caminho de texto usa.
 * Não é uma lista nova. */
export function administradoraFoiRecusada(
	text: string,
	offers: ChosenOffer[],
	administradora: string | undefined,
): boolean {
	if (!administradora) return false;
	return extractNegatedAdministradoras(text ?? "", offers).has(
		normalizeAdministradora(administradora),
	);
}

/** Administradoras mencionadas dentro de uma cláusula com gatilho de negação
 * explícito ("deixa a X pra lá", "esquece a X", "cancela a X") — nunca conta
 * um uso afirmativo de "deixa" sem o gatilho ("Deixa a X que você recomendou"
 * continua resolvendo — regressão FIX-252). PURO. */
function extractNegatedAdministradoras(text: string, offers: ChosenOffer[]): Set<string> {
	const negated = new Set<string>();
	// FIX-405: a adversativa separa cláusula tanto quanto a vírgula — "nunca fiz
	// consórcio antes mas quero a Itaú" tem a negação numa oração e o pedido na
	// outra, sem nenhuma pontuação entre elas.
	const clausulas = text.split(/[.!?;,]|\bmas\b|\bpor[ée]m\b/i);
	// FIX-405 — uma cláusula pode NOMEAR a marca e a SEGUINTE recusá-la:
	// "Itaú, não obrigado" é das formas mais naturais de dizer não em chat. Antes,
	// nome e gatilho precisavam estar na MESMA cláusula, então a vírgula salvava a
	// marca e ela era ancorada. Agora uma cláusula puramente negativa (que não cita
	// marca nenhuma) contamina a marca citada na cláusula ANTERIOR.
	for (const [i, clause] of clausulas.entries()) {
		if (!clausulaRecusa(clause)) continue;
		const citaMarca = offers.some(
			(o) =>
				o.administradora &&
				normalizeAdministradora(clause).includes(normalizeAdministradora(o.administradora)),
		);
		if (citaMarca) continue; // resolvida no laço abaixo, com o nome junto
		const anterior = clausulas[i - 1];
		if (!anterior) continue;
		const normAnterior = normalizeAdministradora(anterior);
		for (const o of offers) {
			if (o.administradora && normAnterior.includes(normalizeAdministradora(o.administradora))) {
				negated.add(normalizeAdministradora(o.administradora));
			}
		}
	}
	for (const clause of clausulas) {
		const normalizedClause = normalizeAdministradora(clause);
		// FIX-402 (7ª revisão independente) — a lista literal de gatilhos
		// (`NEGATION_TRIGGER`) reconhecia só sete formas de recusar, e seis formas
		// naturais passavam batido: "de jeito nenhum quero a Itaú", "nem pensar em
		// ficar com a Itaú", "jamais escolheria a Itaú", "não gostei da Itaú", "a
		// Itaú não me atende", "nunca ficaria com a Itaú" — todas ancoravam
		// justamente a marca recusada.
		//
		// O FIX-401 blindou a função IRMÃ (`resolveOfertaPorCriterio`) e não esta —
		// que é o caminho tentado PRIMEIRO em
		// `resolveAdministradoraMentionForConversation`. Como o nome resolve antes,
		// a correção do critério nunca era alcançada nesses casos.
		//
		// Aqui se reusa `detectYesNoText`, a MESMA peça que o critério usa: uma
		// fonte de verdade pra "isto é uma negativa", não duas listas divergindo com
		// o tempo. Ela já lê recusa explícita, adversativa e condicional. O
		// `NEGATION_TRIGGER` fica como complemento — cobre "esquece a X"/"deixa a X
		// pra lá", que não têm marcador de negação clássico e o `detectYesNoText`
		// não pega.
		//
		// A vírgula entrou no split de cláusulas junto: sem ela, "não gostei da
		// Itaú, quero a Canopus" era uma cláusula só e a negativa contaminava a
		// marca afirmada.
		// FIX-407 — as duas últimas condições eram `falaRecusa` copiado inline.
		// Agora que ele é o predicado ÚNICO (yes-no.ts), esta é a mesma peça que o
		// laço acima e que o proxy do WhatsApp usam. Cópia de predicado de recusa é
		// como cada rodada anterior ganhou uma noção diferente de "isto é um não".
		// FIX-408 — `EXCLUSION_TRIGGER` cobre a família que ELIMINA da lista em vez
		// de negar ("menos a X", "sem a X", "a X tá fora").
		const recusaAClausulaInteira = clausulaRecusa(clause);
		for (const o of offers) {
			if (!o.administradora) continue;
			const marca = normalizeAdministradora(o.administradora);
			if (!normalizedClause.includes(marca)) continue;
			// Ou a cláusula toda é uma recusa (e a marca citada nela cai junto), ou a
			// exclusão incide sobre ESTA marca especificamente. FIX-412.
			if (recusaAClausulaInteira || excluiMarca(normalizedClause, marca)) {
				negated.add(marca);
			}
		}
	}
	return negated;
}

/** Todos os valores mencionados no texto casados contra um CAMPO NUMÉRICO das
 * cotas exibidas — por menção, o CONJUNTO empatado no menor diff (não só o 1º
 * encontrado), unido entre as várias menções do texto. PURO. Generaliza a
 * mesma semântica pra creditValue/monthlyPayment/termMonths (FIX-267). */
function matchByNumericField(
	offers: ChosenOffer[],
	mentions: number[],
	getField: (o: ChosenOffer) => number | undefined,
	tolerance: number,
): ChosenOffer[] {
	const matched = new Map<string, ChosenOffer>();
	for (const m of mentions) {
		let minDiff = Number.POSITIVE_INFINITY;
		let tied: ChosenOffer[] = [];
		for (const o of offers) {
			const value = getField(o);
			if (typeof value !== "number") continue;
			const diff = Math.abs(value - m) / m;
			if (diff > tolerance) continue;
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

function matchValueMentions(offers: ChosenOffer[], mentions: number[]): ChosenOffer[] {
	return matchByNumericField(offers, mentions, (o) => o.creditValue, 0.1);
}

// FIX-267 (P1, veredito Fable r6, "o que segura o 7" #3): resolveOfferByMention
// só casava por nome de administradora ou creditValue — menção por PARCELA
// ("a de 1.200 por mês"/"a da parcela de 1.213,85") ou PRAZO ("a de 84
// meses"/"a de 7 anos") não resolvia mesmo com o grupo EXIBIDO batendo
// exatamente. As duas extrações abaixo são independentes das de creditValue
// (contexto textual próprio — "por mês"/"parcela"/"meses"/"anos" — nunca
// confunde com um valor de crédito solto no mesmo texto).

/** Menções de PARCELA (monthlyPayment): "parcela de R$ 1.213,85", "1.200 por
 * mês", "1200/mês", "mensais de 1.200". PURO. */
function extractMonthlyPaymentMentions(text: string): number[] {
	const out: number[] = [];
	for (const m of text.matchAll(/(?:parcela|mensalidade)s?\s*(?:de)?\s*(?:R\$\s*)?([\d.,]+)/gi)) {
		const n = parsePtBrNumber(m[1]);
		if (n !== null) out.push(n);
	}
	for (const m of text.matchAll(
		/(?:R\$\s*)?([\d.,]+)\s*(?:por\s*m[eê]s|\/\s*m[eê]s|mensais?)\b/gi,
	)) {
		const n = parsePtBrNumber(m[1]);
		if (n !== null) out.push(n);
	}
	return out;
}

function matchMonthlyPaymentMentions(offers: ChosenOffer[], mentions: number[]): ChosenOffer[] {
	return matchByNumericField(offers, mentions, (o) => o.monthlyPayment, 0.05);
}

/** Menções de PRAZO (termMonths): "84 meses", "7 anos" (convertido pra
 * meses). PURO. */
function extractTermMentions(text: string): number[] {
	const out: number[] = [];
	for (const m of text.matchAll(/\b(\d{1,3})\s*(?:meses|m[eê]s)\b/gi)) {
		const n = Number(m[1]);
		if (!Number.isNaN(n)) out.push(n);
	}
	for (const m of text.matchAll(/\b(\d{1,2})\s*anos?\b/gi)) {
		const n = Number(m[1]);
		if (!Number.isNaN(n)) out.push(n * 12);
	}
	return out;
}

function matchTermMentions(offers: ChosenOffer[], mentions: number[]): ChosenOffer[] {
	return matchByNumericField(offers, mentions, (o) => o.termMonths, 0);
}

/** Une várias listas de matches, dedupe por groupId. PURO. */
function unionByGroupId(groups: ChosenOffer[][]): ChosenOffer[] {
	const merged = new Map<string, ChosenOffer>();
	for (const group of groups) {
		for (const o of group) merged.set(o.groupId, o);
	}
	return [...merged.values()];
}

/** Resolve determinística de menção textual (nome de administradora OU valor
 * aproximado) pra uma das cotas JÁ EXIBIDAS — nunca inventa (Lei 3): null
 * quando genuinamente ambíguo ou sem match. Nome único cujo PRÓPRIO valor
 * está no conjunto de valores mencionados resolve SEMPRE — mesmo se outro
 * grupo exibido empata no mesmo valor (LEI: nome/valor casando um grupo
 * exibido nunca desiste/nega). Menção negada é descartada antes de resolver. */
export function resolveOfferByMention(offers: ChosenOffer[], text: string): ChosenOffer | null {
	if (!text || offers.length === 0) return null;
	// FIX-403 — a 8ª porta, achada em varredura própria antes da revisão: o
	// casamento por NOME herdava `extractNegatedAdministradoras` (FIX-402), mas o
	// casamento por VALOR, PARCELA e PRAZO não olhava negação nenhuma —
	// "não quero a de 721 mil" ancorava justamente ela. Negação vale pra qualquer
	// forma de apontar a cota, não só pra marca.
	if (todasAsClausulasRecusam(text)) return null;
	const normalizedText = normalizeAdministradora(text);
	const negated = extractNegatedAdministradoras(text, offers);

	const nameMatches = offers.filter(
		(o) =>
			o.administradora &&
			!negated.has(normalizeAdministradora(o.administradora)) &&
			normalizedText.includes(normalizeAdministradora(o.administradora)),
	);

	const moneyMentions = extractMoneyMentions(text);
	const creditMatches = moneyMentions.length > 0 ? matchValueMentions(offers, moneyMentions) : [];

	// FIX-267: parcela/prazo mencionados casam contra os MESMOS grupos
	// exibidos, unidos ao conjunto de matches por valor (mesma semântica de
	// "resolve determinístico se casa um grupo exibido", nunca desiste).
	const monthlyMentions = extractMonthlyPaymentMentions(text);
	const monthlyMatches =
		monthlyMentions.length > 0 ? matchMonthlyPaymentMentions(offers, monthlyMentions) : [];

	const termMentions = extractTermMentions(text);
	const termMatches = termMentions.length > 0 ? matchTermMentions(offers, termMentions) : [];

	const valueMatches = unionByGroupId([creditMatches, monthlyMatches, termMatches]);

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

/**
 * O cliente NOMEOU uma administradora entre as exibidas. Diferente de
 * `resolveOfferByMention`, que desiste quando a marca tem várias cotas na tela
 * ("qual delas?"), aqui a resposta é a MELHOR cota daquela marca — a primeira
 * na ordem exibida, que é a ordem do ranking.
 *
 * Existe porque desistir em silêncio era pior: o cliente dizia "a da Canopus me
 * atende, bora fechar" e o fechamento saía na ITAÚ, sem uma palavra sobre a
 * troca (visto ao vivo, 2026-07-21). Escolher a marca é decisão dele; escolher
 * a melhor cota DENTRO da marca é o mesmo critério que o sistema já usou pra
 * recomendar. `null` quando ele não nomeou nenhuma das exibidas.
 */
/** O cliente escolheu por CARACTERÍSTICA, não por nome.
 *
 * "Prefiro a de prazo mais longo", "quero a de menor parcela" — o cliente
 * raramente decora o nome da administradora, ele aponta pelo que importa pra
 * ele. A resolução por nome não cobre isso, então o estado continuava ancorado
 * na recomendação original: um cliente escolheu a Canopus (R$ 2.792 em 116
 * meses), ouviu o agente confirmar esses números CINCO vezes, e o contrato saiu
 * Itaú com parcela de R$ 6.467 em 49 meses — 2,3× mais caro, sem uma palavra
 * sobre a troca (visto ao vivo, 2026-07-21).
 *
 * Ordenar a lista real por parcela/prazo/carta é determinístico — não é
 * adivinhar intenção, é aplicar o critério que ele nomeou sobre as cotas que
 * ele viu. Sem critério reconhecido, devolve null e nada se ancora. */
export function resolveOfertaPorCriterio(offers: ChosenOffer[], text: string): ChosenOffer | null {
	// FIX-405 — o critério só vale nas cláusulas AFIRMATIVAS.
	//
	// Antes o casamento ("carta maior", "menor parcela") varria a frase inteira:
	// "não quero a carta maior, prefiro a menor mesmo" resolvia A MAIOR — justamente
	// a recusada. O guard de recusa não salvava, porque a segunda cláusula É um
	// pedido, então a frase passava inteira e a regex casava a primeira metade.
	//
	// Descartar as cláusulas negativas ANTES de procurar critério resolve os dois
	// lados: a recusa não contamina o pedido, e o pedido não se perde por causa da
	// recusa ao lado.
	const t = clausulasAfirmativas(text ?? "");
	if (!t.trim()) return null;
	if (offers.length === 0) return null;
	// FIX-401 (6ª revisão independente) — RECUSA não resolve critério.
	//
	// Esta função casava "carta maior" em qualquer ponto da frase e ignorava tudo
	// em volta: "de jeito nenhum quero essa carta maior" e "não quero a carta
	// maior, prefiro a menor" devolviam A CARTA MAIOR. A irmã dela,
	// `resolveAdministradoraMention`, já trata negação desde sempre
	// (`extractNegatedAdministradoras`) — o caminho por critério nunca ganhou o
	// mesmo cuidado.
	//
	// Importa especialmente depois do FIX-400: aquele fix tirou `afirmacao` e
	// `criterio` do `advance.ts`, mas esta função segue alcançável DENTRO de
	// `origem: "mencao"` — o caminho que o FIX-400 manteve por ser verificável.
	// Verificável era; imune a negação, não.
	//
	// `detectYesNoText` já sabe ler recusa, adversativa e condicional; reusá-lo
	// evita reinventar (mal) a mesma análise aqui. `intent: "neutral"` porque só
	// interessa o TEXTO — o rótulo do turno é decidido rio acima.
	if (todasAsClausulasRecusam(t)) return null;
	/** Extremo (menor/maior) de um campo NUMÉRICO entre as cotas que têm o campo.
	 * Devolve o valor junto com a cota pra o comparador nunca precisar reafirmar
	 * que o campo existe — quem filtrou já provou. */
	const extremo = (
		campo: "monthlyPayment" | "termMonths" | "creditValue",
		lado: "menor" | "maior",
	): ChosenOffer | null => {
		const candidatas = offers.flatMap((o) => {
			const v = o[campo];
			return typeof v === "number" ? [{ oferta: o, valor: v }] : [];
		});
		if (candidatas.length === 0) return null;
		return candidatas.reduce((a, b) =>
			lado === "menor" ? (b.valor < a.valor ? b : a) : b.valor > a.valor ? b : a,
		).oferta;
	};

	const menorParcela =
		/\b(menor|mais baixa|mais barata|mais em conta|mais leve)\b.{0,20}\bparcela|\bparcela\b.{0,20}\b(menor|mais baixa|mais barata|mais em conta|mais leve)\b/.test(
			t,
		);
	const maiorPrazo =
		/\b(prazo|prazos?)\b.{0,20}\b(mais longo|maior|mais longa)\b|\b(mais longo|maior)\b.{0,10}\bprazo\b/.test(
			t,
		);
	const menorPrazo =
		/\b(prazo|prazos?)\b.{0,20}\b(mais curto|menor)\b|\b(mais curto|menor)\b.{0,10}\bprazo\b/.test(
			t,
		);
	const maiorCarta =
		/\b(maior|mais alta)\b.{0,20}\bcarta\b|\bcarta\b.{0,20}\b(maior|mais alta)\b/.test(t);

	if (menorParcela) return extremo("monthlyPayment", "menor");
	if (maiorPrazo) return extremo("termMonths", "maior");
	if (menorPrazo) return extremo("termMonths", "menor");
	if (maiorCarta) return extremo("creditValue", "maior");
	return null;
}

export function resolveAdministradoraMention(
	offers: ChosenOffer[],
	text: string,
): ChosenOffer | null {
	if (!text || offers.length === 0) return null;
	// FIX-405 — o guard de FRASE INTEIRA saiu daqui.
	//
	// Ele existia como rede de fora, com uma exceção de vírgula (`&& !/,/`) pra não
	// bloquear "não gostei da Itaú, quero a Canopus". A 8ª revisão mostrou os dois
	// lados do estrago: a exceção deixava "Itaú, não obrigado" ancorar a Itaú, e o
	// guard sem exceção bloqueava "nunca fiz consórcio antes mas quero a Itaú" —
	// falso positivo que mata venda legítima, porque "nunca" ali descreve
	// inexperiência, não recusa.
	//
	// A regra coerente é uma só: negação se avalia POR CLÁUSULA, e é
	// `extractNegatedAdministradoras` que faz isso — inclusive contaminando a marca
	// da cláusula vizinha quando a recusa vem depois da vírgula. Sem rede de fora,
	// sem exceção.
	const normalizedText = normalizeAdministradora(text);
	const negadas = extractNegatedAdministradoras(text, offers);
	const citadas = offers.filter(
		(o) =>
			o.administradora &&
			!negadas.has(normalizeAdministradora(o.administradora)) &&
			normalizedText.includes(normalizeAdministradora(o.administradora)),
	);
	if (citadas.length === 0) return null;
	// Nomeou mais de uma marca ("entre a Itaú e a Canopus…") — aí não dá pra
	// cravar nada: é pergunta, não escolha.
	const marcas = new Set(citadas.map((o) => normalizeAdministradora(o.administradora ?? "")));
	if (marcas.size > 1) return null;
	return resolveOfferByMention(citadas, text) ?? citadas[0];
}

/** Resolve por menção textual a partir dos artifacts persistidos da conversa. */
export async function resolveOfferMentionForConversation(
	conversationId: string,
	text: string,
): Promise<ChosenOffer | null> {
	const rows = await loadArtifactRows(conversationId);
	return resolveOfferByMention(listShownOffers(rows), text);
}

/** `resolveAdministradoraMention` a partir dos artifacts da conversa. */
export async function resolveAdministradoraMentionForConversation(
	conversationId: string,
	text: string,
	// A resolução por CARACTERÍSTICA precisa saber se o turno é uma decisão — e
	// isso quem sabe é o modelo, não uma regex. "Carta maior" numa pergunta é a
	// pessoa falando do CONCEITO; numa decisão é ela escolhendo a cota. Default
	// `true` preserva os chamadores que já resolvem isso por conta própria.
	opts: { permitirCriterio?: boolean } = {},
): Promise<ChosenOffer | null> {
	const rows = await loadArtifactRows(conversationId);
	const ofertas = listShownOffers(rows);
	// Nome primeiro (mais específico); característica só quando ele não nomeou.
	const porNome = resolveAdministradoraMention(ofertas, text);
	if (porNome) return porNome;
	if (opts.permitirCriterio === false) return null;
	return resolveOfertaPorCriterio(ofertas, text);
}

// FIX-266 (P1, veredito Fable r6): quando a menção não resolve (genuinamente
// ambígua/sem match) e o fallback de tool-error precisa variar na 2ª
// ocorrência, o orchestrator precisa da lista de cotas JÁ EXIBIDAS pra montar
// uma opção concreta (buildToolErrorRecoveryFallbackRepeat) — mesma fonte
// determinística (`listShownOffers`), só faltava o wrapper async.
export async function listShownOffersForConversation(
	conversationId: string,
): Promise<ChosenOffer[]> {
	const rows = await loadArtifactRows(conversationId);
	return listShownOffers(rows);
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
		detalhes.push(
			`crédito=${offer.creditValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
		);
	}
	if (typeof offer.termMonths === "number") detalhes.push(`prazo=${offer.termMonths}m`);
	return (
		`O usuário está se referindo à cota JÁ EXIBIDA em tela (${detalhes.join(", ")}). ` +
		`Use ESSE groupId LITERAL diretamente em simulate_quota/get_group_details — NÃO chame ` +
		`search_groups de novo pra achar esse grupo, NÃO invente nem adivinhe outro id/sentinela. ` +
		`NUNCA negue que essa oferta existe: ela está na tabela/card que você mesmo apresentou.`
	);
}

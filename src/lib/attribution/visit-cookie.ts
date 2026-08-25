// src/lib/attribution/visit-cookie.ts
//
// Cookies e regra de "quando é visita nova". Módulo PURO — sem banco, sem
// framework, sem relógio próprio (o `nowMs` entra por parâmetro).
//
// A decisão vive aqui, isolada, porque é ela que define o denominador de todo
// número da dashboard: contar visita demais infla a taxa de conversão pra
// baixo, contar de menos infla pra cima. Sendo pura, a regra é testável sem
// subir nada.

/** Cookie de visitante (device). Mesmo nome usado pela memória do agente. */
export const VISITOR_COOKIE = "aja_uid";
/** Cookie da visita corrente: `<uuid>.<epochMs>`. */
export const VISIT_COOKIE = "aja_visit";
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 dias
export const VISIT_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/** Inatividade que encerra a visita corrente. 30min é a convenção de mercado (GA4). */
export const VISIT_WINDOW_MS = 30 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Novo id de visitante — 32 hex, o MESMO formato que `generateCookieValue` de
 * `@/lib/memory/identity` produz. Sair desse formato faria `identityFromCookie`
 * lançar e derrubaria a memória de todo visitante novo.
 */
export function newVisitorId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Novo id de visita. UUID porque a coluna `visits.id` é uuid. */
export function newVisitId(): string {
	return crypto.randomUUID();
}

/**
 * O cookie: `<uuid>.<epochMs>` ou `<uuid>.<epochMs>.<assinatura do criativo>`.
 *
 * A terceira parte entrou em 24/08/2026 e é opcional de propósito — cookie
 * gravado antes dela continua válido, e ninguém perde a visita corrente no
 * deploy. Nenhuma das três partes contém ponto (UUID tem hífen, o timestamp é
 * inteiro e a assinatura é base36), então dividir por ponto é seguro.
 */
export function encodeVisitCookie(
	visitId: string,
	atMs: number,
	assinatura?: string | null,
): string {
	return assinatura ? `${visitId}.${atMs}.${assinatura}` : `${visitId}.${atMs}`;
}

export function parseVisitCookie(raw: string | null | undefined): {
	visitId: string;
	atMs: number;
	/** Criativo que abriu esta visita. `null` em cookie anterior a 24/08/2026. */
	assinatura: string | null;
} | null {
	if (!raw) return null;

	const partes = raw.split(".");
	if (partes.length < 2 || partes.length > 3) return null;

	const [visitId, bruto, assinatura] = partes;
	const atMs = Number(bruto);

	if (!UUID_RE.test(visitId)) return null;
	if (!Number.isSafeInteger(atMs) || atMs <= 0) return null;

	return { visitId, atMs, assinatura: assinatura || null };
}

export interface VisitDecision {
	visitId: string;
	/** `true` → precisa gravar a linha em `visits`. */
	isNew: boolean;
	/** Valor a carimbar no cookie `aja_visit`. */
	cookieValue: string;
}

/**
 * Decide se a chegada abre visita nova ou continua a corrente.
 *
 * Visita nova quando: (a) não há visita válida no cookie, (b) a última passou de
 * 30min de inatividade, ou (c) o visitante chegou por um criativo DIFERENTE do
 * que abriu a visita corrente — clique num anúncio novo é chegada nova mesmo
 * dentro da janela, senão o criativo que trouxe a pessoa de volta não recebe
 * crédito nenhum.
 *
 * **O (c) já foi "chegou com campanha na URL", e essa é a correção de
 * 24/08/2026.** A intenção era a mesma; o efeito, não. Comparar um BOOLEANO
 * ("tem campanha?") em vez do criativo fazia toda requisição repetida com os
 * mesmos UTMs abrir uma visita — e o cookie, que existe justamente para
 * absorver repetição, era ignorado exatamente no tráfego pago. Medido em
 * produção: 181 de 830 chegadas (21,8%) eram o mesmo visitante com o mesmo
 * criativo em menos de 30 minutos, e isso DEPOIS de descontar a rajada de
 * prefetch que o proxy passou a barrar.
 *
 * Continuando a visita, a janela DESLIZA (o cookie leva o timestamp novo) e a
 * assinatura é PRESERVADA — a segunda página da sessão não traz UTM na URL, e
 * perder a assinatura ali faria o carregamento seguinte parecer criativo novo.
 */
export function decideVisit(input: {
	rawCookie: string | null | undefined;
	/** Assinatura do criativo desta chegada; `null` quando não há mídia na URL. */
	assinaturaDaCampanha: string | null;
	nowMs: number;
	newId?: () => string;
}): VisitDecision {
	const { rawCookie, assinaturaDaCampanha, nowMs, newId = newVisitId } = input;
	const corrente = parseVisitCookie(rawCookie);

	const dentroDaJanela = corrente !== null && nowMs - corrente.atMs <= VISIT_WINDOW_MS;

	// Cookie antigo (sem assinatura) + chegada por anúncio cai aqui como criativo
	// novo. É o lado seguro: abre uma visita a mais uma única vez, no deploy, e o
	// cookie já sai daqui carimbado para a passagem seguinte.
	const criativoMudou =
		assinaturaDaCampanha !== null && assinaturaDaCampanha !== corrente?.assinatura;

	const continua = dentroDaJanela && !criativoMudou;

	const visitId = continua ? (corrente as { visitId: string }).visitId : newId();
	const assinatura = continua
		? (corrente?.assinatura ?? assinaturaDaCampanha)
		: assinaturaDaCampanha;

	return {
		visitId,
		isNew: !continua,
		cookieValue: encodeVisitCookie(visitId, nowMs, assinatura),
	};
}

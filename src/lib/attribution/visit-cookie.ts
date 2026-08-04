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

export function encodeVisitCookie(visitId: string, atMs: number): string {
	return `${visitId}.${atMs}`;
}

export function parseVisitCookie(raw: string | null | undefined): {
	visitId: string;
	atMs: number;
} | null {
	if (!raw) return null;
	const separador = raw.lastIndexOf(".");
	if (separador <= 0) return null;

	const visitId = raw.slice(0, separador);
	const atMs = Number(raw.slice(separador + 1));

	if (!UUID_RE.test(visitId)) return null;
	if (!Number.isSafeInteger(atMs) || atMs <= 0) return null;

	return { visitId, atMs };
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
 * Visita nova quando: (a) não há visita válida no cookie, (b) a última passou
 * de 30min de inatividade, ou (c) o visitante chegou por anúncio — clique em
 * anúncio é chegada nova mesmo dentro da janela, senão o criativo que trouxe a
 * pessoa de volta não recebe crédito nenhum.
 *
 * Continuando a visita, a janela DESLIZA (o cookie leva o timestamp novo), pra
 * que uma sessão longa de leitura não seja contada como duas visitas.
 */
export function decideVisit(input: {
	rawCookie: string | null | undefined;
	hasCampaign: boolean;
	nowMs: number;
	newId?: () => string;
}): VisitDecision {
	const { rawCookie, hasCampaign, nowMs, newId = newVisitId } = input;
	const corrente = parseVisitCookie(rawCookie);

	const continua = corrente !== null && !hasCampaign && nowMs - corrente.atMs <= VISIT_WINDOW_MS;

	const visitId = continua ? corrente.visitId : newId();

	return {
		visitId,
		isNew: !continua,
		cookieValue: encodeVisitCookie(visitId, nowMs),
	};
}

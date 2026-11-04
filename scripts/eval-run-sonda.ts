/**
 * Decisão de QUAL sonda de LLM o `pnpm eval` usa. Fica fora de `eval-run.ts` porque
 * aquele arquivo roda `main()` ao ser importado.
 *
 * - alvo local (localhost, 127.0.0.1, *.orb.local): o gateway LiteLLM do host é o do app → "gateway".
 * - alvo remoto: o gateway do host não diz nada sobre o LLM do app → "app" (um turno "oi").
 * - `EVAL_SONDA=app|gateway` força.
 */
export type Sonda = "gateway" | "app";

/** Início da fala de reserva do motor (`src/lib/agent/pi/turno-livre.ts`, texto inline, não exportado). */
export const FRASE_DE_RESERVA_DO_MOTOR = "Desculpa, me perdi aqui";

export function alvoEhLocal(baseUrl: string): boolean {
	try {
		const host = new URL(baseUrl).hostname.toLowerCase();
		return host === "localhost" || host === "127.0.0.1" || host.endsWith(".orb.local");
	} catch {
		return false;
	}
}

export function escolherSonda(baseUrl: string, forcada?: string | null): Sonda {
	const f = forcada?.trim().toLowerCase();
	if (f === "app" || f === "gateway") return f;
	return alvoEhLocal(baseUrl) ? "gateway" : "app";
}

/** Avalia a resposta do turno "oi"; devolve o motivo da falha, ou null se o LLM do app respondeu. */
export function motivoDaSondaPeloApp(r: {
	httpStatus: number | null;
	agentText: string;
	error?: unknown;
}): string | null {
	if (r.httpStatus !== 200) {
		return `app HTTP ${r.httpStatus}${r.error ? `: ${String(r.error).slice(0, 160)}` : ""}`;
	}
	const texto = (r.agentText ?? "").trim();
	if (!texto) return "app respondeu 200 com agentText vazio";
	if (texto.includes(FRASE_DE_RESERVA_DO_MOTOR)) {
		return "app respondeu com a fala de reserva do motor (LLM não respondeu)";
	}
	return null;
}

// ── Transporte: login único e reenvio em 429 ─────────────────────────────────
//
// O Better Auth da dev limita o sign-in e o app limita turnos por conversa
// (`src/app/api/chat/route.ts`: 10/min por conversa, janela de 60 s). 429 é
// transporte, não conduta: espera, reenvia o MESMO turno e, esgotado, o cenário
// fica INCONCLUSIVO — nunca reprovado.

export const MAX_TENTATIVAS_429 = 3;
export const ESPERA_PADRAO_429_MS = 60_000;
export const ESPERA_MAXIMA_429_MS = 65_000;

/** Quanto esperar após um 429: `Retry-After` (segundos) se veio, senão a janela inteira; teto de ~65 s. */
export function esperaDoRetry(retryAfter: string | number | null | undefined): number {
	const s = typeof retryAfter === "string" ? Number.parseFloat(retryAfter) : retryAfter;
	if (typeof s === "number" && Number.isFinite(s) && s >= 0) {
		return Math.min(Math.ceil(s * 1000) + 500, ESPERA_MAXIMA_429_MS);
	}
	return ESPERA_PADRAO_429_MS;
}

export type DepsDeTransporte = {
	fetchImpl?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
};

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** POST com reenvio em 429 (até `MAX_TENTATIVAS_429` esperas). Devolve a última resposta. */
async function postComRetry(
	url: string,
	init: RequestInit,
	deps: DepsDeTransporte,
): Promise<Response> {
	const f = deps.fetchImpl ?? fetch;
	const sleep = deps.sleep ?? dormir;
	let res = await f(url, init);
	for (let i = 0; i < MAX_TENTATIVAS_429 && res.status === 429; i++) {
		await sleep(esperaDoRetry(res.headers.get("retry-after")));
		res = await f(url, init);
	}
	return res;
}

/** Login admin UMA vez por rodada; devolve o cookie. `Origin` explícito: o Better Auth recusa POST sem origem confiável. */
export async function loginAdmin(
	base: string,
	email: string,
	password: string,
	deps: DepsDeTransporte = {},
): Promise<string> {
	const login = await postComRetry(
		`${base}/api/auth/sign-in/email`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: base },
			body: JSON.stringify({ email, password }),
		},
		deps,
	);
	if (!login.ok) throw new Error(`login admin falhou: HTTP ${login.status}`);
	return login.headers.getSetCookie?.().join("; ") ?? login.headers.get("set-cookie") ?? "";
}

/** Cria a conversa simulada com o cookie já obtido. */
export async function criarSessaoSimulada(
	base: string,
	cookie: string,
	deps: DepsDeTransporte = {},
): Promise<string> {
	const res = await postComRetry(
		`${base}/api/admin/simulator/sessions`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookie, Origin: base },
			body: JSON.stringify({ channel: "web" }),
		},
		deps,
	);
	if (!res.ok) throw new Error(`criação de sessão de simulador falhou: HTTP ${res.status}`);
	return ((await res.json()) as { conversationId: string }).conversationId;
}

type ResultadoDeTurno = { httpStatus: number | null; retryAfterMs?: number | null };

/** Reenvia o MESMO turno enquanto vier 429. `inconclusivo` = esgotou as tentativas. */
export async function enviarTurnoComRetry<R extends ResultadoDeTurno>(
	enviar: () => Promise<R>,
	deps: Pick<DepsDeTransporte, "sleep"> = {},
): Promise<{ r: R; inconclusivo: boolean }> {
	const sleep = deps.sleep ?? dormir;
	let r = await enviar();
	for (let i = 0; i < MAX_TENTATIVAS_429 && r.httpStatus === 429; i++) {
		await sleep(esperaDoRetry(r.retryAfterMs != null ? r.retryAfterMs / 1000 : null));
		r = await enviar();
	}
	return { r, inconclusivo: r.httpStatus === 429 };
}

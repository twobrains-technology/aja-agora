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

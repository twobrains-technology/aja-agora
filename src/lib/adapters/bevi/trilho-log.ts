/**
 * Observabilidade de trilho (Kairo, 2026-07-02) — cada chamada HTTP à Bevi é
 * tagueada com o TRILHO real batido, na FRONTEIRA de rede (verdade absoluta:
 * "esta URL foi chamada"). Responde de forma inequívoca "passou pelo A ou pelo B?"
 *
 * - Trilho A = API de Parceiro (uxvision/credithub) — FECHAMENTO (passo 5).
 * - Trilho B = self-contract (core-*-selfcontract) — DESCOBERTA/SIMULAÇÃO (passos 1-4).
 *
 * Regra 1 do CLAUDE.md: descoberta/simulação = B; fechamento = A. Estes logs
 * tornam a separação AUDITÁVEL em cada turno. Nunca logam body (pode conter PII);
 * só method + endpoint + status + duração. Grepável por `source":"bevi-http`.
 */

export type Trilho = "A" | "B";

const LABEL: Record<Trilho, string> = {
	A: "parceiro/uxvision (fechamento — passo 5)",
	B: "self-contract (descoberta/simulacao — passos 1-4)",
};

export interface TrilhoLogInput {
	trilho: Trilho;
	method: string;
	/** Identificador do endpoint: path (Trilho B) ou service_id (Trilho A). Sem PII. */
	endpoint: string;
	phase: "request" | "response" | "error";
	/** Código HTTP/envelope, quando houver. */
	status?: number;
	/** Duração em ms, quando houver (fase response/error). */
	ms?: number;
	ok?: boolean;
}

/** Linha JSON estruturada (grepável). Pura — testável sem tocar console. */
export function buildTrilhoLogLine(input: TrilhoLogInput): string {
	return JSON.stringify({
		level: input.phase === "error" ? "error" : "info",
		source: "bevi-http",
		trilho: input.trilho,
		trilho_label: LABEL[input.trilho],
		phase: input.phase,
		method: input.method,
		endpoint: input.endpoint,
		...(input.status !== undefined ? { status: input.status } : {}),
		...(input.ok !== undefined ? { ok: input.ok } : {}),
		...(input.ms !== undefined ? { ms: input.ms } : {}),
	});
}

/** Emite a linha (server-side). Nunca lança — observabilidade não derruba o fluxo. */
export function logTrilho(input: TrilhoLogInput): void {
	try {
		const line = buildTrilhoLogLine(input);
		if (input.phase === "error") console.error(line);
		else console.log(line);
	} catch {
		// no-op: log nunca pode quebrar a chamada de negócio.
	}
}

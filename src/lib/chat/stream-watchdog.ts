// FIX-110 — watchdog de stream preso (client).
//
// Defesa-em-profundidade contra um stream que MORRE sem emitir fim nem erro
// (conexão/proxy caiu no meio): nesse caso o useChat fica preso em
// "submitted"/"streaming" pra sempre, o ChatInput continua `disabled` e o
// usuário não consegue nem reenviar. A decisão é uma função pura (status +
// inatividade) pra ser testável fora do React; o provider arma um timer que a
// consulta e, se preso, aborta o stream e libera o input.

export type ChatStreamStatus = "submitted" | "streaming" | "ready" | "error";

/**
 * Teto de inatividade do stream antes de considerá-lo morto. Generoso de
 * propósito: um turno legítimo pode ficar segundos sem emitir nada enquanto o
 * servidor roda uma tool da Bevi (busca/simulação) + a chamada ao modelo. 45s
 * fica MUITO acima de qualquer turno real (SLA alvo é < 3s) e ainda assim é
 * finito — nunca "preso pra sempre".
 */
export const STREAM_STALL_TIMEOUT_MS = 45_000;

export function isStreamStuck(opts: {
	status: ChatStreamStatus;
	/** ms desde a última atividade observada (delta/part recebido ou troca de status). */
	msSinceLastActivity: number;
	timeoutMs?: number;
}): boolean {
	const limit = opts.timeoutMs ?? STREAM_STALL_TIMEOUT_MS;
	const inFlight = opts.status === "submitted" || opts.status === "streaming";
	return inFlight && opts.msSinceLastActivity >= limit;
}

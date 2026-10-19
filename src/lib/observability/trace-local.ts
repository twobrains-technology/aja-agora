// O TRACE DO TURNO — local, sem SDK.
//
// O que o Langfuse dava aqui era o agrupamento: um id de trace por turno, onde
// tudo (fala, tools, analyzer, cards) caía junto, mais o `output` final. Com o
// Langfuse fora (B6, 19/10/2026), o trace continua existindo — só que o destino
// é o log estruturado do processo, e o `turn-trace` (telemetry/turn-trace.ts)
// segue sendo o registro durável do turno no banco.
//
// Leis que NÃO mudam: erro de observabilidade nunca derruba o turno; erro do
// TURNO propaga intacto (engolir mascararia bug real do agente).
export type TraceDoTurnoCtx = {
	conversationId: string;
	channel: "web" | "whatsapp";
	isSimulated: boolean;
	persona?: string | null;
	userId?: string | null;
	userText?: string | null;
};

export type TraceDoTurnoHandle = {
	traceId: string;
	/** Registra a fala final do agente (o `output` do turno no log). */
	setOutput: (text: string) => void;
};

export async function comTraceDoTurno<T>(
	ctx: TraceDoTurnoCtx,
	fn: (turn: TraceDoTurnoHandle) => Promise<T>,
): Promise<T> {
	const traceId = crypto.randomUUID();
	let output = "";
	const handle: TraceDoTurnoHandle = {
		traceId,
		setOutput: (texto) => {
			output = texto;
		},
	};
	try {
		return await fn(handle);
	} finally {
		try {
			// Uma linha por turno: id, canal, persona e a fala final (mascarada pelo
			// próprio turn-trace, que é quem persiste PII).
			console.log(
				`[turno] trace=${traceId} canal=${ctx.channel} persona=${ctx.persona ?? "-"} simulada=${
					ctx.isSimulated
				} conversa=${ctx.conversationId} out=${JSON.stringify(output.slice(0, 400))}`,
			);
		} catch {
			// observabilidade nunca custa o turno
		}
	}
}

// Wrapper de turno — abre o trace Langfuse que agrupa TUDO que acontece num
// turno (converse + tool-loop + analyzer + tools), no mesmo padrão do
// withSimulatorClockIfNeeded: o chamador PRECISA consumir o stream inteiro
// dentro do callback, senão os spans filhos saem órfãos do contexto OTel.
//
// Leis (mesmas do TurnTrace): erro de observabilidade NUNCA derruba o turno;
// erro do TURNO propaga intacto (engolir mascararia bug real do agente).
import { startActiveObservation, updateActiveTrace } from "@langfuse/tracing";
import { isLangfuseConfigured } from "./env";

export type LangfuseTurnCtx = {
	conversationId: string;
	channel: "web" | "whatsapp";
	isSimulated: boolean;
	persona?: string | null;
	/** web: cookie visitante AJA_UID; whatsapp: `wa:<phone>`. */
	userId?: string | null;
	userText?: string | null;
};

export type LangfuseTurnHandle = {
	traceId: string | null;
	/** Registra a fala final do agente como output do trace (root). */
	setOutput: (text: string) => void;
};

export async function withLangfuseTurn<T>(
	ctx: LangfuseTurnCtx,
	fn: (turn: LangfuseTurnHandle) => Promise<T>,
): Promise<T> {
	const noopHandle: LangfuseTurnHandle = { traceId: null, setOutput: () => {} };
	if (!isLangfuseConfigured()) return fn(noopHandle);

	let fnStarted = false;
	try {
		return await startActiveObservation("turn", async (span: { traceId?: string }) => {
			fnStarted = true;
			try {
				updateActiveTrace({
					// O root span do Next é filtrado no export (shouldExportSpan), então
					// o nome do trace vem daqui.
					name: `turn:${ctx.channel}`,
					sessionId: ctx.conversationId,
					userId: ctx.userId?.trim() || ctx.conversationId,
					tags: [
						`channel:${ctx.channel}`,
						`simulated:${ctx.isSimulated}`,
						...(ctx.persona ? [`persona:${ctx.persona}`] : []),
					],
					input: ctx.userText ?? undefined,
				});
			} catch (err) {
				console.error("[langfuse] updateActiveTrace falhou (ignorado):", err);
			}
			return fn({
				traceId: span.traceId ?? null,
				setOutput: (text) => {
					try {
						updateActiveTrace({ output: text });
					} catch (err) {
						console.error("[langfuse] setOutput falhou (ignorado):", err);
					}
				},
			});
		});
	} catch (err) {
		// fn já rodou? Então o erro é DO TURNO — propaga. Senão foi o SDK na
		// abertura — roda o turno sem trace, uma única vez.
		if (fnStarted) throw err;
		console.error("[langfuse] abertura do trace falhou — turno segue sem trace:", err);
		return fn(noopHandle);
	}
}

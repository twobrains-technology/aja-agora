// Wrapper de turno — abre o trace Langfuse que agrupa TUDO que acontece num
// turno (converse + tool-loop + analyzer + tools), no mesmo padrão do
// withSimulatorClockIfNeeded: o chamador PRECISA consumir o stream inteiro
// dentro do callback, senão os spans filhos saem órfãos do contexto OTel.
//
// Leis (mesmas do TurnTrace): erro de observabilidade NUNCA derruba o turno;
// erro do TURNO propaga intacto (engolir mascararia bug real do agente).
import {
	startActiveObservation,
	updateActiveObservation,
	updateActiveTrace,
} from "@langfuse/tracing";
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

// O gate do funil NÃO entra aqui como tag, e isso foi medido, não estilado: na
// Metrics API do nosso servidor (v3.225.1) a dimensão `tags` agrupa pelo ARRAY
// INTEIRO — `[channel:web, gate:credit]` e `[channel:web, gate:identify]` são
// dois buckets distintos, então somar "turnos no gate credit" fica impossível
// e a cardinalidade explode. Gate é publicado como SCORE
// (`observability/langfuse/funil-scores.ts`), que tem dimensão por valor.
// As tags aqui ficam só com o que é cardinalidade baixa e estável.

export async function withLangfuseTurn<T>(
	ctx: LangfuseTurnCtx,
	fn: (turn: LangfuseTurnHandle) => Promise<T>,
): Promise<T> {
	const noopHandle: LangfuseTurnHandle = {
		traceId: null,
		setOutput: () => {},
	};
	if (!isLangfuseConfigured()) return fn(noopHandle);

	const tagsBase = [
		`channel:${ctx.channel}`,
		`simulated:${ctx.isSimulated}`,
		...(ctx.persona ? [`persona:${ctx.persona}`] : []),
	];

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
					tags: tagsBase,
					input: ctx.userText ?? undefined,
				});
				// A MESMA fala também na OBSERVAÇÃO `turn`, e não é redundância: o
				// juiz LLM gerenciado do servidor v3 roda com `target: "observation"`
				// e lê `input`/`output` da OBSERVAÇÃO. Só no trace, o juiz recebe
				// campo vazio e acaba pontuando o nada. Este span é o único que
				// corresponde a um turno inteiro — as generations abaixo dele são
				// pedaços —, então é nele que a avaliação por turno se ancora.
				updateActiveObservation({ input: ctx.userText ?? undefined });
			} catch (err) {
				console.error("[langfuse] updateActiveTrace falhou (ignorado):", err);
			}
			return fn({
				traceId: span.traceId ?? null,
				setOutput: (text) => {
					try {
						updateActiveTrace({ output: text });
						updateActiveObservation({ output: text });
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

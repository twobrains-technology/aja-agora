// UM BEAT DE FALA NO PI — a substituição do `model.stream()` + ToolNode.
//
// No LangGraph o turno era um nó `converse` com laço manual de tool: streamar o
// modelo, ver se ele pediu tool, executar, devolver o resultado e repetir. No pi
// esse laço é do próprio harness — a sessão chama a tool, recebe o resultado e
// volta sozinha. O que sobra para o produto é o que ele sempre foi dono:
//  · o TEXTO que o cliente lê (deltas, filtrados pelo sanitizer);
//  · o evento `tool-call` que a UI usa para mostrar o que está acontecendo;
//  · a lista de chamadas e resultados, para o turno decidir o que virar card.
import type { MensagemDaConversa } from "@/lib/agent/turn/estado";
import { abrirSessao } from "./sessao";
import type { PiToolDefinition } from "./tools";

export type ChamadaDeTool = { toolCallId: string; nome: string; input: unknown };
export type ResultadoDeTool = { toolCallId: string; nome: string; resultado: unknown };

export type BeatArgs = {
	system: string;
	/** A fala do cliente (ou a directive do servidor) que abre o beat. */
	turnMessage: string;
	historico: readonly MensagemDaConversa[];
	tools: PiToolDefinition[];
	/** Delta de texto já limpo pelo chamador. */
	aoDelta?: (texto: string) => void;
	aoToolCall?: (chamada: ChamadaDeTool) => void;
	aoResultado?: (resultado: ResultadoDeTool) => void;
	/** Injetável para teste — provedor OpenAI-completions falso. */
	provider?: { id: string; baseUrl: string; apiKey: string; model: string };
};

export type BeatResultado = {
	/** Texto que o modelo de fato entregou neste beat (antes do sanitizer final). */
	texto: string;
	chamadas: ChamadaDeTool[];
	resultados: ResultadoDeTool[];
};

export async function executarBeat(args: BeatArgs): Promise<BeatResultado> {
	const { session } = await abrirSessao({
		system: args.system,
		tools: args.tools,
		historico: [...args.historico],
		provider: args.provider,
	});

	let texto = "";
	const chamadas: ChamadaDeTool[] = [];
	const resultados: ResultadoDeTool[] = [];

	session.subscribe((ev: { type: string } & Record<string, unknown>) => {
		if (ev.type === "message_update") {
			const interno = ev.assistantMessageEvent as { type?: string; delta?: string } | undefined;
			if (interno?.type === "text_delta" && interno.delta) {
				texto += interno.delta;
				args.aoDelta?.(interno.delta);
			}
			return;
		}
		if (ev.type === "tool_execution_start") {
			const chamada = {
				toolCallId: String(ev.toolCallId ?? crypto.randomUUID()),
				nome: String(ev.toolName ?? ""),
				input: ev.args,
			};
			chamadas.push(chamada);
			args.aoToolCall?.(chamada);
			return;
		}
		if (ev.type === "tool_execution_end") {
			const resultado = {
				toolCallId: String(ev.toolCallId ?? ""),
				nome: String(ev.toolName ?? ""),
				resultado: ev.result,
			};
			resultados.push(resultado);
			args.aoResultado?.(resultado);
		}
	});

	await session.prompt(args.turnMessage);
	return { texto, chamadas, resultados };
}

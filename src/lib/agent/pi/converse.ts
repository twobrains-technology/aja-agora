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
import { registrarFalhaDoLlm } from "@/lib/llm/alerta-do-llm";
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
	/** Tokens consumidos neste beat (o livro-caixa local de custo). */
	uso: { input: number; output: number };
};

/** O pi entrega a falha do provedor como TEXTO (`"<status>: <corpo>"`, formato
 *  de `formatProviderError` do pacote). A classificação da borda lê status HTTP
 *  e texto, então o status é reconstruído aqui — sem ele, um 429 sem a palavra
 *  "rate limit" no corpo passaria como falha genérica. */
function erroDoProvedor(errorMessage: string): Error & { statusCode?: number } {
	const erro = new Error(errorMessage) as Error & { statusCode?: number };
	const status = /^(\d{3}):\s/.exec(errorMessage);
	if (status) erro.statusCode = Number(status[1]);
	return erro;
}

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
		// FALHA SILENCIOSA DO PROVEDOR É O PIOR DEFEITO DESTE TURNO: o pi engole o
		// erro num `message_end` com `stopReason: "error"`, o texto sai vazio e o
		// cliente recebe o fallback "me perdi" sem que nada apareça no log. Já
		// custou um smoke inteiro em 19/10. Aqui o erro é GRITADO.
		if (ev.type === "message_end") {
			const msg = ev.message as { stopReason?: string; errorMessage?: string } | undefined;
			if (msg?.stopReason === "error") {
				const mensagem = msg.errorMessage ?? "sem mensagem";
				console.error(`[pi] provedor falhou: ${mensagem}`);
				// O ALERTA OPERACIONAL, como na main (`chat/route.ts` → `onErrorDoStream`):
				// log estruturado sempre e, na falha de billing, e-mail + ocorrência no
				// Cortex com dedupe de 1 h. Não bloqueia o beat — o cliente recebe o
				// fallback do canal de qualquer jeito, e alerta não derruba turno.
				void registrarFalhaDoLlm(erroDoProvedor(mensagem), { origem: "pi/beat" });
			}
		}
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

	// Uso da sessão: é o único lugar que sabe quantos tokens o turno gastou.
	let uso = { input: 0, output: 0 };
	try {
		const stats = session.getSessionStats();
		uso = { input: stats.tokens?.input ?? 0, output: stats.tokens?.output ?? 0 };
	} catch {
		// observabilidade nunca custa o turno
	}

	return { texto, chamadas, resultados, uso };
}

// AS TOOLS DE NEGÓCIO, NO FORMATO DO PI.
//
// As tools vivem em `tools/ai-sdk.ts` (objetos do pacote `ai`) e NÃO mudam: o
// mesmo `execute` que fala com a Bevi e com o banco é o que roda aqui. Este
// módulo só as apresenta ao pi, do mesmo jeito que `tool-adapter.ts` fazia com o
// LangChain — sem reescrever nenhuma regra de negócio.
//
// Duas decisões que vieram do runtime anterior e continuam valendo:
//  · o log estruturado de tool I/O (`tool-io-log.ts`) fica AQUI, porque este é o
//    único ponto por onde toda tool passa. Era o substituto do span do Langfuse;
//    agora é a observabilidade inteira.
//  · o schema vai como JSON Schema (`z.toJSONSchema`) — o pi recebe o schema
//    estrutural, e o zod continua validando o que o modelo mandou.

import type { Tool as AiSdkTool } from "ai";
import { z } from "zod";
import { logToolError, logToolIO } from "@/lib/agent/orchestrator/tool-io-log";

/** O que o pi espera de uma tool registrada por `registerTool`. */
export type PiToolDefinition = {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
	) => Promise<{
		content: Array<{ type: "text"; text: string }>;
		details: Record<string, unknown>;
	}>;
};

/** Resultado de tool → texto pro modelo. Tools devolvem objeto; o modelo lê JSON. */
function comoTexto(resultado: unknown): string {
	if (resultado === undefined || resultado === null) return "ok";
	if (typeof resultado === "string") return resultado;
	try {
		return JSON.stringify(resultado);
	} catch {
		return String(resultado);
	}
}

/** Embrulha 1 tool AI-SDK no formato do pi. O `execute` original é chamado
 * tal-e-qual — nenhuma tool é reimplementada aqui. */
export function toPiTool(
	name: string,
	aiSdkTool: AiSdkTool,
	opts?: { conversationId?: string },
): PiToolDefinition {
	const execute = aiSdkTool.execute;
	if (!execute) {
		throw new Error(`[pi/tools] tool "${name}" não tem execute — não pode ser registrada.`);
	}

	let parameters: unknown;
	try {
		// zod v4 → JSON Schema. O schema continua sendo validado pelo zod no
		// `execute`; aqui ele só descreve a tool pro modelo.
		parameters = z.toJSONSchema(aiSdkTool.inputSchema as z.ZodType, { io: "input" });
	} catch {
		parameters = { type: "object", properties: {} };
	}

	return {
		name,
		label: name,
		description: aiSdkTool.description ?? name,
		parameters,
		execute: async (toolCallId, params) => {
			try {
				// O parse garante que o modelo não passa campo a mais nem tipo errado:
				// o zod é a autoridade, o JSON Schema é só a descrição.
				const entrada = (aiSdkTool.inputSchema as z.ZodType).safeParse(params);
				if (!entrada.success) {
					throw new Error(`parâmetros inválidos: ${entrada.error.message}`);
				}
				const saida = await execute(entrada.data as never, {
					toolCallId,
					messages: [] as never,
				});
				// Lei 5 — observabilidade de tool I/O sem serviço externo.
				logToolIO({
					conversationId: opts?.conversationId ?? "",
					stepNumber: 0,
					toolCalls: [{ toolCallId, toolName: name, input: entrada.data }],
					toolResults: [{ toolCallId, toolName: name, output: saida }],
				});
				return { content: [{ type: "text" as const, text: comoTexto(saida) }], details: {} };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logToolError({
					conversationId: opts?.conversationId ?? "",
					stepNumber: 0,
					error: { toolCallId, toolName: name, input: params, errorText: message },
				});
				// O erro volta pro MODELO como texto, não como exceção: ele precisa
				// saber que a tool falhou para não inventar o resultado. Antes o
				// `Error: Tool "x" not found` virava "problema técnico" na fala.
				return {
					content: [{ type: "text" as const, text: `erro na tool ${name}: ${message}` }],
					details: {},
				};
			}
		},
	};
}

/** Converte o registry inteiro. `so` limita às tools que este beat liga — o pi
 * não tem "bindTools por chamada", então quem decide o conjunto é o chamador. */
export function toPiTools(
	tools: Record<string, AiSdkTool>,
	opts?: { conversationId?: string; so?: readonly string[] },
): PiToolDefinition[] {
	const nomes = opts?.so ? opts.so.filter((n) => n in tools) : Object.keys(tools);
	return nomes.map((nome) => toPiTool(nome, tools[nome], opts));
}

// Adapter AI-SDK-tool → LangChain-tool (FIX-357, fix ALTA-4 do crítico). As
// tools de negócio (`buildConsorcioTools`, tools/ai-sdk.ts) são objetos do
// pacote `ai` (Vercel AI SDK), NÃO LangChain — `ToolNode`
// (`@langchain/langgraph/prebuilt`) espera `DynamicStructuredTool`. Este
// módulo embrulha SEM reescrever nenhuma tool: extrai `inputSchema` (zod) +
// `execute` do objeto AI-SDK e delega pro `execute` ORIGINAL — mesma lógica
// de negócio, mesmo acesso a Bevi/DB, zero duplicação.
import { DynamicStructuredTool } from "@langchain/core/tools";
import { startActiveObservation } from "@langfuse/tracing";
import type { Tool as AiSdkTool } from "ai";
import type { z } from "zod";
import { buildConsorcioTools, type ConsorcioToolsContext } from "@/lib/agent/tools/ai-sdk";

/** `ToolExecutionOptions` mínimo (AI SDK) pra chamar `execute` fora do loop
 * de streaming do SDK — nenhuma das tools de negócio lê `abortSignal`/
 * `experimental_context`, só `toolCallId`/`messages` são obrigatórios no
 * tipo. Um `toolCallId` novo por invocação (rastreável em log), `messages`
 * vazio (nenhuma tool de negócio o lê). */
function fakeToolExecutionOptions(): { toolCallId: string; messages: never[] } {
	return { toolCallId: crypto.randomUUID(), messages: [] };
}

/** Embrulha 1 tool AI-SDK (`{ description, inputSchema, execute }`) numa
 * `DynamicStructuredTool` LangChain. `.invoke(input)` chama o `execute`
 * ORIGINAL — mesma implementação, mesmo `discovery()`/DB por trás. */
export function toLangChainTool(name: string, aiSdkTool: AiSdkTool): DynamicStructuredTool {
	const { execute } = aiSdkTool;
	if (!execute) {
		throw new Error(
			`[tool-adapter] tool "${name}" não tem execute — não pode virar DynamicStructuredTool.`,
		);
	}
	return new DynamicStructuredTool({
		name,
		description: aiSdkTool.description ?? name,
		schema: aiSdkTool.inputSchema as unknown as z.ZodTypeAny,
		// Span Langfuse por invocação — ESTE é o único ponto por onde toda tool
		// de negócio passa (ToolNode do converse E a chamada direta do discovery),
		// então é aqui que input/output de tool entram no trace. Sem provider OTel
		// registrado o span é non-recording: custo zero, nenhuma rede.
		func: async (input) =>
			startActiveObservation(
				name,
				async (span) => {
					span.update({ input });
					try {
						const out = await execute(input as never, fakeToolExecutionOptions());
						span.update({ output: out });
						return out;
					} catch (err) {
						// Sem este catch a tool que estoura sai do trace como span mudo —
						// sem output e sem marca de erro, idêntico a um span truncado. O
						// nível ERROR é o que faz a observação aparecer vermelha na UI e
						// entrar no filtro `level` da Metrics API, que é como "tool
						// falhando em silêncio" vira número em vez de suspeita.
						span.update({
							level: "ERROR",
							statusMessage: err instanceof Error ? err.message : String(err),
						});
						throw err;
					}
				},
				{ asType: "tool" },
			),
	});
}

export type LangGraphToolset = Record<string, DynamicStructuredTool>;

/** `buildConsorcioTools(ctx)` + adapter em cada tool — MESMO registry que o
 * runtime Vercel usa (`ai-sdk.ts:1167`), agora em formato LangChain. Usado
 * tanto pro toolset what-if de `converse` (bindTools) quanto pro nó
 * `discovery` (invoca `search_groups`/`recommend_groups` direto, sem
 * depender de tool-call do modelo). */
export function buildLangGraphTools(ctx: ConsorcioToolsContext): LangGraphToolset {
	const aiSdkTools = buildConsorcioTools(ctx);
	const entries = Object.entries(aiSdkTools).map(
		([name, t]) => [name, toLangChainTool(name, t as AiSdkTool)] as const,
	);
	return Object.fromEntries(entries);
}

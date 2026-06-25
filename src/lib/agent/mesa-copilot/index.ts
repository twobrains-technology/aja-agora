/**
 * Runner do COPILOTO DE MESA — gera a orientação textual para o atendente.
 *
 * Spec: docs/visao/mesa-de-operacao.md §5 + DEC-C. SDK único do projeto:
 * Vercel AI SDK 6 (`streamText`) — NÃO usar @anthropic-ai/sdk direto.
 *
 * Q&A textual one-shot, SEM tool calling (não há ação a executar, só orientar).
 * Os blocos do system prompt entram como mensagens `system` (não `system:`
 * string) pra anexar `cacheControl` ephemeral no bloco STABLE (o manual da
 * administradora) — mesmo padrão de cache do agente principal (builder.ts).
 */
import { createGatewayAnthropic } from "@/lib/llm/gateway-anthropic";
import { type LanguageModel, type ModelMessage, type SystemModelMessage, streamText } from "ai";
import { buildMesaCopilotPrompt, type MesaCopilotCaso } from "./system-prompt";

const anthropic = createGatewayAnthropic();

export interface MesaCopilotTurn {
	role: "attendant" | "assistant";
	content: string;
}

/**
 * Gera a resposta do copiloto para o turno atual.
 *
 * @param caso     Dossiê do caso (administradora + docs + cota + cliente).
 * @param history  Histórico copiloto↔atendente, em ordem cronológica, JÁ
 *                 incluindo a última mensagem do atendente como item final.
 * @param model    Injetável para testes (MockLanguageModelV3). Default: Anthropic.
 * @returns        Texto da orientação, pronto pra enviar por WhatsApp.
 */
export async function generateMesaCopilotReply(input: {
	caso: MesaCopilotCaso;
	history: MesaCopilotTurn[];
	model?: LanguageModel;
}): Promise<string> {
	const { stable, dynamic } = buildMesaCopilotPrompt(input.caso);

	// Os dois blocos vão na opção `system` (não em `messages`) — caminho idiomático
	// da AI SDK 6, idêntico ao `instructions` do ToolLoopAgent (builder.ts). System
	// dentro de `messages` dispara warning de prompt-injection; via `system` não. O
	// cacheControl ephemeral fica no bloco STABLE (o manual), preservando o cache.
	const system: SystemModelMessage[] = [
		{
			role: "system",
			content: stable,
			providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
		},
		{ role: "system", content: dynamic },
	];

	const messages: ModelMessage[] = input.history.map((m) => ({
		role: m.role === "attendant" ? "user" : "assistant",
		content: m.content,
	}));

	const result = streamText({
		model: input.model ?? anthropic(process.env.AI_MODEL ?? "claude-sonnet-4-6"),
		system,
		messages,
		// Orientação operacional: precisão > criatividade.
		temperature: 0.3,
	});

	let text = "";
	for await (const chunk of result.textStream) text += chunk;
	return text.trim();
}

export type { MesaCopilotCaso, MesaCopilotDoc } from "./system-prompt";
export { buildMesaCopilotPrompt } from "./system-prompt";

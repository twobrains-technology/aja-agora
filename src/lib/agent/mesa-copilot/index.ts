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

import { type LanguageModel, type ModelMessage, type SystemModelMessage, streamText } from "ai";
import { createGatewayAnthropic } from "@/lib/llm/gateway-anthropic";
import { buildMesaCopilotPrompt, type MesaCopilotCaso } from "./system-prompt";

const anthropic = createGatewayAnthropic();

export interface MesaCopilotTurn {
	role: "attendant" | "assistant";
	content: string;
}

/**
 * Semente interna do turno que dispara a orientação INICIAL do copiloto no momento em que
 * o atendente assume o caso — antes de ele escrever qualquer coisa. É a fala "do atendente"
 * que pede o passo a passo; NÃO é persistida no histórico (só a resposta do copiloto é). Fala
 * na 1ª pessoa do atendente porque o clique em "Vou atender" já é o gesto dele de começar.
 */
export const MESA_COPILOT_KICKOFF =
	"Acabei de assumir este caso na mesa. Me dá o passo a passo INICIAL pra cadastrar este " +
	"cliente na administradora, com base no manual — começando por onde eu entro no sistema " +
	"da administradora até o primeiro bloco de etapas. Se faltar algum dado do cliente pra " +
	"contratar, me diga o que preciso pedir a ele.";

/**
 * Anthropic exige que a 1ª mensagem da conversa seja do papel `user`. Quando o histórico
 * começa por uma fala do copiloto (ex.: a orientação PROATIVA empurrada no claim, antes de o
 * atendente escrever qualquer coisa), prefixa um turno `user` com o kickoff — em tempo de
 * chamada, sem poluir o histórico persistido. Histórico já iniciando em `user` fica intacto.
 */
export function ensureLeadingUserTurn(messages: ModelMessage[]): ModelMessage[] {
	if (messages.length > 0 && messages[0].role === "user") return messages;
	return [{ role: "user", content: MESA_COPILOT_KICKOFF }, ...messages];
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

	const messages: ModelMessage[] = ensureLeadingUserTurn(
		input.history.map((m) => ({
			role: m.role === "attendant" ? "user" : "assistant",
			content: m.content,
		})),
	);

	const result = streamText({
		model: input.model ?? anthropic(process.env.AI_MODEL ?? "claude-sonnet-5"),
		system,
		messages,
		// FIX-209 — Sonnet 5 liga adaptive thinking por default; desligamos explícito
		// (Q&A operacional não precisa de reasoning e o <3s importa). Também não
		// passamos mais sampling param — Sonnet 5 rejeita valor não-default (400). A
		// precisão operacional (antes um sampling baixo) passa a ser guiada pelo
		// system prompt do copiloto.
		providerOptions: { anthropic: { thinking: { type: "disabled" } } },
	});

	let text = "";
	for await (const chunk of result.textStream) text += chunk;
	return text.trim();
}

/**
 * Gera a orientação INICIAL (proativa) do copiloto no instante em que o atendente ASSUME o
 * caso — sem ele ter perguntado nada ainda (o "empurrão proativo"). Semeia o turno interno
 * (`MESA_COPILOT_KICKOFF`) que NÃO é persistido; só a resposta do copiloto é guardada/enviada
 * pelo caller. Reusa o mesmo builder de prompt (manual da administradora + caso) do Q&A normal.
 */
export async function generateMesaCopilotOpening(input: {
	caso: MesaCopilotCaso;
	model?: LanguageModel;
}): Promise<string> {
	return generateMesaCopilotReply({
		caso: input.caso,
		history: [{ role: "attendant", content: MESA_COPILOT_KICKOFF }],
		model: input.model,
	});
}

export type { MesaCopilotCaso, MesaCopilotDoc } from "./system-prompt";
export { buildMesaCopilotPrompt } from "./system-prompt";

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
import { modeloAiSdkDoGateway, modeloDoAgente } from "@/lib/llm/model-provider";
import { registrarUsoDeIa } from "@/lib/observability/sinais/publicar";
import { buildMesaCopilotPrompt, type MesaCopilotCaso } from "./system-prompt";

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
 * O nome do modelo pra linha de `uso_de_ia`. `LanguageModel` no AI SDK 6 pode ser
 * um id em texto ou um objeto de provider, e só o objeto carrega `modelId`.
 */
function nomeDoModelo(model: LanguageModel): string {
	if (typeof model === "string") return model;
	const modelId = (model as { modelId?: unknown }).modelId;
	return typeof modelId === "string" ? modelId : modeloDoAgente();
}

/**
 * Gera a resposta do copiloto para o turno atual.
 *
 * @param caso     Dossiê do caso (administradora + docs + cota + cliente).
 * @param history  Histórico copiloto↔atendente, em ordem cronológica, JÁ
 *                 incluindo a última mensagem do atendente como item final.
 * @param model    Injetável para testes (MockLanguageModelV3). Default: Anthropic.
 * @param conversationId  Conversa de origem — só pro livro-caixa de `uso_de_ia`.
 * @returns        Texto da orientação, pronto pra enviar por WhatsApp.
 */
export async function generateMesaCopilotReply(input: {
	caso: MesaCopilotCaso;
	history: MesaCopilotTurn[];
	model?: LanguageModel;
	/**
	 * A conversa de origem do caso — só serve pro livro-caixa de `uso_de_ia`: o custo
	 * do copiloto é chamada de LLM em produção e tem que entrar no CPC como as outras
	 * (P314). Opcional de propósito: a consulta avulsa de manual não tem conversa.
	 */
	conversationId?: string | null;
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
			providerOptions: { anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } } },
		},
		{ role: "system", content: dynamic },
	];

	const messages: ModelMessage[] = ensureLeadingUserTurn(
		input.history.map((m) => ({
			role: m.role === "attendant" ? "user" : "assistant",
			content: m.content,
		})),
	);

	const modeloUsado = input.model ?? modeloAiSdkDoGateway(modeloDoAgente());
	const result = streamText({
		// B15: mesma fábrica única do agente. O `?? "claude-sonnet-5"` daqui não
		// caía no default com `AI_MODEL=""` (compose materializa a var vazia).
		model: modeloUsado,
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

	// Livro-caixa local da chamada (P314). `modelId` mantém o nome do modelo certo
	// também quando um modelo injetado é usado. Gravação que falha não derruba a
	// orientação — o atendente já está esperando por ela.
	const uso = await result.usage;
	await registrarUsoDeIa({
		conversationId: input.conversationId ?? null,
		modelo: nomeDoModelo(modeloUsado),
		tokensInput: uso.inputTokens ?? 0,
		tokensOutput: uso.outputTokens ?? 0,
	});

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
	/**
	 * A conversa de origem do caso — mesmo livro-caixa de `uso_de_ia` do Q&A (P314). Sem
	 * isto, a chamada feita no instante em que o atendente assume o caso saía com
	 * `conversation_id` NULL e ficava fora do custo por conversa. Opcional de propósito.
	 */
	conversationId?: string | null;
}): Promise<string> {
	return generateMesaCopilotReply({
		caso: input.caso,
		history: [{ role: "attendant", content: MESA_COPILOT_KICKOFF }],
		model: input.model,
		conversationId: input.conversationId,
	});
}

export type { MesaCopilotCaso, MesaCopilotDoc } from "./system-prompt";
export { buildMesaCopilotPrompt } from "./system-prompt";

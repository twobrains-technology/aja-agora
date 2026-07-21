// Nó `converse` — o modelo FALA. NUNCA responde por texto pré-fabricado
// (lei-mãe "não engessar"): todo texto emitido aqui vem de `model.stream()`,
// sempre. What-if (simulate_quota, get_group_details, get_rates,
// compare_with_financing, check_proposal_status, suggest_handoff,
// save_contact_name, save_contact_whatsapp) continua tool-call discricionário
// do modelo via `ToolNode` — `search_groups`/`recommend_groups` NUNCA entram
// neste toolset (viram nó determinístico, `discovery.ts`).
//
// Sanitização reusa `EphemeralTextFilter` (sanitizer.ts) — MESMA máquina de
// compliance (I4/I5/D7) do runtime Vercel, alimentada token a token.
import type { AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { EphemeralTextFilter } from "@/lib/agent/orchestrator/sanitizer";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { cacheableSystemBlock } from "../provider";
import type { AgentGraphStateType } from "../state";
import { buildLangGraphTools } from "../tool-adapter";

/** Toolset WHAT-IF (goal doc — fix ALTA-4): o modelo escolhe livremente
 * chamar OU não. `search_groups`/`recommend_groups` ficam FORA de propósito
 * — são o nó `discovery`, nunca discricionárias (resolve a "tool sumida"
 * estruturalmente, crítico ALTA-2). */
const WHAT_IF_TOOL_NAMES = [
	"simulate_quota",
	"get_group_details",
	"get_rates",
	"compare_with_financing",
	"check_proposal_status",
	"suggest_handoff",
	"save_contact_name",
	"save_contact_whatsapp",
] as const;

const MAX_TOOL_LOOP_ITERATIONS = 4;

/** `SYSTEM_PROMPT` (system-prompt.ts) MENOS a seção "## Fluxo de Vendas
 * (siga esta ordem)" — o grafo é a ordem agora (elimina o drift
 * prompt×código, fix MÉDIA do crítico). Reusa a MESMA fonte de compliance
 * (tom, regras de ouro, dados financeiros, what-if, o que não fazer) sem
 * duplicar o texto. TODO(rodada-1): `buildSpecialistPrompt`/
 * `buildConciergePrompt` completos (exemplos por persona, injeção de
 * identidade da persona DB) — esta fundação usa o prompt base genérico.
 */
export function leanSystemPrompt(): string {
	const flowHeading = "## Fluxo de Vendas";
	const nextHeading = "## Regras de Ouro";
	const flowStart = SYSTEM_PROMPT.indexOf(flowHeading);
	const nextStart = SYSTEM_PROMPT.indexOf(nextHeading);
	if (flowStart === -1 || nextStart === -1) return SYSTEM_PROMPT;
	const before = SYSTEM_PROMPT.slice(0, flowStart);
	const after = SYSTEM_PROMPT.slice(nextStart);
	return `${before}${after}

## Ordem do funil
A ordem de coleta (nome → objetivo → valor do bem → identidade → busca →
recomendação) é decidida pelo SISTEMA (grafo de estado), não por você — nunca
tente "pular etapas" sozinho nem anuncie a mecânica pro usuário. Fale
livremente sobre o que ele trouxer; quando o sistema decidir que é hora de um
próximo passo estruturado, ele te avisa (ferramenta liberada ou card na
tela).`;
}

function toBaseMessage(m: { role: "user" | "assistant"; content: string }): BaseMessage {
	return m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content);
}

export function createConverseNode(model: BaseChatModel) {
	return async function converseNode(
		state: AgentGraphStateType,
		config: LangGraphRunnableConfig,
	): Promise<Partial<AgentGraphStateType>> {
		const tools = buildLangGraphTools({
			conversationId: state.conversationId,
			channel: state.channel,
		});
		const whatIfTools = WHAT_IF_TOOL_NAMES.map((name) => tools[name]).filter(
			(t): t is NonNullable<typeof t> => Boolean(t),
		);
		const boundModel = model.bindTools ? model.bindTools(whatIfTools) : model;
		const toolNode = new ToolNode(whatIfTools);

		const systemMessage = new SystemMessage({
			content: [cacheableSystemBlock(leanSystemPrompt())],
		});

		const newMessages: BaseMessage[] = state.isUserTurn ? [new HumanMessage(state.userText)] : [];
		let loopMessages: BaseMessage[] = [systemMessage, ...state.messages, ...newMessages];

		const filter = new EphemeralTextFilter();
		const events: TurnEvent[] = [];

		for (let i = 0; i < MAX_TOOL_LOOP_ITERATIONS; i++) {
			const stream = await boundModel.stream(loopMessages);
			let merged: AIMessageChunk | undefined;
			for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
				merged = merged ? merged.concat(chunk) : chunk;
				const delta = typeof chunk.content === "string" ? chunk.content : "";
				if (!delta) continue;
				const clean = filter.push(delta);
				if (clean) {
					const ev: TurnEvent = { type: "text-delta", text: clean };
					config.writer?.(ev);
					events.push(ev);
				}
			}
			if (!merged) break;
			const aiMessage = new AIMessage({ content: merged.content, tool_calls: merged.tool_calls });
			loopMessages = [...loopMessages, aiMessage];
			newMessages.push(aiMessage);

			if (!aiMessage.tool_calls || aiMessage.tool_calls.length === 0) break;

			for (const call of aiMessage.tool_calls) {
				const ev: TurnEvent = {
					type: "tool-call",
					toolName: call.name,
					input: call.args,
					toolCallId: call.id ?? crypto.randomUUID(),
				};
				config.writer?.(ev);
				events.push(ev);
			}
			// ToolNode NUNCA lança em tool desconhecida — devolve ToolMessage de
			// erro (status "error"). É a garantia estrutural de "0 NoSuchToolError"
			// desta fundação (crítico ALTA-2): o toolset what-if é fechado e
			// pequeno, mas mesmo uma alucinação de nome de tool não derruba o turno.
			const { messages: toolMessages } = await toolNode.invoke({ messages: [aiMessage] });
			loopMessages = [...loopMessages, ...toolMessages];
			newMessages.push(...toolMessages);
		}

		const tail = filter.flush();
		if (tail) {
			const ev: TurnEvent = { type: "text-delta", text: tail };
			config.writer?.(ev);
			events.push(ev);
		}

		return { messages: newMessages, events };
	};
}

export { toBaseMessage };

import { runTurnLangGraph } from "@/lib/agent/langgraph/run-turn";
import { getOrCreateConversation } from "@/lib/whatsapp/session";
import type { TurnEvent, TurnInput } from "./types";

export type { TurnEvent, TurnInput } from "./types";

/** Ponto de entrada único do turno — web e WhatsApp consomem por aqui.
 * LangGraph é o ÚNICO runtime (o runtime Vercel AI SDK foi removido por
 * completo; a campanha `.processo/loop/2026-07-20-1948-langgraph-runtime.md`
 * encerrou com o LangGraph substituindo o antigo motor). */
export async function* runTurn(input: TurnInput): AsyncGenerator<TurnEvent> {
	yield* runTurnLangGraph(input);
}

export async function runTurnFromText(args: {
	channel: TurnInput["channel"];
	from?: string;
	conversationId?: string;
	userText: string;
	isUserTurn: boolean;
	contactName?: string | null;
	skipAnalyzer?: boolean;
	skipLeadCollection?: boolean;
}): Promise<TurnInput> {
	const { from, conversationId, channel, ...rest } = args;
	if (conversationId) {
		return { ...rest, conversationId, channel };
	}
	if (channel === "whatsapp" && from) {
		const { id } = await getOrCreateConversation(from);
		return { ...rest, conversationId: id, channel };
	}
	throw new Error("[orchestrator] either conversationId or (channel=whatsapp + from) required");
}

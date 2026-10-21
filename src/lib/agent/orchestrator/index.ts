import { runTurnLivre } from "@/lib/agent/pi/turno-livre";
import { getOrCreateConversation } from "@/lib/whatsapp/session";
import type { TurnEvent, TurnInput } from "./types";

export type { TurnEvent, TurnInput } from "./types";

/** O motor livre é o único motor. A flag fica como registro histórico do corte;
 * o turno não tem mais caminho alternativo. */
export const AGENTE_LIVRE_ATIVO = true;

/** Ponto de entrada único do turno — web, WhatsApp e os workers consomem por aqui.
 *
 * O motor é o VENDEDOR LIVRE (campanha 2026-10-20): um prompt, duas skills da
 * Bevi e três tools. Não existe gate, fila de perguntas nem card escolhido pelo
 * modelo — quem conduz a venda é o modelo, e o código só garante fato
 * (identidade cifrada, carta real, proposta real) e persistência.
 *
 * O LangGraph saiu em 19/10; o funil dirigido por código saiu em 20/10. */
export async function* runTurn(input: TurnInput): AsyncGenerator<TurnEvent> {
	yield* runTurnLivre(input);
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
		const { id } = await getOrCreateConversation(from, undefined, args.userText);
		return { ...rest, conversationId: id, channel };
	}
	throw new Error("[orchestrator] either conversationId or (channel=whatsapp + from) required");
}

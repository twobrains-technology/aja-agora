import { runTurnPi } from "@/lib/agent/pi/turno";
import { runTurnLivre } from "@/lib/agent/pi/turno-livre";
import { getOrCreateConversation } from "@/lib/whatsapp/session";
import type { TurnEvent, TurnInput } from "./types";

export type { TurnEvent, TurnInput } from "./types";

/** O motor livre está ligado? (flag de ambiente — desligar é remover a variável) */
export const AGENTE_LIVRE_ATIVO =
	process.env.AGENTE_LIVRE === "1" || process.env.AGENTE_LIVRE === "true";

/** Ponto de entrada único do turno — web, WhatsApp e os workers consomem por aqui.
 *
 * O motor é o PI (campanha 2026-10-19): o turno é `capture → analyze → route →
 * advance → discovery → fala → emit-card → persist`, conduzido por
 * `src/lib/agent/pi/turno.ts`. O LangGraph saiu por inteiro — o produto não tem
 * mais runtime de framework de agente, só o harness do pi. */
export async function* runTurn(input: TurnInput): AsyncGenerator<TurnEvent> {
	// O MOTOR LIVRE (2026-10-20): um prompt de vendedor + duas skills + três tools.
	// Entra por variável de ambiente para o motor antigo continuar de pé até o
	// corte final (B3) — desligar é remover a variável, não reverter commit.
	if (AGENTE_LIVRE_ATIVO) {
		yield* runTurnLivre(input);
		return;
	}
	yield* runTurnPi(input);
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

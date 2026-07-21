// FIX-46 — retomada de contexto no MESMO dispositivo.
// Acha "a conversa deste cookie" (web, ativa, não handed-off) pra reidratar o
// chat exatamente onde o usuário parou. O cookie `aja_uid` (HttpOnly, 90d) já
// prova posse do device — não exige verificação (same-device é seguro).
//
// Regra de ouro (F2): cookie ausente OU sem conversa anterior → null → fluxo de
// PRIMEIRA VEZ idêntico ao de hoje. Zero atrito.

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";
import { gatePartData } from "@/lib/web/adapter";
import type { GatePartData } from "@/lib/chat/ui-message";

export interface ResumableMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	/** Card ligado a esta mensagem — reidratado como componente, não como texto. */
	artifact?: { type: string; payload: unknown };
}

export interface ResumableConversation {
	conversationId: string;
	messages: ResumableMessage[];
	/** FIX-51: metadados leves pro popup decidir/rotular (sem vazar dado sensível). */
	messageCount: number;
	/** Card do gate que o funil aguarda AGORA (derivado do estado, não do
	 * histórico) — sem isto a retomada volta muda, sem componente de input. */
	gate: GatePartData | null;
	lastActivityAt: string;
	/** Server-derived: a conversa tem progresso real (acima do limiar)? Decide se
	 * o popup "voltar/nova" aparece — abaixo do limiar hidrata direto (zero ruído). */
	meaningfulProgress: boolean;
}

/** FIX-51 — limiar de mensagens pro popup de retomada (≈2 trocas reais). Abaixo
 * disso, sem sinal de raia, a conversa é "1 fala" → hidrata sem perguntar. */
export const RESUME_MIN_MESSAGES = 4;

/** FIX-51 — a conversa tem progresso significativo pra justificar o popup? Pura
 * (testável sem DB). ADR Decisão 1: contagem de mensagens OU sinal de raia
 * (passou da qualificação / reveal / fechamento). */
export function hasMeaningfulProgress(
	messageCount: number,
	meta:
		| { revealCompleted?: boolean; maxStageReached?: string; contractClosed?: boolean }
		| null
		| undefined,
): boolean {
	if (messageCount >= RESUME_MIN_MESSAGES) return true;
	if (!meta) return false;
	if (meta.revealCompleted === true) return true;
	if (meta.contractClosed === true) return true;
	if (meta.maxStageReached === "qualificado") return true;
	return false;
}

/**
 * Última conversa web ativa vinculada ao cookie. `null` quando não há cookie
 * ou nenhuma conversa retomável (primeira vez). Sem cache (caller marca no-store).
 */
export async function getResumableConversation(
	cookieValue: string | null | undefined,
): Promise<ResumableConversation | null> {
	if (!cookieValue) return null;

	const conv = await db.query.conversations.findFirst({
		where: and(
			eq(conversations.channel, "web"),
			ne(conversations.status, "handed_off"),
			sql`${conversations.metadata} ->> 'webCookie' = ${cookieValue}`,
		),
		orderBy: [desc(conversations.updatedAt)],
		with: {
			messages: {
				orderBy: (m, { asc }) => [asc(m.createdAt)],
				// Os CARDS precisam voltar junto. Sem isto, ao dar refresh/voltar, o
				// que reaparecia era a linha marcadora crua ("[card: contemplation_dial]")
				// como se fosse fala do agente, e o componente sumia da tela.
				with: { artifacts: true },
			},
		},
	});

	if (!conv) return null;

	const messages: ResumableMessage[] = conv.messages
		.filter((m) => m.role !== "system" && m.content.length > 0)
		.map((m) => {
			const artifact = m.artifacts?.[0];
			return {
				id: m.id,
				role: m.role as "user" | "assistant",
				// Mensagem que é SÓ o marcador de card não tem texto pro cliente — o
				// texto dela é o próprio card.
				// Marcador interno NUNCA vira texto na tela — com ou sem artifact
				// ligado. Sem artifact simplesmente não há o que mostrar.
				content: /^\[card: .+\]$/.test(m.content.trim()) ? "" : m.content,
				...(artifact
					? { artifact: { type: artifact.type as string, payload: artifact.payload } }
					: {}),
			};
		});

	const visiveis = messages.filter((m) => m.content.length > 0 || m.artifact);

	// Conversa existe mas sem mensagens úteis → trata como primeira vez (nada a
	// reidratar), evita "ressuscitar" uma conversa vazia.
	if (visiveis.length === 0) return null;

	// FIX-51: metadados leves pro popup decidir (limiar) e rotular (recência).
	const meta = (conv.metadata ?? {}) as {
		revealCompleted?: boolean;
		maxStageReached?: string;
		contractClosed?: boolean;
	};
	// O CARD DO GATE PENDENTE volta na retomada. Cards de input (valor, CPF,
	// chips) não são artifacts persistidos — só os de dado —, então ao reabrir o
	// agente repetia a pergunta e nenhum componente aparecia. O gate é derivado
	// do estado, não do histórico: recalcula e devolve montado.
	const metaCompleta = (conv.metadata ?? {}) as ConversationMetadata;
	const gatePendente = nextGate(metaCompleta, { hasContactName: Boolean(conv.contactName) });
	const gate = gatePartData(gatePendente, metaCompleta);

	return {
		conversationId: conv.id,
		messages: visiveis,
		gate,
		messageCount: visiveis.length,
		lastActivityAt: (conv.updatedAt ?? conv.createdAt ?? new Date()).toISOString(),
		meaningfulProgress: hasMeaningfulProgress(messages.length, meta),
	};
}

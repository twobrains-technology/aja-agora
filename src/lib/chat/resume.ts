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

export interface ResumableMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
}

export interface ResumableConversation {
	conversationId: string;
	messages: ResumableMessage[];
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
			},
		},
	});

	if (!conv) return null;

	const messages: ResumableMessage[] = conv.messages
		.filter((m) => m.role !== "system" && m.content.length > 0)
		.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }));

	// Conversa existe mas sem mensagens úteis → trata como primeira vez (nada a
	// reidratar), evita "ressuscitar" uma conversa vazia.
	if (messages.length === 0) return null;

	return { conversationId: conv.id, messages };
}

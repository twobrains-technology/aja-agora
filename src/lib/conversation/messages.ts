import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messages as messagesTable } from "@/db/schema";
import { simulatorNow } from "@/lib/utils/simulator-clock";

export type Channel = "web" | "whatsapp";

export async function loadConversationHistory(
	conversationId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
	const msgs = await db.query.messages.findMany({
		where: eq(messagesTable.conversationId, conversationId),
		orderBy: (m, { asc }) => [asc(m.createdAt)],
	});

	return msgs
		.filter((m) => m.role !== "system" && m.content.length > 0)
		.map((m) => ({
			role: m.role as "user" | "assistant",
			content: m.content,
		}));
}

/** A última fala do assistente nesta conversa — a pergunta que o usuário está
 * respondendo agora. Leitura barata (1 linha, index por conversa + ordem
 * decrescente) usada para ANCORAR o classificador de turno: sem ela, uma
 * resposta curta ("não", "uns 70 mil") é ambígua e acaba gravada no campo
 * errado. Ignora as mensagens marcadoras de card (`[card: tipo]`), que não são
 * fala. */
export async function loadLastAssistantText(conversationId: string): Promise<string | null> {
	const rows = await db.query.messages.findMany({
		where: eq(messagesTable.conversationId, conversationId),
		orderBy: (m, { desc }) => [desc(m.createdAt)],
		limit: 6,
	});
	for (const m of rows) {
		if (m.role !== "assistant") continue;
		const content = m.content?.trim() ?? "";
		if (!content || /^\[card:/i.test(content)) continue;
		return content;
	}
	return null;
}

export async function saveMessage(
	conversationId: string,
	role: "user" | "assistant",
	content: string,
	channel: Channel,
	personaId?: string | null,
): Promise<string> {
	const [msg] = await db
		.insert(messagesTable)
		.values({
			conversationId,
			role,
			content,
			channel,
			personaId: personaId ?? null,
			createdAt: simulatorNow(),
		})
		.returning({ id: messagesTable.id });

	return msg.id;
}

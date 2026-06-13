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

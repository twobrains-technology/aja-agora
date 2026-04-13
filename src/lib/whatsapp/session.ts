/**
 * WhatsApp session management.
 * Maps phone numbers (wa_id) to conversations in the database.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages as messagesTable } from "@/db/schema";

/**
 * Get or create a conversation for a WhatsApp phone number.
 * Returns the conversation ID.
 */
export async function getOrCreateConversation(waId: string): Promise<{ id: string; isNew: boolean }> {
	// Look up existing conversation by wa_id
	const existing = await db.query.conversations.findFirst({
		where: eq(conversations.waId, waId),
	});

	if (existing) return { id: existing.id, isNew: false };

	// Create new conversation for this phone number
	const [conv] = await db
		.insert(conversations)
		.values({ waId, channel: "whatsapp" })
		.returning();

	console.log(`[whatsapp-session] New conversation ${conv.id} for wa_id ${waId}`);
	return { id: conv.id, isNew: true };
}

/**
 * Load conversation history for the AI pipeline.
 * Returns messages in the format expected by streamText.
 */
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

/**
 * Save a message to the database.
 */
export async function saveMessage(
	conversationId: string,
	role: "user" | "assistant",
	content: string,
): Promise<string> {
	const [msg] = await db
		.insert(messagesTable)
		.values({
			conversationId,
			role,
			content,
			channel: "whatsapp",
		})
		.returning({ id: messagesTable.id });

	return msg.id;
}

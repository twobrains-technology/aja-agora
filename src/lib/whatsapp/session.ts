import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import {
	loadConversationHistory,
	saveMessage as saveMessageWithChannel,
} from "@/lib/conversation/messages";

export { loadConversationHistory };

export async function getOrCreateConversation(
	waId: string,
): Promise<{ id: string; isNew: boolean }> {
	const existing = await db.query.conversations.findFirst({
		where: eq(conversations.waId, waId),
	});

	if (existing) return { id: existing.id, isNew: false };

	const [conv] = await db.insert(conversations).values({ waId, channel: "whatsapp" }).returning();

	console.log(`[whatsapp-session] New conversation ${conv.id} for wa_id ${waId}`);
	return { id: conv.id, isNew: true };
}

export async function saveMessage(
	conversationId: string,
	role: "user" | "assistant",
	content: string,
	personaId?: string | null,
): Promise<string> {
	return saveMessageWithChannel(conversationId, role, content, "whatsapp", personaId);
}

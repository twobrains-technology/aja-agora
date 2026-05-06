import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

export function metaOf(conv: { metadata: unknown } | null | undefined): ConversationMetadata {
	return (conv?.metadata ?? {}) as ConversationMetadata;
}

export async function persistMeta(
	conversationId: string,
	meta: ConversationMetadata,
): Promise<void> {
	await db
		.update(conversations)
		.set({ metadata: meta, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));
}

export async function reloadMeta(conversationId: string): Promise<ConversationMetadata> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	return metaOf(conv);
}

export async function loadConversationWithMeta(conversationId: string): Promise<{
	conv: Awaited<ReturnType<typeof db.query.conversations.findFirst>>;
	meta: ConversationMetadata;
}> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	return { conv, meta: metaOf(conv) };
}

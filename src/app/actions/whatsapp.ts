"use server";

import { eq } from "drizzle-orm";
import { globalDb } from "@/db";
import { conversations } from "@/db/schema";

/**
 * Atualiza lastInboundAt para a conversa do cliente.
 *
 * Esta função é chamada pelo webhook quando o cliente envia uma mensagem.
 * A atualização abre/reabre a janela de 24h da Meta Cloud API, permitindo
 * texto livre temporário.
 *
 * @param from — phone_number_id do WhatsApp (ex.: 5562999998888)
 * @param messageId — ID da mensagem recebida do Meta
 */
export async function updateLastInboundAt(from: string, _messageId: string) {
	const db = globalDb;
	if (!db) {
		console.warn("[whatsapp] globalDb not available in updateLastInboundAt");
		return;
	}

	try {
		// Busca a conversa por phone_number_id
		const [conversation] = await db
			.select()
			.from(conversations)
			.where(eq(conversations.waId, from))
			.limit(1);

		if (!conversation) {
			console.log(`[whatsapp] No conversation found for phone ${from}`);
			return;
		}

		// Atualiza lastInboundAt
		await db
			.update(conversations)
			.set({
				lastInboundAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(conversations.id, conversation.id))
			.execute();

		console.log(
			`[whatsapp] Updated lastInboundAt for conversation ${conversation.id} (phone: ${from})`,
		);
	} catch (err) {
		console.error("[whatsapp] Error updating lastInboundAt:", err);
	}
}

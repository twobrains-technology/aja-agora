import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { processWithOrchestrator } from "./adapter";
import { sendTextMessage, sendTypingIndicator } from "./api";
import { dispatchInteractiveReply } from "./interactive-handlers";
import {
	getHandoffState,
	handleAgentMessage,
	handlePendingHandoffText,
	isAttendantPhone,
	relayUserToAgent,
} from "./proxy";

export async function processTextMessage(
	from: string,
	text: string,
	contactName?: string,
	messageId?: string,
): Promise<void> {
	try {
		if (text.trim().toLowerCase() === "/reset") {
			const conv = await db.query.conversations.findFirst({
				where: eq(conversations.waId, from),
			});
			if (conv) {
				await db.delete(conversations).where(eq(conversations.id, conv.id));
			}
			await sendTextMessage(from, "🔄 Conversa resetada. Manda um oi pra começar de novo!");
			console.log(`[whatsapp-processor] Reset conversation for ${from}`);
			return;
		}

		if (await isAttendantPhone(from)) {
			const handled = await handleAgentMessage(from, text);
			if (!handled) {
				await sendTextMessage(
					from,
					"⏳ Nenhuma conversa ativa no momento. Quando um cliente demonstrar interesse, você receberá o resumo aqui.",
				);
			}
			return;
		}

		const handoff = await getHandoffState(from);
		if (handoff?.isHandedOff) {
			// Relay to human — don't fake AI typing.
			await relayUserToAgent(from, text);
			return;
		}

		if (await handlePendingHandoffText(from, text, contactName)) return;

		if (messageId) sendTypingIndicator(messageId).catch(() => {});
		await processWithOrchestrator(from, text, contactName);
	} catch (err) {
		console.error(`[whatsapp-processor] Error processing message from ${from}:`, err);
		try {
			await sendTextMessage(
				from,
				"Desculpe, tive um problema processando sua mensagem. Pode tentar novamente?",
			);
		} catch {
			// Silent
		}
	}
}

export async function processInteractiveReply(
	from: string,
	replyId: string,
	replyTitle: string,
	contactName?: string,
	messageId?: string,
): Promise<void> {
	// Most interactive paths trigger an AI directive (gates, transitions, group
	// selection). Fire the typing indicator up front; brief flash on the few
	// non-AI paths (e.g. handoff_decline) is acceptable.
	if (messageId) sendTypingIndicator(messageId).catch(() => {});
	const handled = await dispatchInteractiveReply({
		from,
		replyId,
		replyTitle,
		contactName,
		processTextMessage,
	});
	if (!handled) {
		await processTextMessage(from, replyTitle, contactName, messageId);
	}
}

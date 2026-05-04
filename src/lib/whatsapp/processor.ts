import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { sendTextMessage } from "./api";
import { dispatchInteractiveReply } from "./interactive-handlers";
import { processWithAI } from "./pipeline";
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
			await relayUserToAgent(from, text);
			return;
		}

		if (await handlePendingHandoffText(from, text, contactName)) return;

		await processWithAI(from, text, contactName);
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
): Promise<void> {
	const handled = await dispatchInteractiveReply({
		from,
		replyId,
		replyTitle,
		contactName,
		processTextMessage,
	});
	if (!handled) {
		await processTextMessage(from, replyTitle, contactName);
	}
}

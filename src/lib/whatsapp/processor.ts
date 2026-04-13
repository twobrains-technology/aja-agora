/**
 * WhatsApp message processor.
 * Routes incoming WhatsApp messages through the same AI pipeline
 * as the web chat (streamText + consorcioTools), then sends responses
 * back via WhatsApp Cloud API with native interactive components.
 */
import { streamText, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { consorcioTools, PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { WHATSAPP_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { getOrCreateConversation, loadConversationHistory, saveMessage } from "./session";
import { sendTextMessage } from "./api";
import {
	formatTextForWhatsApp,
	splitMessage,
	artifactToWhatsApp,
} from "./formatter";

const anthropic = createAnthropic();

/**
 * Process an incoming WhatsApp text message.
 * Non-blocking — designed to be called after returning 200 to Meta.
 */
export async function processTextMessage(
	from: string,
	text: string,
): Promise<void> {
	try {
		// 1. Get or create conversation
		const conversationId = await getOrCreateConversation(from);

		// 2. Save user message
		await saveMessage(conversationId, "user", text);

		// 3. Load conversation history
		const history = await loadConversationHistory(conversationId);

		// 4. Run AI pipeline (same as web chat)
		let fullResponse = "";
		const artifacts: Array<{ type: string; payload: Record<string, unknown> }> = [];

		const result = streamText({
			model: anthropic(process.env.AI_MODEL ?? "claude-sonnet-4-20250514"),
			system: WHATSAPP_SYSTEM_PROMPT,
			messages: history,
			tools: consorcioTools,
			stopWhen: stepCountIs(10),
		});

		for await (const part of result.fullStream) {
			switch (part.type) {
				case "text-delta":
					fullResponse += part.text;
					break;
				case "tool-call": {
					const shortName = part.toolName.replace("present_", "");
					if (PRESENTATION_TOOLS.has(part.toolName)) {
						artifacts.push({
							type: shortName,
							payload: part.input as Record<string, unknown>,
						});
					}
					break;
				}
			}
		}

		// 5. Save assistant response
		if (fullResponse) {
			await saveMessage(conversationId, "assistant", fullResponse);
		}

		// 6. Send text response(s) via WhatsApp
		if (fullResponse) {
			const formatted = formatTextForWhatsApp(fullResponse);
			const chunks = splitMessage(formatted);
			for (const chunk of chunks) {
				await sendTextMessage(from, chunk);
			}
		}

		// 7. Send artifact interactive messages
		for (const artifact of artifacts) {
			const waResponse = artifactToWhatsApp(artifact.type, artifact.payload);
			if (!waResponse) continue;

			if (waResponse.type === "text" && waResponse.text) {
				await sendTextMessage(from, waResponse.text);
			} else if (waResponse.type === "interactive" && waResponse.interactive) {
				// Send interactive message directly via API
				const { accessToken, phoneNumberId } = getWhatsAppConfig();
				const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
				await fetch(url, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						messaging_product: "whatsapp",
						to: from,
						type: "interactive",
						interactive: waResponse.interactive,
					}),
				});
			}
		}

		console.log(
			`[whatsapp-processor] Processed message from ${from}: ${artifacts.length} artifacts, ${fullResponse.length} chars`,
		);
	} catch (err) {
		console.error(`[whatsapp-processor] Error processing message from ${from}:`, err);
		// Try to send error message to user
		try {
			await sendTextMessage(from, "Desculpe, tive um problema processando sua mensagem. Pode tentar novamente?");
		} catch {
			// Silent — don't compound errors
		}
	}
}

/**
 * Process an interactive reply (button click, list selection).
 * Extracts the reply ID and sends it as a user message to the AI.
 */
export async function processInteractiveReply(
	from: string,
	replyId: string,
	replyTitle: string,
): Promise<void> {
	// Route interactive replies as text messages to the AI
	// The AI will interpret the context from the reply title
	await processTextMessage(from, replyTitle);
}

function getWhatsAppConfig() {
	const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
	const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
	if (!accessToken || !phoneNumberId) {
		throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID required");
	}
	return { accessToken, phoneNumberId };
}

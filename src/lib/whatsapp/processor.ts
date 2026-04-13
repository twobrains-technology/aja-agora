/**
 * WhatsApp message processor.
 * Routes incoming WhatsApp messages through the AI pipeline or
 * the bidirectional proxy (when conversation is handed off to agent).
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
import {
	getHandoffState,
	relayUserToAgent,
	relayAgentToUser,
	handoffToAgent,
} from "./proxy";

const anthropic = createAnthropic();

/**
 * Process an incoming WhatsApp text message.
 * Checks handoff state first — if handed off, relays instead of AI.
 */
export async function processTextMessage(
	from: string,
	text: string,
	contactName?: string,
): Promise<void> {
	try {
		// Check if this sender is an agent replying to a handed-off conversation
		const agentRelayed = await relayAgentToUser(from, text);
		if (agentRelayed) return;

		// Check if this user's conversation is handed off
		const handoff = await getHandoffState(from);
		if (handoff?.isHandedOff) {
			await relayUserToAgent(from, text);
			return;
		}

		// Normal AI processing
		await processWithAI(from, text, contactName);
	} catch (err) {
		console.error(`[whatsapp-processor] Error processing message from ${from}:`, err);
		try {
			await sendTextMessage(from, "Desculpe, tive um problema processando sua mensagem. Pode tentar novamente?");
		} catch {
			// Silent
		}
	}
}

/**
 * Process a message through the AI pipeline.
 */
async function processWithAI(
	from: string,
	text: string,
	contactName?: string,
): Promise<void> {
	// 1. Get or create conversation
	const conversationId = await getOrCreateConversation(from);

	// 2. Save user message
	await saveMessage(conversationId, "user", text);

	// 3. Load conversation history
	const history = await loadConversationHistory(conversationId);

	// 4. Run AI pipeline
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

	// 6. Send text response(s)
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

		// Check if this artifact triggers a handoff (lead_form = user showed interest)
		if (artifact.type === "lead_form") {
			const agentPhone = process.env.WHATSAPP_AGENT_PHONE;
			if (agentPhone) {
				// Build conversation summary for the agent
				const summary = buildConversationSummary(history, artifacts);
				await handoffToAgent(
					conversationId,
					from,
					contactName ?? from,
					agentPhone,
					summary,
				);
			}
		}
	}

	console.log(
		`[whatsapp-processor] Processed: ${from} | ${artifacts.length} artifacts, ${fullResponse.length} chars`,
	);
}

/**
 * Process an interactive reply (button click, list selection).
 */
export async function processInteractiveReply(
	from: string,
	replyId: string,
	replyTitle: string,
	contactName?: string,
): Promise<void> {
	// "Tenho interesse!" button triggers handoff check
	if (replyId.startsWith("interest_")) {
		const agentPhone = process.env.WHATSAPP_AGENT_PHONE;
		if (agentPhone) {
			const handoff = await getHandoffState(from);
			if (handoff?.conversationId && !handoff.isHandedOff) {
				const history = await loadConversationHistory(handoff.conversationId);
				const summary = buildConversationSummary(history, []);
				await handoffToAgent(
					handoff.conversationId,
					from,
					contactName ?? from,
					agentPhone,
					summary,
				);
				return;
			}
		}
	}

	// Route as text message to AI (or proxy if handed off)
	await processTextMessage(from, replyTitle, contactName);
}

function getWhatsAppConfig() {
	const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
	const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
	if (!accessToken || !phoneNumberId) {
		throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID required");
	}
	return { accessToken, phoneNumberId };
}

/**
 * Build a short conversation summary for the agent.
 */
function buildConversationSummary(
	history: Array<{ role: string; content: string }>,
	artifacts: Array<{ type: string; payload: Record<string, unknown> }>,
): string {
	const lines: string[] = [];

	// Last few messages for context
	const recent = history.slice(-6);
	for (const msg of recent) {
		const prefix = msg.role === "user" ? "👤" : "🤖";
		lines.push(`${prefix} ${msg.content.slice(0, 200)}`);
	}

	// Artifact summary
	for (const a of artifacts) {
		if (a.type === "recommendation_card") {
			const p = a.payload;
			lines.push(
				`\n📋 *Grupo recomendado:* ${p.administradora} — R$ ${(p.creditValue as number)?.toLocaleString("pt-BR")} — ${p.monthlyPayment}/mês — Score ${Math.round((p.score as number) * 100)}%`,
			);
		}
	}

	return lines.join("\n");
}

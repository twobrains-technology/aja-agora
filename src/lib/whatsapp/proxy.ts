/**
 * WhatsApp bidirectional proxy.
 * After AI handoff, relays messages between user and sales agent.
 *
 * User → [proxy] → Agent (prefixed with user name)
 * Agent → [proxy] → User (prefixed with agent name)
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { sendTextMessage } from "./api";
import { saveMessage } from "./session";

const AGENT_PHONE = process.env.WHATSAPP_AGENT_PHONE;

/**
 * Hand off a conversation from AI to a human agent.
 * Sends the agent a summary and marks the conversation.
 */
export async function handoffToAgent(
	conversationId: string,
	userWaId: string,
	userName: string,
	agentPhone: string,
	summary: string,
): Promise<void> {
	// Update conversation status
	await db
		.update(conversations)
		.set({
			status: "handed_off",
			handedOffTo: agentPhone,
			contactName: userName,
			updatedAt: new Date(),
		})
		.where(eq(conversations.id, conversationId));

	// Send summary to agent
	const agentMessage = [
		"🔔 *Nova negociação — Aja Agora*",
		"",
		`👤 *Cliente:* ${userName}`,
		`📱 *WhatsApp:* +${userWaId}`,
		"",
		"*Resumo da conversa:*",
		summary,
		"",
		"_Responda esta mensagem para falar diretamente com o cliente._",
	].join("\n");

	await sendTextMessage(agentPhone, agentMessage);

	// Notify user
	const agentName = process.env.WHATSAPP_AGENT_NAME ?? "nosso consultor";
	await sendTextMessage(
		userWaId,
		`Pronto! Vou te conectar com *${agentName}* que vai finalizar tudo pra você. Ele já tem todas as informações da nossa conversa! 🤝`,
	);

	console.log(
		`[whatsapp-proxy] Handoff: conversation ${conversationId} | user ${userWaId} → agent ${agentPhone}`,
	);
}

/**
 * Check if a conversation is in handed_off state.
 */
export async function getHandoffState(
	waId: string,
): Promise<{
	isHandedOff: boolean;
	conversationId?: string;
	handedOffTo?: string;
	contactName?: string;
} | null> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.waId, waId),
	});

	if (!conv) return null;

	return {
		isHandedOff: conv.status === "handed_off",
		conversationId: conv.id,
		handedOffTo: conv.handedOffTo ?? undefined,
		contactName: conv.contactName ?? undefined,
	};
}

/**
 * Find a conversation where the agent phone matches.
 * Used when the agent sends a reply — we need to find which user to relay to.
 */
export async function findConversationByAgent(
	agentWaId: string,
): Promise<{
	conversationId: string;
	userWaId: string;
	contactName: string;
} | null> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.handedOffTo, agentWaId),
	});

	if (!conv || !conv.waId) return null;

	return {
		conversationId: conv.id,
		userWaId: conv.waId,
		contactName: conv.contactName ?? "Cliente",
	};
}

/**
 * Relay a message from user to agent.
 */
export async function relayUserToAgent(
	userWaId: string,
	text: string,
): Promise<boolean> {
	const state = await getHandoffState(userWaId);
	if (!state?.isHandedOff || !state.handedOffTo || !state.conversationId) {
		return false;
	}

	const userName = state.contactName ?? "Cliente";

	// Save message to DB
	await saveMessage(state.conversationId, "user", text);

	// Relay to agent with user name prefix
	await sendTextMessage(
		state.handedOffTo,
		`*${userName}:*\n${text}`,
	);

	console.log(
		`[whatsapp-proxy] User→Agent: ${userWaId} → ${state.handedOffTo} | "${text.slice(0, 50)}"`,
	);
	return true;
}

/**
 * Relay a message from agent to user.
 */
export async function relayAgentToUser(
	agentWaId: string,
	text: string,
): Promise<boolean> {
	const conv = await findConversationByAgent(agentWaId);
	if (!conv) return false;

	const agentName = process.env.WHATSAPP_AGENT_NAME ?? "Consultor";

	// Save message to DB as assistant (agent acting as assistant)
	await saveMessage(conv.conversationId, "assistant", `[${agentName}] ${text}`);

	// Relay to user with agent name prefix
	await sendTextMessage(
		conv.userWaId,
		`*${agentName}:*\n${text}`,
	);

	console.log(
		`[whatsapp-proxy] Agent→User: ${agentWaId} → ${conv.userWaId} | "${text.slice(0, 50)}"`,
	);
	return true;
}

/**
 * Close a handed-off conversation (agent or user can trigger).
 */
export async function closeHandoff(conversationId: string): Promise<void> {
	await db
		.update(conversations)
		.set({
			status: "closed",
			updatedAt: new Date(),
		})
		.where(eq(conversations.id, conversationId));

	console.log(`[whatsapp-proxy] Closed handoff for conversation ${conversationId}`);
}

/**
 * WhatsApp bidirectional proxy with multi-agent support.
 * After AI handoff, notifies ALL agents. First to reply claims the conversation.
 *
 * User → [proxy] → Claimed Agent
 * Claimed Agent → [proxy] → User
 * Other Agent → "Já está sendo atendido por X"
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { sendTextMessage } from "./api";
import { saveMessage } from "./session";
import { publishMessage } from "@/lib/chat/message-bus";

/** Parse comma-separated agent phones and names from env */
export function getAgentList(): Array<{ phone: string; name: string }> {
	const phones = (process.env.WHATSAPP_AGENT_PHONES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
	const names = (process.env.WHATSAPP_AGENT_NAMES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
	return phones.map((phone, i) => ({ phone, name: names[i] ?? `Consultor ${i + 1}` }));
}

/** Check if a phone number belongs to any agent */
export function isAgentPhone(phone: string): boolean {
	return getAgentList().some((a) => a.phone === phone);
}

/** Get agent name by phone */
function getAgentName(phone: string): string {
	const agent = getAgentList().find((a) => a.phone === phone);
	return agent?.name ?? "Consultor";
}

/**
 * Hand off a conversation from AI to human agents.
 * Notifies ALL agents — first to reply claims it.
 */
export async function handoffToAgents(
	conversationId: string,
	userWaId: string,
	userName: string,
	summary: string,
): Promise<void> {
	const agents = getAgentList();
	if (agents.length === 0) {
		console.warn("[whatsapp-proxy] No agents configured (WHATSAPP_AGENT_PHONES empty)");
		return;
	}

	// Mark conversation as awaiting claim (handed_off but no specific agent yet)
	await db
		.update(conversations)
		.set({
			status: "handed_off",
			handedOffTo: null, // no one claimed yet
			contactName: userName,
			updatedAt: new Date(),
		})
		.where(eq(conversations.id, conversationId));

	// Notify ALL agents
	const agentMessage = [
		"🔔 *Nova negociação — Aja Agora*",
		"",
		`👤 *Cliente:* ${userName}`,
		`📱 *WhatsApp:* +${userWaId}`,
		"",
		"*Resumo da conversa:*",
		summary,
		"",
		"_Responda para assumir este atendimento. Primeiro a responder fica com o cliente._",
	].join("\n");

	for (const agent of agents) {
		await sendTextMessage(agent.phone, agentMessage);
		console.log(`[whatsapp-proxy] Notified agent ${agent.name} (${agent.phone})`);
	}

	// Notify user
	await sendTextMessage(
		userWaId,
		"Pronto! Vou te conectar com um dos nossos consultores especializados. Ele já tem todas as informações da nossa conversa! 🤝",
	);

	console.log(
		`[whatsapp-proxy] Handoff: conversation ${conversationId} | user ${userWaId} → ${agents.length} agents notified`,
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
	handedOffTo?: string | null;
	contactName?: string;
} | null> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.waId, waId),
	});

	if (!conv) return null;

	return {
		isHandedOff: conv.status === "handed_off",
		conversationId: conv.id,
		handedOffTo: conv.handedOffTo ?? null,
		contactName: conv.contactName ?? undefined,
	};
}

/**
 * Find a conversation where the agent phone matches (already claimed).
 */
export async function findConversationByAgent(
	agentWaId: string,
): Promise<{
	conversationId: string;
	userWaId: string | null;
	contactName: string;
	channel: "web" | "whatsapp";
} | null> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.handedOffTo, agentWaId),
	});

	if (!conv) return null;
	// WhatsApp conversations need waId; web conversations don't
	if (conv.channel === "whatsapp" && !conv.waId) return null;

	return {
		conversationId: conv.id,
		userWaId: conv.waId ?? null,
		contactName: conv.contactName ?? "Cliente",
		channel: (conv.channel as "web" | "whatsapp") ?? "web",
	};
}

/**
 * Find any unclaimed handed-off conversation (handedOffTo is null).
 */
async function findUnclaimedConversation(): Promise<{
	conversationId: string;
	userWaId: string | null;
	contactName: string;
	channel: "web" | "whatsapp";
} | null> {
	// Find handed_off conversations with no agent claimed
	const allConvs = await db.query.conversations.findMany({
		where: eq(conversations.status, "handed_off"),
	});

	// Accept both web and whatsapp conversations (web has no waId)
	const unclaimed = allConvs.find((c) => !c.handedOffTo && (c.waId || c.channel === "web"));
	if (!unclaimed) return null;

	return {
		conversationId: unclaimed.id,
		userWaId: unclaimed.waId ?? null,
		contactName: unclaimed.contactName ?? "Cliente",
		channel: (unclaimed.channel as "web" | "whatsapp") ?? "web",
	};
}

/**
 * Agent tries to claim or relay to a conversation.
 * Returns true if handled (claimed or relayed), false if nothing to do.
 */
export async function handleAgentMessage(
	agentWaId: string,
	text: string,
): Promise<boolean> {
	const agentName = getAgentName(agentWaId);

	// 1. Check if this agent already owns a conversation
	const ownedConv = await findConversationByAgent(agentWaId);
	if (ownedConv) {
		// Commands: /fim, /encerrar, /close → close handoff
		const normalized = text.trim().toLowerCase();
		if (normalized === "/fim" || normalized === "/encerrar" || normalized === "/close") {
			await closeHandoff(ownedConv.conversationId);
			await saveMessage(ownedConv.conversationId, "assistant", `[sistema] ${agentName} encerrou o atendimento.`);

			// Farewell to user
			if (ownedConv.channel === "whatsapp" && ownedConv.userWaId) {
				await sendTextMessage(
					ownedConv.userWaId,
					`Obrigado pelo contato, *${ownedConv.contactName}*! 🤝 Seu atendimento com *${agentName}* foi encerrado. Se precisar, é só mandar uma mensagem aqui que a gente te ajuda de novo.`,
				);
			} else {
				publishMessage(ownedConv.conversationId, {
					id: crypto.randomUUID(),
					role: "assistant",
					content: `Atendimento encerrado por ${agentName}. Obrigado!`,
					agentName,
					createdAt: new Date().toISOString(),
				});
			}

			// Confirm to agent
			await sendTextMessage(agentWaId, `✅ Atendimento de *${ownedConv.contactName}* encerrado.`);
			console.log(`[whatsapp-proxy] Agent ${agentName} closed conversation ${ownedConv.conversationId}`);
			return true;
		}

		// Relay to user — different delivery per channel
		await saveMessage(ownedConv.conversationId, "assistant", `[${agentName}] ${text}`);

		if (ownedConv.channel === "whatsapp" && ownedConv.userWaId) {
			await sendTextMessage(ownedConv.userWaId, `*${agentName}:*\n${text}`);
		} else {
			// Web channel — publish to SSE bus (frontend picks up in real time)
			publishMessage(ownedConv.conversationId, {
				id: crypto.randomUUID(),
				role: "assistant",
				content: text,
				agentName,
				createdAt: new Date().toISOString(),
			});
		}

		console.log(`[whatsapp-proxy] Agent→User (${ownedConv.channel}): ${agentName} → ${ownedConv.userWaId ?? "web"} | "${text.slice(0, 50)}"`);
		return true;
	}

	// 2. Check if there's an unclaimed conversation to grab
	const unclaimed = await findUnclaimedConversation();
	if (unclaimed) {
		// Claim it!
		await db
			.update(conversations)
			.set({
				handedOffTo: agentWaId,
				agentName,
				updatedAt: new Date(),
			})
			.where(eq(conversations.id, unclaimed.conversationId));

		// Notify the agent they claimed it
		await sendTextMessage(agentWaId, `✅ Você assumiu o atendimento de *${unclaimed.contactName}*. Suas mensagens agora vão direto pro cliente.`);

		// Notify other agents
		const agents = getAgentList();
		for (const other of agents) {
			if (other.phone !== agentWaId) {
				await sendTextMessage(other.phone, `ℹ️ *${agentName}* já assumiu o atendimento de *${unclaimed.contactName}*.`);
			}
		}

		// Relay the first message to user
		await saveMessage(unclaimed.conversationId, "assistant", `[${agentName}] ${text}`);

		if (unclaimed.channel === "whatsapp" && unclaimed.userWaId) {
			await sendTextMessage(unclaimed.userWaId, `*${agentName}:*\n${text}`);
		} else {
			publishMessage(unclaimed.conversationId, {
				id: crypto.randomUUID(),
				role: "assistant",
				content: text,
				agentName,
				createdAt: new Date().toISOString(),
			});
		}

		console.log(`[whatsapp-proxy] Agent ${agentName} claimed conversation ${unclaimed.conversationId}`);
		return true;
	}

	// 3. Check if another agent already claimed a conversation this agent was notified about
	// (they responded too late)
	const allHandedOff = await db.query.conversations.findMany({
		where: eq(conversations.status, "handed_off"),
	});
	const claimedByOther = allHandedOff.find((c) => c.handedOffTo && c.handedOffTo !== agentWaId);
	if (claimedByOther) {
		const ownerName = claimedByOther.agentName ?? "Outro consultor";
		await sendTextMessage(agentWaId, `⏳ *${ownerName}* já está atendendo *${claimedByOther.contactName ?? "o cliente"}*.`);
		return true;
	}

	// Nothing to do
	return false;
}

/**
 * Relay a message from user to the claimed agent.
 */
export async function relayUserToAgent(
	userWaId: string,
	text: string,
): Promise<boolean> {
	const state = await getHandoffState(userWaId);
	if (!state?.isHandedOff || !state.conversationId) {
		return false;
	}

	const userName = state.contactName ?? "Cliente";

	// Save message
	await saveMessage(state.conversationId, "user", text);

	if (state.handedOffTo) {
		// Already claimed — relay to the specific agent
		await sendTextMessage(state.handedOffTo, `*${userName}:*\n${text}`);
		console.log(`[whatsapp-proxy] User→Agent: ${userWaId} → ${state.handedOffTo} | "${text.slice(0, 50)}"`);
	} else {
		// Not claimed yet — send to all agents
		const agents = getAgentList();
		for (const agent of agents) {
			await sendTextMessage(agent.phone, `*${userName}:*\n${text}`);
		}
		console.log(`[whatsapp-proxy] User→AllAgents: ${userWaId} | "${text.slice(0, 50)}"`);
	}

	return true;
}

/**
 * Close a handed-off conversation.
 */
export async function closeHandoff(conversationId: string): Promise<void> {
	await db
		.update(conversations)
		.set({ status: "closed", updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));
	console.log(`[whatsapp-proxy] Closed handoff for conversation ${conversationId}`);
}

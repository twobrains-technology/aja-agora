/**
 * WhatsApp bidirectional proxy with multi-attendant support.
 * After AI handoff, notifies ALL active attendants. First to reply claims the conversation.
 *
 * User → [proxy] → Claimed Attendant
 * Claimed Attendant → [proxy] → User
 * Other Attendant → "Já está sendo atendido por X"
 *
 * Source of truth for attendants is the `user` table (role = "attendant", is_active = true).
 * Results are cached in-process for 60s; mutations in /api/admin/attendants invalidate via
 * `invalidateAttendantCache()`.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { conversations, user as userTable } from "@/db/schema";
import { publishMessage } from "@/lib/chat/message-bus";
import { sendTextMessage } from "./api";
import { saveMessage } from "./session";

interface Attendant {
	id: string;
	name: string;
	phone: string;
}

const CACHE_TTL_MS = 60_000;
let cache: { data: Attendant[]; fetchedAt: number } | null = null;

/** Fetch active attendants from the DB (with short in-memory cache). */
export async function getAttendantList(): Promise<Attendant[]> {
	if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
		return cache.data;
	}
	const rows = await db
		.select({
			id: userTable.id,
			name: userTable.name,
			phone: userTable.phone,
		})
		.from(userTable)
		.where(
			and(
				eq(userTable.role, "attendant"),
				eq(userTable.isActive, true),
				isNotNull(userTable.phone),
			),
		);
	const data: Attendant[] = rows
		.filter((r): r is { id: string; name: string; phone: string } => r.phone !== null)
		.map((r) => ({ id: r.id, name: r.name, phone: r.phone }));
	cache = { data, fetchedAt: Date.now() };
	return data;
}

/** Clear the attendant cache. Called from attendants CRUD routes after mutations. */
export function invalidateAttendantCache(): void {
	cache = null;
}

/** Check if a phone belongs to any active attendant. */
export async function isAttendantPhone(phone: string): Promise<boolean> {
	const list = await getAttendantList();
	return list.some((a) => a.phone === phone);
}

async function getAttendantByPhone(phone: string): Promise<Attendant | undefined> {
	const list = await getAttendantList();
	return list.find((a) => a.phone === phone);
}

async function getAttendantById(id: string): Promise<Attendant | undefined> {
	const list = await getAttendantList();
	return list.find((a) => a.id === id);
}

/**
 * Hand off a conversation from AI to human attendants.
 * Notifies ALL active attendants — first to reply claims it.
 * If there are no active attendants, marks as pending-claim and sends a friendly
 * message to the user; the next attendant to send any message will claim it via
 * `findUnclaimedConversation`.
 */
export async function handoffToAgents(
	conversationId: string,
	userWaId: string,
	userName: string,
	summary: string,
): Promise<void> {
	const attendants = await getAttendantList();

	// Mark conversation as handed_off with no claim yet (pending)
	await db
		.update(conversations)
		.set({
			status: "handed_off",
			handedOffUserId: null,
			contactName: userName,
			updatedAt: new Date(),
		})
		.where(eq(conversations.id, conversationId));

	if (attendants.length === 0) {
		await sendTextMessage(
			userWaId,
			"Recebi! No momento todos os atendentes estão ocupados, mas assim que um ficar livre ele te procura por aqui. 🤝",
		);
		console.warn(
			`[whatsapp-proxy] Handoff sem atendentes ativos — conversa ${conversationId} marcada como pending`,
		);
		return;
	}

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

	for (const attendant of attendants) {
		await sendTextMessage(attendant.phone, agentMessage);
		console.log(`[whatsapp-proxy] Notified attendant ${attendant.name} (${attendant.phone})`);
	}

	await sendTextMessage(
		userWaId,
		"Pronto! Vou te conectar com um dos nossos consultores especializados. Ele já tem todas as informações da nossa conversa! 🤝",
	);

	console.log(
		`[whatsapp-proxy] Handoff: conversation ${conversationId} | user ${userWaId} → ${attendants.length} attendants notified`,
	);
}

/** Check if a conversation is in handed_off state. */
export async function getHandoffState(waId: string): Promise<{
	isHandedOff: boolean;
	conversationId?: string;
	handedOffUserId?: string | null;
	contactName?: string;
} | null> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.waId, waId),
	});
	if (!conv) return null;
	return {
		isHandedOff: conv.status === "handed_off",
		conversationId: conv.id,
		handedOffUserId: conv.handedOffUserId ?? null,
		contactName: conv.contactName ?? undefined,
	};
}

interface OwnedConversation {
	conversationId: string;
	userWaId: string | null;
	contactName: string;
	channel: "web" | "whatsapp";
}

/** Find a conversation already claimed by the given attendant (by phone). */
async function findConversationByAttendant(
	attendantWaId: string,
): Promise<OwnedConversation | null> {
	const attendant = await getAttendantByPhone(attendantWaId);
	if (!attendant) return null;
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.handedOffUserId, attendant.id),
	});
	if (!conv) return null;
	if (conv.channel === "whatsapp" && !conv.waId) return null;
	return {
		conversationId: conv.id,
		userWaId: conv.waId ?? null,
		contactName: conv.contactName ?? "Cliente",
		channel: (conv.channel as "web" | "whatsapp") ?? "web",
	};
}

/** Find any unclaimed handed-off conversation (handedOffUserId is null). */
async function findUnclaimedConversation(): Promise<OwnedConversation | null> {
	const allConvs = await db.query.conversations.findMany({
		where: eq(conversations.status, "handed_off"),
	});
	const unclaimed = allConvs.find((c) => !c.handedOffUserId && (c.waId || c.channel === "web"));
	if (!unclaimed) return null;
	return {
		conversationId: unclaimed.id,
		userWaId: unclaimed.waId ?? null,
		contactName: unclaimed.contactName ?? "Cliente",
		channel: (unclaimed.channel as "web" | "whatsapp") ?? "web",
	};
}

/**
 * Attendant tries to claim or relay to a conversation.
 * Returns true if handled (claimed or relayed), false if nothing to do.
 */
export async function handleAgentMessage(agentWaId: string, text: string): Promise<boolean> {
	const attendant = await getAttendantByPhone(agentWaId);
	if (!attendant) return false;
	const agentName = attendant.name;

	// 1. Already owns a conversation?
	const ownedConv = await findConversationByAttendant(agentWaId);
	if (ownedConv) {
		const normalized = text.trim().toLowerCase();
		if (normalized === "/fim" || normalized === "/encerrar" || normalized === "/close") {
			await closeHandoff(ownedConv.conversationId);
			await saveMessage(
				ownedConv.conversationId,
				"assistant",
				`[sistema] ${agentName} encerrou o atendimento.`,
			);

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

			await sendTextMessage(agentWaId, `✅ Atendimento de *${ownedConv.contactName}* encerrado.`);
			console.log(
				`[whatsapp-proxy] Attendant ${agentName} closed conversation ${ownedConv.conversationId}`,
			);
			return true;
		}

		await saveMessage(ownedConv.conversationId, "assistant", `[${agentName}] ${text}`);

		if (ownedConv.channel === "whatsapp" && ownedConv.userWaId) {
			await sendTextMessage(ownedConv.userWaId, `*${agentName}:*\n${text}`);
		} else {
			publishMessage(ownedConv.conversationId, {
				id: crypto.randomUUID(),
				role: "assistant",
				content: text,
				agentName,
				createdAt: new Date().toISOString(),
			});
		}

		console.log(
			`[whatsapp-proxy] Attendant→User (${ownedConv.channel}): ${agentName} → ${ownedConv.userWaId ?? "web"} | "${text.slice(0, 50)}"`,
		);
		return true;
	}

	// 2. Unclaimed conversation to grab?
	const unclaimed = await findUnclaimedConversation();
	if (unclaimed) {
		await db
			.update(conversations)
			.set({
				handedOffUserId: attendant.id,
				updatedAt: new Date(),
			})
			.where(eq(conversations.id, unclaimed.conversationId));

		await sendTextMessage(
			agentWaId,
			`✅ Você assumiu o atendimento de *${unclaimed.contactName}*. Suas mensagens agora vão direto pro cliente.`,
		);

		// Notify other attendants
		const attendants = await getAttendantList();
		for (const other of attendants) {
			if (other.id !== attendant.id) {
				await sendTextMessage(
					other.phone,
					`ℹ️ *${agentName}* já assumiu o atendimento de *${unclaimed.contactName}*.`,
				);
			}
		}

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

		console.log(
			`[whatsapp-proxy] Attendant ${agentName} claimed conversation ${unclaimed.conversationId}`,
		);
		return true;
	}

	// 3. Another attendant already claimed a conversation?
	const allHandedOff = await db.query.conversations.findMany({
		where: eq(conversations.status, "handed_off"),
	});
	const claimedByOther = allHandedOff.find(
		(c) => c.handedOffUserId && c.handedOffUserId !== attendant.id,
	);
	if (claimedByOther && claimedByOther.handedOffUserId) {
		const owner = await getAttendantById(claimedByOther.handedOffUserId);
		const ownerName = owner?.name ?? "Outro consultor";
		await sendTextMessage(
			agentWaId,
			`⏳ *${ownerName}* já está atendendo *${claimedByOther.contactName ?? "o cliente"}*.`,
		);
		return true;
	}

	return false;
}

/** Relay a message from user to the claimed attendant (or all, if unclaimed). */
export async function relayUserToAgent(userWaId: string, text: string): Promise<boolean> {
	const state = await getHandoffState(userWaId);
	if (!state?.isHandedOff || !state.conversationId) {
		return false;
	}

	const userName = state.contactName ?? "Cliente";

	await saveMessage(state.conversationId, "user", text);

	if (state.handedOffUserId) {
		const attendant = await getAttendantById(state.handedOffUserId);
		if (attendant) {
			await sendTextMessage(attendant.phone, `*${userName}:*\n${text}`);
			console.log(
				`[whatsapp-proxy] User→Attendant: ${userWaId} → ${attendant.phone} | "${text.slice(0, 50)}"`,
			);
		} else {
			console.warn(
				`[whatsapp-proxy] Claimed attendant ${state.handedOffUserId} not found in active list`,
			);
		}
	} else {
		const attendants = await getAttendantList();
		for (const a of attendants) {
			await sendTextMessage(a.phone, `*${userName}:*\n${text}`);
		}
		console.log(`[whatsapp-proxy] User→AllAttendants: ${userWaId} | "${text.slice(0, 50)}"`);
	}

	return true;
}

/** Close a handed-off conversation. */
export async function closeHandoff(conversationId: string): Promise<void> {
	await db
		.update(conversations)
		.set({ status: "closed", updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));
	console.log(`[whatsapp-proxy] Closed handoff for conversation ${conversationId}`);
}

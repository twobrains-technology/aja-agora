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
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads, user as userTable } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { publishMessage } from "@/lib/chat/message-bus";
import { sendTextMessage } from "./api";
import { persistMeta, reloadMeta } from "./meta-helpers";
import { loadConversationHistory, saveMessage } from "./session";
import { publishToAttendant } from "./simulator-bus";

/**
 * Sends a WhatsApp message to an attendant AND mirrors it to the dev simulator
 * bus so /admin/simulator can display it. The Meta call is best-effort — even
 * if the attendant phone is fake/unreachable, the simulator still receives it.
 */
async function sendToAttendant(phone: string, text: string): Promise<void> {
	console.log(`[proxy] sendToAttendant phone=${phone} text="${text.slice(0, 60)}"`);
	await sendTextMessage(phone, text);
	publishToAttendant(phone, text);
}

const INTEREST_RE =
	/^\s*(tenho\s+interesse|tô\s+interessad[oa]|estou\s+interessad[oa]|quero\s+(?:esse|este|essa|esta|fechar|isso|essa\s+opcao)|me\s+interessa|fechar|bora\s+fechar|vamos\s+fechar|topo|topei|fechado)\s*[!.?]*\s*$/i;

function isInterestExpression(text: string): boolean {
	return INTEREST_RE.test(text);
}

/**
 * Strip the Brazilian country code (55) from a WhatsApp wa_id so the stored
 * lead phone matches the format used by the web flow (DDD + number, 10-11
 * digits). Returns null when the wa_id is empty (web handoff).
 */
function normalizeWaIdToPhone(waId: string): string | null {
	const digits = waId.replace(/\D/g, "");
	if (!digits) return null;
	const stripped = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
	return stripped || null;
}

function buildConversationSummary(
	history: Array<{ role: string; content: string }>,
	artifacts: Array<{ type: string; payload: Record<string, unknown> }>,
): string {
	const lines: string[] = [];

	const recent = history.slice(-6);
	for (const msg of recent) {
		const prefix = msg.role === "user" ? "👤" : "🤖";
		lines.push(`${prefix} ${msg.content.slice(0, 200)}`);
	}

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

export async function startInterestHandoff(
	from: string,
	conversationId: string,
	storedName: string | null,
): Promise<boolean> {
	console.log(
		`[whatsapp-proxy] startInterestHandoff entered: from=${from} conversationId=${conversationId} storedName=${storedName ?? "(null)"}`,
	);
	const handoff = await getHandoffState(from);
	console.log(`[whatsapp-proxy] startInterestHandoff handoffState: ${JSON.stringify(handoff)}`);
	if (!handoff?.conversationId || handoff.isHandedOff) {
		console.log(
			`[whatsapp-proxy] startInterestHandoff bail: conversationId=${handoff?.conversationId ?? "(none)"} isHandedOff=${handoff?.isHandedOff ?? "(none)"}`,
		);
		return false;
	}

	if (storedName && storedName.trim().length > 0) {
		console.log(`[whatsapp-proxy] startInterestHandoff → handoffToAgents`);
		const history = await loadConversationHistory(conversationId);
		const summary = buildConversationSummary(history, []);
		await handoffToAgents(conversationId, from, storedName, summary);
		return true;
	}

	const meta = await reloadMeta(conversationId);
	await persistMeta(conversationId, { ...meta, awaitingName: true });
	await sendTextMessage(
		from,
		"Ótima escolha! 🎉 Pra te conectar com nosso consultor, me diz: *qual seu nome completo?*",
	);
	return true;
}

/**
 * Handles in-flight handoff state when a text message arrives:
 *   1. If the system was awaiting a name and one is provided, complete the handoff.
 *   2. If qualification finished and the user expresses interest, start handoff.
 * Returns true if handled (caller should stop); false to continue with AI flow.
 */
export async function handlePendingHandoffText(
	from: string,
	text: string,
	contactName: string | undefined,
): Promise<boolean> {
	const handoff = await getHandoffState(from);
	if (!handoff?.conversationId) return false;

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, handoff.conversationId),
	});
	const meta = conv?.metadata as Record<string, unknown> | null;

	if (meta?.awaitingName) {
		const agents = await getAttendantList();
		if (agents.length > 0) {
			await db
				.update(conversations)
				.set({
					metadata: { ...meta, awaitingName: false },
					contactName: text,
					updatedAt: new Date(),
				})
				.where(eq(conversations.id, handoff.conversationId));

			const history = await loadConversationHistory(handoff.conversationId);
			const summary = buildConversationSummary(history, []);
			await handoffToAgents(handoff.conversationId, from, text, summary);
			return true;
		}
	}

	const typedMeta = meta as ConversationMetadata | null;
	if (typedMeta?.searchDispatched && isInterestExpression(text)) {
		const storedName = contactName ?? conv?.contactName ?? null;
		const handled = await startInterestHandoff(from, handoff.conversationId, storedName);
		if (handled) return true;
	}

	return false;
}

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
	console.log(
		`[whatsapp-proxy] handoffToAgents: found ${attendants.length} active attendants — ${attendants.map((a) => `${a.name}(${a.phone})`).join(", ") || "(none)"}`,
	);

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

	// Idempotent lead upsert. Web path inserts the lead in /api/leads before
	// calling this function, so we skip when one already exists. WhatsApp paths
	// (interest button, regex, suggest_handoff) reach here without a lead row,
	// so we create one with whatever PII is available — at minimum name + phone.
	// userWaId is "" for web calls.
	try {
		const existing = await db.query.leads.findFirst({
			where: eq(leads.conversationId, conversationId),
		});
		if (!existing) {
			const phone = normalizeWaIdToPhone(userWaId);
			await db.insert(leads).values({
				conversationId,
				name: userName,
				phone,
				email: null,
			});
			console.log(
				`[whatsapp-proxy] Lead created for handoff: conversation=${conversationId} name=${userName} phone=${phone ?? "(none)"}`,
			);
		}
	} catch (err) {
		// Don't block the handoff if the lead insert fails — attendants still
		// need to be notified, and the lead can be reconciled manually.
		console.error("[whatsapp-proxy] Failed to upsert lead on handoff:", err);
	}

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
		await sendToAttendant(attendant.phone, agentMessage);
		console.log(`[whatsapp-proxy] Notified attendant ${attendant.name} (${attendant.phone})`);
	}

	const firstName = userName.trim().split(/\s+/)[0];
	await sendTextMessage(
		userWaId,
		`Perfeito, ${firstName}! Já estou passando seu perfil pro consultor — ele te chama aqui em instantes. 🤝`,
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

/** Find any unclaimed handed-off conversation (handedOffUserId is null).
 * Ordered by updatedAt DESC so the most recent handoff wins — otherwise stale
 * web conversations stuck in handed_off state get claimed before the fresh one. */
async function findUnclaimedConversation(): Promise<OwnedConversation | null> {
	const allConvs = await db.query.conversations.findMany({
		where: eq(conversations.status, "handed_off"),
		orderBy: [desc(conversations.updatedAt)],
	});
	const unclaimed = allConvs.find((c) => !c.handedOffUserId && (c.waId || c.channel === "web"));
	if (!unclaimed) return null;
	console.log(
		`[whatsapp-proxy] findUnclaimedConversation picked id=${unclaimed.id} channel=${unclaimed.channel} waId=${unclaimed.waId ?? "(null)"} updatedAt=${unclaimed.updatedAt?.toISOString?.() ?? unclaimed.updatedAt}`,
	);
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

			await sendToAttendant(agentWaId, `✅ Atendimento de *${ownedConv.contactName}* encerrado.`);
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

		await sendToAttendant(
			agentWaId,
			`✅ Você assumiu o atendimento de *${unclaimed.contactName}*. Suas mensagens agora vão direto pro cliente.`,
		);

		// Notify other attendants
		const attendants = await getAttendantList();
		for (const other of attendants) {
			if (other.id !== attendant.id) {
				await sendToAttendant(
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
	if (claimedByOther?.handedOffUserId) {
		const owner = await getAttendantById(claimedByOther.handedOffUserId);
		const ownerName = owner?.name ?? "Outro consultor";
		await sendToAttendant(
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
			await sendToAttendant(attendant.phone, `*${userName}:*\n${text}`);
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
			await sendToAttendant(a.phone, `*${userName}:*\n${text}`);
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

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { sendTextMessage } from "./api";
import { metaOf, persistMeta } from "./meta-helpers";
import { saveMessage } from "./session";

const emailSchema = z.string().trim().email();

function normalizePhone(raw: string): string | null {
	const digits = raw.replace(/\D/g, "");
	// Brazil: 10 (fixo) ou 11 (celular) digits with DDD; allow optional country code 55.
	const stripped = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
	if (stripped.length !== 10 && stripped.length !== 11) return null;
	return stripped;
}

function isPlausibleName(raw: string): boolean {
	const trimmed = raw.trim();
	if (trimmed.length < 2) return false;
	if (trimmed.length > 80) return false;
	// Reject pure-digit replies (very common when the user mis-replies the lead form).
	if (/^\d+$/.test(trimmed.replace(/\s/g, ""))) return false;
	return true;
}

function firstNameOf(full: string): string {
	return full.trim().split(/\s+/)[0] ?? full.trim();
}

/**
 * Returns true when this user message was consumed by the lead-collection state
 * machine and the caller should stop (no analyzer, no agent run).
 */
export async function handleLeadCollectionTurn(args: {
	from: string;
	conversationId: string;
	text: string;
	meta: ConversationMetadata;
}): Promise<boolean> {
	const { from, conversationId, text, meta } = args;
	const lc = meta.leadCollection;
	if (!lc) return false;

	// Persist the raw user message regardless of validation outcome — keeps
	// the transcript honest in /admin/conversations.
	await saveMessage(conversationId, "user", text);

	if (lc.stage === "name") {
		if (!isPlausibleName(text)) {
			await sendTextMessage(
				from,
				"Não consegui entender o nome. Pode me passar seu *nome completo*?",
			);
			return true;
		}
		const name = text.trim();
		const updated: ConversationMetadata = {
			...meta,
			leadCollection: { stage: "phone", name },
		};
		await persistMeta(conversationId, updated);
		// Update conversation contact name now too (used by the agent in later turns).
		await db
			.update(conversations)
			.set({ contactName: name, updatedAt: new Date() })
			.where(eq(conversations.id, conversationId));

		await sendTextMessage(
			from,
			`Show, ${firstNameOf(name)}! Agora me passa seu *telefone com DDD* (ex: 11 99999-9999).`,
		);
		return true;
	}

	if (lc.stage === "phone") {
		const phone = normalizePhone(text);
		if (!phone) {
			await sendTextMessage(
				from,
				"Não reconheci esse telefone. Manda no formato *DDD + número*, ex: 11 99999-9999.",
			);
			return true;
		}
		const updated: ConversationMetadata = {
			...meta,
			leadCollection: { stage: "email", name: lc.name, phone },
		};
		await persistMeta(conversationId, updated);
		await sendTextMessage(from, "Por último, qual seu *email*?");
		return true;
	}

	// stage === "email"
	const parsed = emailSchema.safeParse(text);
	if (!parsed.success) {
		await sendTextMessage(
			from,
			"Esse email não parece válido. Pode confirmar? Ex: nome@dominio.com.br",
		);
		return true;
	}
	const email = parsed.data;
	const name = lc.name ?? "";
	const phone = lc.phone ?? "";

	try {
		const existing = await db.query.leads.findFirst({
			where: eq(leads.conversationId, conversationId),
		});

		if (existing) {
			await db
				.update(leads)
				.set({ name, phone, email, updatedAt: new Date() })
				.where(eq(leads.id, existing.id));
		} else {
			await db.insert(leads).values({ conversationId, name, phone, email });
		}
	} catch (err) {
		console.error("[lead-collection] insert/update failed:", err);
		await sendTextMessage(
			from,
			"Tive um problema pra salvar seus dados agora. Pode tentar novamente em instantes?",
		);
		return true;
	}

	const cleared: ConversationMetadata = { ...meta };
	delete cleared.leadCollection;
	await persistMeta(conversationId, cleared);

	await sendTextMessage(
		from,
		`Pronto, ${firstNameOf(name)}! Recebi tudo certinho — vamos entrar em contato pra finalizar. ✅`,
	);
	console.log(
		`[lead-collection] captured lead conversation=${conversationId} email=${email} phone=${phone}`,
	);
	return true;
}

/**
 * Loads the conversation metadata fresh from DB and returns whether
 * lead-collection state is currently active for this conversation.
 */
export function isCollectingLead(meta: ConversationMetadata): boolean {
	return Boolean(meta.leadCollection);
}

/**
 * Returns true if the artifact stream produced by the agent contains a
 * `lead_form` artifact — used by the agent runner to flip on collection state.
 */
export function detectLeadFormArtifact(
	artifacts: ReadonlyArray<{ type: string }>,
): boolean {
	return artifacts.some((a) => a.type === "lead_form");
}

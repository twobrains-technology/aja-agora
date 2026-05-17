import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { createLeadFromConversation } from "@/lib/admin/lead-stage-tracker";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta } from "@/lib/conversation/meta";
import {
	getNamespace,
	identityFromCookie,
	identityFromPhone,
	normalizePhoneBR,
} from "@/lib/memory/identity";
import { getMemoryAdapter } from "@/lib/memory/index";
import { logMemoryOp } from "@/lib/memory/observability";
import { reconcileIdentity as runReconcile } from "@/lib/memory/reconciler";
import type { Channel, TurnEvent } from "./types";

const emailSchema = z.string().trim().email();

function normalizePhone(raw: string): string | null {
	const digits = raw.replace(/\D/g, "");
	const stripped = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
	if (stripped.length !== 10 && stripped.length !== 11) return null;
	return stripped;
}

function isPlausibleName(raw: string): boolean {
	const trimmed = raw.trim();
	if (trimmed.length < 2) return false;
	if (trimmed.length > 80) return false;
	if (/^\d+$/.test(trimmed.replace(/\s/g, ""))) return false;
	return true;
}

function firstNameOf(full: string): string {
	return full.trim().split(/\s+/)[0] ?? full.trim();
}

export function isCollectingLead(meta: ConversationMetadata): boolean {
	return Boolean(meta.leadCollection);
}

export function detectLeadFormArtifact(artifacts: ReadonlyArray<{ type: string }>): boolean {
	return artifacts.some((a) => a.type === "lead_form");
}

export async function* runLeadCollectionTurn(args: {
	conversationId: string;
	channel: Channel;
	text: string;
	meta: ConversationMetadata;
	userKey?: string | null;
}): AsyncGenerator<TurnEvent> {
	const { conversationId, channel, text, meta, userKey } = args;
	const lc = meta.leadCollection;
	if (!lc) return;

	await saveMessage(conversationId, "user", text, channel);

	if (lc.stage === "name") {
		if (!isPlausibleName(text)) {
			yield {
				type: "lead-collection-prompt",
				field: "name",
				text: "Não consegui entender o nome. Pode me passar seu *nome completo*?",
			};
			return;
		}
		const name = text.trim();
		const updated: ConversationMetadata = {
			...meta,
			leadCollection: { stage: "phone", name },
		};
		await persistMeta(conversationId, updated);
		await db
			.update(conversations)
			.set({ contactName: name, updatedAt: new Date() })
			.where(eq(conversations.id, conversationId));
		yield { type: "meta-update", meta: updated };
		yield {
			type: "lead-collection-prompt",
			field: "phone",
			text: `Show, ${firstNameOf(name)}! Agora me passa seu *telefone com DDD* (ex: 11 99999-9999).`,
		};
		return;
	}

	if (lc.stage === "phone") {
		const phone = normalizePhone(text);
		if (!phone) {
			yield {
				type: "lead-collection-prompt",
				field: "phone",
				text: "Não reconheci esse telefone. Manda no formato *DDD + número*, ex: 11 99999-9999.",
			};
			return;
		}
		const updated: ConversationMetadata = {
			...meta,
			leadCollection: { stage: "email", name: lc.name, phone },
		};
		await persistMeta(conversationId, updated);
		yield { type: "meta-update", meta: updated };
		yield {
			type: "lead-collection-prompt",
			field: "email",
			text: "Por último, qual seu *email*?",
		};
		return;
	}

	const parsed = emailSchema.safeParse(text);
	if (!parsed.success) {
		yield {
			type: "lead-collection-prompt",
			field: "email",
			text: "Esse email não parece válido. Pode confirmar? Ex: nome@dominio.com.br",
		};
		return;
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
			await createLeadFromConversation({ conversationId, name, phone, email });
		}
	} catch (err) {
		console.error("[lead-collection] insert/update failed:", err);
		yield {
			type: "lead-collection-prompt",
			field: "email",
			text: "Tive um problema pra salvar seus dados agora. Pode tentar novamente em instantes?",
		};
		return;
	}

	const cleared: ConversationMetadata = { ...meta };
	delete cleared.leadCollection;
	await persistMeta(conversationId, cleared);
	yield { type: "meta-update", meta: cleared };
	yield {
		type: "lead-collection-prompt",
		field: "email",
		text: `Pronto, ${firstNameOf(name)}! Recebi tudo certinho — vamos entrar em contato pra finalizar. ✅`,
	};
	console.log(
		`[lead-collection] captured lead conversation=${conversationId} email=${email} phone=${phone}`,
	);

	// Trigger de reconciliação Letta (ADR 2026-05-16 decisão #3).
	// Web anônimo (cookie) acabou de virar identificado (phone). Migra memória
	// do agent cookie pro agent phone. Fire-and-forget — não bloqueia resposta.
	// Idempotente via `meta.letta.reconciled` flag.
	if (channel === "web" && userKey && phone && !cleared.letta?.reconciled) {
		void triggerReconciliationOnLeadCapture({
			conversationId,
			cookieValue: userKey,
			phoneRaw: phone,
			meta: cleared,
		});
	}
}

/**
 * Dispara reconciliação Letta após captura de lead web. Fire-and-forget.
 * Idempotente: marca `meta.letta.reconciled = true` ao terminar pra impedir
 * re-disparo se a função for chamada de novo.
 */
async function triggerReconciliationOnLeadCapture(input: {
	conversationId: string;
	cookieValue: string;
	phoneRaw: string;
	meta: ConversationMetadata;
}): Promise<void> {
	const { conversationId, cookieValue, phoneRaw, meta } = input;
	try {
		const phoneE164 = normalizePhoneBR(phoneRaw);
		if (!phoneE164) {
			logMemoryOp(
				{
					letta_op: "reconcile",
					conversation_id: conversationId,
					error: `phone normalize failed: ${phoneRaw}`,
				},
				"warn",
			);
			return;
		}
		const namespace = getNamespace();
		const fromIdentity = identityFromCookie(cookieValue, namespace);
		const toIdentity = identityFromPhone(phoneE164, namespace);
		const adapter = getMemoryAdapter();

		const result = await runReconcile({
			adapter,
			from: fromIdentity,
			to: toIdentity,
			conversationId,
		});

		if (result.success) {
			// Persistir idempotência. Re-read meta pra não sobrescrever updates
			// concorrentes do mesmo turno.
			const refreshed: ConversationMetadata = {
				...meta,
				letta: {
					reconciled: true,
					reconciledAt: new Date().toISOString(),
				},
			};
			await persistMeta(conversationId, refreshed);
		}
	} catch (err) {
		logMemoryOp(
			{
				letta_op: "reconcile",
				conversation_id: conversationId,
				error: err instanceof Error ? err.message : String(err),
			},
			"warn",
		);
	}
}

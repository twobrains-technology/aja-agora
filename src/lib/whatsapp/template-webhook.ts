/**
 * Webhook `message_template_status_update` da Meta.
 *
 * Payload típico:
 *  {
 *    event: "APPROVED" | "REJECTED" | "FLAGGED" | "PAUSED" | "DISABLED",
 *    message_template_id: 123,
 *    message_template_name: "boas_vindas",
 *    message_template_language: "pt_BR",
 *    reason: "OPT_OUT" | null,
 *  }
 *
 * O parser é puro (testável sem DB). O handler atualiza a tabela
 * `whatsapp_templates`.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { whatsappTemplates } from "@/db/schema";

export type ParsedStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";

export interface ParsedTemplateStatusEvent {
	name: string;
	status: ParsedStatus;
	metaTemplateId: string | null;
	rejectionReason: string | null;
	language: string | null;
}

type ParseResult = { ok: true; data: ParsedTemplateStatusEvent } | { ok: false; error: string };

// Mapeia os events da Meta → nosso enum local.
const STATUS_MAP: Record<string, ParsedStatus> = {
	APPROVED: "APPROVED",
	REJECTED: "REJECTED",
	PENDING: "PENDING",
	PAUSED: "PAUSED",
	FLAGGED: "PAUSED", // Meta usa FLAGGED pra pausa por alta rejeição
	DISABLED: "DISABLED",
};

export function parseTemplateStatusPayload(payload: unknown): ParseResult {
	if (!payload || typeof payload !== "object") {
		return { ok: false, error: "payload_not_object" };
	}
	const p = payload as Record<string, unknown>;
	const event = typeof p.event === "string" ? p.event : null;
	const name = typeof p.message_template_name === "string" ? p.message_template_name : null;
	if (!event) return { ok: false, error: "missing_event" };
	if (!name) return { ok: false, error: "missing_name" };
	const status = STATUS_MAP[event];
	if (!status) return { ok: false, error: `unknown_event:${event}` };

	const metaTemplateId =
		p.message_template_id !== undefined && p.message_template_id !== null
			? String(p.message_template_id)
			: null;
	const language =
		typeof p.message_template_language === "string" ? p.message_template_language : null;
	const rejectionReason = typeof p.reason === "string" ? p.reason : null;

	return {
		ok: true,
		data: { name, status, metaTemplateId, rejectionReason, language },
	};
}

export async function handleTemplateStatusUpdate(value: unknown): Promise<void> {
	const parsed = parseTemplateStatusPayload(value);
	if (!parsed.ok) {
		console.warn("[whatsapp] template status payload invalid:", parsed.error);
		return;
	}
	const { name, status, metaTemplateId, rejectionReason } = parsed.data;

	const now = new Date();
	const updates: Record<string, unknown> = {
		metaStatus: status,
		metaRejectionReason: status === "REJECTED" ? rejectionReason : null,
	};
	if (metaTemplateId) updates.metaTemplateId = metaTemplateId;
	if (status === "APPROVED") updates.approvedAt = now;

	const result = await db
		.update(whatsappTemplates)
		.set(updates)
		.where(eq(whatsappTemplates.name, name))
		.returning({ id: whatsappTemplates.id });

	if (result.length === 0) {
		console.warn(`[whatsapp] template-status-update for unknown name="${name}"`);
	} else {
		console.log(
			`[whatsapp] template "${name}" → ${status}${rejectionReason ? ` (${rejectionReason})` : ""}`,
		);
	}
}

/**
 * Sincronização de status de Message Templates da Meta (FIX-202).
 *
 * Dupla via anti-manual (regra global "nunca solução manual/refresh"):
 *   1. WEBHOOK (tempo real) — `message_template_status_update` chega quando a Meta
 *      aprova/rejeita/pausa um template. `parseTemplateStatusChange` normaliza o
 *      `value` do webhook e `applyTemplateStatusUpdate` reflete no `whatsappTemplates`.
 *   2. POLL (fallback) — `reconcileTemplateStatuses` chama `listTemplates()` e
 *      reconcilia divergências que o webhook porventura perdeu.
 *
 * Em AMBAS: ao um template virar `APPROVED`, dispara `flushOutboundQueue(usageKey)`
 * (FIX-201) — as confirmações enfileiradas na janela fechada saem sozinhas.
 *
 * `reconcileTemplateStatuses` é o CONTRATO exportado pro bloco-admin (botão de
 * "sincronizar status") — assinatura estável: `() => Promise<ReconcileResult>`.
 *
 * Ver docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.
 */
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { whatsappTemplates } from "@/db/schema";
import { listTemplates } from "./api";
import { flushOutboundQueue } from "./template-dispatch";

/** Estados do enum local (whatsapp_template_status). */
type TemplateStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "DISABLED" | "PAUSED";

/** Payload normalizado a partir do `value` do webhook (ou do poll). */
export interface TemplateStatusChange {
	/** Evento/status da Meta (APPROVED/REJECTED/PAUSED/DISABLED/...). */
	event: string;
	metaTemplateId: string | null;
	metaName: string | null;
	language: string | null;
	reason: string | null;
}

/**
 * Mapeia o evento/status da Meta pro enum local. Retorna `null` quando o evento
 * não corresponde a um estado conhecido (ex `PENDING_DELETION`, `FLAGGED`) — aí
 * o status local NÃO é sobrescrito (só `lastSyncedAt` avança).
 */
export function mapMetaEventToStatus(event: string | null | undefined): TemplateStatus | null {
	switch ((event ?? "").toUpperCase()) {
		case "APPROVED":
			return "APPROVED";
		case "REJECTED":
			return "REJECTED";
		case "PAUSED":
			return "PAUSED";
		case "DISABLED":
			return "DISABLED";
		case "PENDING":
		case "IN_APPEAL":
		case "PENDING_REVIEW":
			return "PENDING";
		default:
			return null;
	}
}

/**
 * Normaliza o `value` de um `changes[].field === "message_template_status_update"`.
 * A Meta manda `value.event`, `value.message_template_id`, `value.message_template_name`,
 * `value.message_template_language` e `value.reason`. Pura — sem I/O.
 */
export function parseTemplateStatusChange(value: unknown): TemplateStatusChange {
	const v = (value ?? {}) as Record<string, unknown>;
	const str = (x: unknown): string | null => (typeof x === "string" && x.length > 0 ? x : null);
	return {
		event: str(v.event) ?? "",
		metaTemplateId: str(v.message_template_id),
		metaName: str(v.message_template_name),
		language: str(v.message_template_language),
		reason: str(v.reason),
	};
}

export type ApplyResult =
	| { updated: false; reason: "unknown_template" | "no_key" | "no_status_change" }
	| { updated: true; usageKey: string | null; status: TemplateStatus; flushed: boolean };

/**
 * Reflete um status update no `whatsappTemplates`, casando por `metaTemplateId`
 * (preferido) ou `metaName`. Se virou `APPROVED`, dispara `flushOutboundQueue`.
 * Template desconhecido localmente → loga e IGNORA (não cria linha órfã — o poll
 * reconcilia por nome quando/se a linha existir).
 */
export async function applyTemplateStatusUpdate(
	change: TemplateStatusChange,
): Promise<ApplyResult> {
	if (!change.metaTemplateId && !change.metaName) {
		return { updated: false, reason: "no_key" };
	}

	const filters = [];
	if (change.metaTemplateId)
		filters.push(eq(whatsappTemplates.metaTemplateId, change.metaTemplateId));
	if (change.metaName) filters.push(eq(whatsappTemplates.metaName, change.metaName));

	const [row] = await db
		.select()
		.from(whatsappTemplates)
		.where(filters.length === 1 ? filters[0] : or(...filters))
		.limit(1);

	if (!row) {
		console.warn(
			JSON.stringify({
				level: "warn",
				source: "template-sync",
				event: "status_update_unknown_template",
				metaTemplateId: change.metaTemplateId,
				metaName: change.metaName,
				metaEvent: change.event,
			}),
		);
		return { updated: false, reason: "unknown_template" };
	}

	const nextStatus = mapMetaEventToStatus(change.event);
	const now = new Date();
	const patch: Partial<typeof whatsappTemplates.$inferInsert> = { lastSyncedAt: now };
	if (nextStatus) patch.status = nextStatus;
	if (nextStatus === "REJECTED" && change.reason) patch.rejectionReason = change.reason;
	if (nextStatus === "APPROVED") patch.approvedAt = now;
	// Grava o metaTemplateId quando só tínhamos o nome (primeira notificação).
	if (change.metaTemplateId && !row.metaTemplateId) patch.metaTemplateId = change.metaTemplateId;

	await db.update(whatsappTemplates).set(patch).where(eq(whatsappTemplates.id, row.id));

	let flushed = false;
	if (nextStatus === "APPROVED" && row.usageKey) {
		await flushOutboundQueue(row.usageKey);
		flushed = true;
	}

	return {
		updated: true,
		usageKey: row.usageKey,
		status: nextStatus ?? (row.status as TemplateStatus),
		flushed,
	};
}

export interface ReconcileResult {
	checked: number;
	updated: number;
	flushed: string[];
}

/**
 * Poll de reconciliação (CONTRATO pro bloco-admin): lê `listTemplates()` da Meta e
 * reconcilia o status local divergente por `metaTemplateId`/`metaName`. Os que
 * TRANSICIONARAM pra `APPROVED` disparam `flushOutboundQueue`. Idempotente: sem
 * divergência, não escreve nem flusha.
 */
export async function reconcileTemplateStatuses(): Promise<ReconcileResult> {
	const remote = await listTemplates();
	const local = await db.select().from(whatsappTemplates);

	const byMetaId = new Map<string, (typeof local)[number]>();
	const byName = new Map<string, (typeof local)[number]>();
	for (const t of local) {
		if (t.metaTemplateId) byMetaId.set(t.metaTemplateId, t);
		if (t.metaName) byName.set(t.metaName, t);
	}

	let updated = 0;
	const flushed: string[] = [];
	const now = new Date();

	for (const r of remote) {
		const localRow = (r.id && byMetaId.get(r.id)) || (r.name && byName.get(r.name)) || null;
		if (!localRow) continue;

		const nextStatus = mapMetaEventToStatus(r.status);
		const statusChanged = nextStatus != null && nextStatus !== localRow.status;

		const patch: Partial<typeof whatsappTemplates.$inferInsert> = { lastSyncedAt: now };
		if (statusChanged) patch.status = nextStatus as TemplateStatus;
		if (statusChanged && nextStatus === "APPROVED") patch.approvedAt = now;
		if (r.id && !localRow.metaTemplateId) patch.metaTemplateId = r.id;

		await db.update(whatsappTemplates).set(patch).where(eq(whatsappTemplates.id, localRow.id));

		if (statusChanged) {
			updated++;
			if (nextStatus === "APPROVED" && localRow.usageKey) {
				await flushOutboundQueue(localRow.usageKey);
				flushed.push(localRow.usageKey);
			}
		}
	}

	return { checked: remote.length, updated, flushed };
}

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { transitionLeadStage } from "@/lib/admin/lead-transitions";
import { attachContact } from "@/lib/contacts";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";

export type TrackableStage = "engajado" | "qualificado";

/**
 * FIX-48: resolve o leadId da conversa (o lead já existe quando o fechamento
 * dispara — gate identify/qualify criou). O caller injeta no input do
 * startContract pra a proposta nascer VINCULADA e a raia avançar. Null quando
 * a conversa ainda não tem lead (raro no caminho web — o fechamento exige reveal,
 * que vem depois do identify que já cria o lead).
 */
export async function getLeadIdForConversation(conversationId: string): Promise<string | null> {
	const lead = await db.query.leads.findFirst({
		where: eq(leads.conversationId, conversationId),
		columns: { id: true },
	});
	return lead?.id ?? null;
}

const STAGE_ORDER: Record<"novo" | TrackableStage, number> = {
	novo: 0,
	engajado: 1,
	qualificado: 2,
};

/**
 * Records the highest funnel stage the user reached during the AI conversation
 * (before any lead row is created). Saved to `conversations.metadata.maxStageReached`.
 *
 * If a lead already exists for the conversation, also transitions it immediately.
 * Otherwise the stage is applied later via `applyTrackedStageToLead` when the
 * lead is finally inserted (form submit, handoff, etc.).
 *
 * Forward-only: never regresses a stage.
 */
export async function recordStageReached(
	conversationId: string,
	stage: TrackableStage,
): Promise<void> {
	try {
		const meta = await reloadMeta(conversationId);
		const current = meta.maxStageReached ?? "novo";
		if (STAGE_ORDER[stage] > STAGE_ORDER[current]) {
			await persistMeta(conversationId, { ...meta, maxStageReached: stage });
		}

		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, conversationId),
		});
		// Lead simulado também movimenta stage: a pipeline agora mostra leads
		// simulados (demo path pro stakeholder). Dashboard de métricas continua
		// filtrando is_simulated=false separadamente.
		if (lead) {
			await transitionLeadStage(lead.id, stage, { type: "system" }, { onlyAdvance: true });
		}
	} catch (err) {
		console.error("[lead-stage-tracker] recordStageReached failed:", err);
	}
}

/**
 * Helper único pra criar lead a partir de uma conversation. Garante:
 * - Lead herda `is_simulated` da conversation (rastreabilidade preservada
 *   pra dashboard de métricas, que ainda filtra is_simulated=false).
 * - `applyTrackedStageToLead` (que move o lead pro stage máximo) é chamado
 *   sempre — incluindo conversas simuladas, já que pipeline mostra ambos.
 *
 * Use em TODOS os call sites que criam lead novo: /api/leads (web form),
 * proxy.handoffToAgents (WhatsApp interest/playbook), lead-collection (discovery),
 * tool `capture_lead`. Centralizar aqui mantém comportamento consistente.
 */
export async function createLeadFromConversation(opts: {
	conversationId: string;
	name: string | null;
	phone: string | null;
	email: string | null;
}): Promise<{ leadId: string; isSimulated: boolean }> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, opts.conversationId),
		columns: { isSimulated: true },
	});
	const isSimulated = conv?.isSimulated ?? false;

	const [created] = await db
		.insert(leads)
		.values({
			conversationId: opts.conversationId,
			name: opts.name,
			phone: opts.phone,
			email: opts.email,
			isSimulated,
		})
		.returning();

	await applyTrackedStageToLead(opts.conversationId, created.id);

	// FIX-42: religa o cliente unificado. Resolve por phone/email/name e grava
	// contactId no lead e na conversa. Não bloqueia a criação do lead.
	if (opts.phone || opts.email) {
		await attachContact({
			conversationId: opts.conversationId,
			leadId: created.id,
			input: { phone: opts.phone, email: opts.email, name: opts.name },
		});
	}

	return { leadId: created.id, isSimulated };
}

/**
 * Reads `maxStageReached` from conversation metadata and applies it to a freshly
 * created lead, so the lead lands in the correct kanban column instead of "novo".
 *
 * Call this immediately after `db.insert(leads).values(...)` in any path that
 * creates a lead from a conversation that may have progressed before the lead
 * row existed (web form submit, WhatsApp handoff, capture_lead, lead-collection).
 */
export async function applyTrackedStageToLead(
	conversationId: string,
	leadId: string,
): Promise<void> {
	try {
		const meta = await reloadMeta(conversationId);
		if (!meta.maxStageReached) return;
		await transitionLeadStage(
			leadId,
			meta.maxStageReached,
			{ type: "system" },
			{ onlyAdvance: true },
		);
	} catch (err) {
		console.error("[lead-stage-tracker] applyTrackedStageToLead failed:", err);
	}
}

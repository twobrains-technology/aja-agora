/**
 * Dispatcher — funções PURAS que decidem se um lead_event dispara
 * automações ativas.
 *
 * Não toca DB nem queue. O caller é o processor `evaluate` no worker
 * (Fase 4 — src/worker/processors/evaluate.ts) que:
 *  1. Carrega automações enabled do DB
 *  2. Chama matchesTrigger() pra filtrar
 *  3. Chama buildDedupKey() pra cada match
 *  4. Cria row em automation_runs (UNIQUE em dedup_key faz idempotência)
 *  5. Enfileira primeiro step
 */
import type { LeadStage } from "@/lib/admin/lead-stages";

export type AutomationTriggerType = "stage_changed" | "idle_in_stage" | "chat_event";

export interface StoredAutomation {
	id: string;
	enabled: boolean;
	triggerType: AutomationTriggerType;
	triggerConfig: Record<string, unknown>;
}

export type TriggerEvent =
	| { kind: "stage_changed"; fromStage: LeadStage | null; toStage: LeadStage }
	| { kind: "idle_in_stage"; stage: LeadStage; idleMs: number }
	| { kind: "chat_event"; eventType: "no_reply" | "asked_for_human" };

// ─── matchesTrigger ─────────────────────────────────────────────────────────

export function matchesTrigger(auto: StoredAutomation, event: TriggerEvent): boolean {
	if (!auto.enabled) return false;
	if (auto.triggerType !== event.kind) return false;

	if (event.kind === "stage_changed") {
		const cfg = auto.triggerConfig as {
			fromStages?: LeadStage[];
			toStages: LeadStage[];
		};
		if (!cfg.toStages.includes(event.toStage)) return false;
		if (cfg.fromStages && cfg.fromStages.length > 0) {
			if (!event.fromStage) return false;
			if (!cfg.fromStages.includes(event.fromStage)) return false;
		}
		return true;
	}

	if (event.kind === "idle_in_stage") {
		const cfg = auto.triggerConfig as { stage: LeadStage; durationMs: number };
		if (cfg.stage !== event.stage) return false;
		return event.idleMs >= cfg.durationMs;
	}

	if (event.kind === "chat_event") {
		const cfg = auto.triggerConfig as { eventType: "no_reply" | "asked_for_human" };
		return cfg.eventType === event.eventType;
	}

	return false;
}

// ─── buildDedupKey ──────────────────────────────────────────────────────────

export type DedupSource =
	| { kind: "stage_changed"; leadEventId: string }
	| { kind: "idle_in_stage"; stage: LeadStage; windowStartIso: string }
	| { kind: "chat_event"; eventId: string };

export function buildDedupKey(input: {
	automationId: string;
	leadId: string;
	source: DedupSource;
}): string {
	const { automationId: a, leadId: l, source } = input;
	if (source.kind === "stage_changed") {
		return `stage:${a}:${l}:${source.leadEventId}`;
	}
	if (source.kind === "idle_in_stage") {
		return `idle:${a}:${l}:${source.stage}:${source.windowStartIso}`;
	}
	return `chat:${a}:${l}:${source.eventId}`;
}

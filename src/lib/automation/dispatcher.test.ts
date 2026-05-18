/**
 * Dispatcher — decide quais automações um lead_event dispara.
 *
 * Cobre:
 *  - CA-P0-02: stage_changed match → enqueue
 *  - CA-P1-05: idempotência via dedup key
 *  - CA-P1-15: múltiplas automações no mesmo trigger
 *  - PF-08: dedup key contém automation_id pra não colidir
 */
import { describe, expect, it } from "vitest";
import { buildDedupKey, matchesTrigger, type StoredAutomation } from "./dispatcher";

const baseAuto = (overrides: Partial<StoredAutomation> = {}): StoredAutomation => ({
	id: "auto-1",
	enabled: true,
	triggerType: "stage_changed",
	triggerConfig: { toStages: ["qualificado"] },
	...overrides,
});

describe("matchesTrigger — stage_changed", () => {
	it("match quando toStage está em toStages", () => {
		const auto = baseAuto({ triggerConfig: { toStages: ["qualificado"] } });
		expect(
			matchesTrigger(auto, {
				kind: "stage_changed",
				fromStage: "engajado",
				toStage: "qualificado",
			}),
		).toBe(true);
	});

	it("não match quando toStage não está em toStages", () => {
		const auto = baseAuto({ triggerConfig: { toStages: ["qualificado"] } });
		expect(
			matchesTrigger(auto, {
				kind: "stage_changed",
				fromStage: "engajado",
				toStage: "em_negociacao",
			}),
		).toBe(false);
	});

	it("respeita fromStages quando configurado", () => {
		const auto = baseAuto({
			triggerConfig: { fromStages: ["engajado"], toStages: ["qualificado"] },
		});
		expect(
			matchesTrigger(auto, {
				kind: "stage_changed",
				fromStage: "novo",
				toStage: "qualificado",
			}),
		).toBe(false);
		expect(
			matchesTrigger(auto, {
				kind: "stage_changed",
				fromStage: "engajado",
				toStage: "qualificado",
			}),
		).toBe(true);
	});

	it("não match se automação está disabled", () => {
		const auto = baseAuto({ enabled: false });
		expect(
			matchesTrigger(auto, {
				kind: "stage_changed",
				fromStage: "engajado",
				toStage: "qualificado",
			}),
		).toBe(false);
	});

	it("não match trigger de outro tipo", () => {
		const auto = baseAuto({ triggerType: "idle_in_stage" });
		expect(
			matchesTrigger(auto, {
				kind: "stage_changed",
				fromStage: "engajado",
				toStage: "qualificado",
			}),
		).toBe(false);
	});
});

describe("matchesTrigger — idle_in_stage", () => {
	const auto: StoredAutomation = {
		id: "auto-idle",
		enabled: true,
		triggerType: "idle_in_stage",
		triggerConfig: { stage: "qualificado", durationMs: 86_400_000 }, // 24h
	};

	it("match quando lead idle no stage configurado por >= durationMs", () => {
		expect(
			matchesTrigger(auto, {
				kind: "idle_in_stage",
				stage: "qualificado",
				idleMs: 90_000_000,
			}),
		).toBe(true);
	});

	it("não match se idle < durationMs", () => {
		expect(
			matchesTrigger(auto, {
				kind: "idle_in_stage",
				stage: "qualificado",
				idleMs: 1000,
			}),
		).toBe(false);
	});

	it("não match se stage diferente", () => {
		expect(
			matchesTrigger(auto, {
				kind: "idle_in_stage",
				stage: "novo",
				idleMs: 90_000_000,
			}),
		).toBe(false);
	});
});

describe("buildDedupKey (PF-08)", () => {
	it("inclui automation_id, lead_id e event_id pra stage_changed", () => {
		const key = buildDedupKey({
			automationId: "a1",
			leadId: "l1",
			source: { kind: "stage_changed", leadEventId: "evt-1" },
		});
		expect(key).toBe("stage:a1:l1:evt-1");
	});

	it("difere entre automações pro mesmo evento (CA-P1-15)", () => {
		const k1 = buildDedupKey({
			automationId: "a1",
			leadId: "l1",
			source: { kind: "stage_changed", leadEventId: "evt-1" },
		});
		const k2 = buildDedupKey({
			automationId: "a2",
			leadId: "l1",
			source: { kind: "stage_changed", leadEventId: "evt-1" },
		});
		expect(k1).not.toBe(k2);
	});

	it("inclui window pra idle_in_stage (não dispara amanhã de novo)", () => {
		const key = buildDedupKey({
			automationId: "a1",
			leadId: "l1",
			source: {
				kind: "idle_in_stage",
				stage: "qualificado",
				windowStartIso: "2026-05-17T00:00:00Z",
			},
		});
		expect(key).toBe("idle:a1:l1:qualificado:2026-05-17T00:00:00Z");
	});

	it("dois disparos do mesmo evento geram MESMA key (idempotência)", () => {
		const opts = {
			automationId: "a1",
			leadId: "l1",
			source: { kind: "stage_changed" as const, leadEventId: "evt-1" },
		};
		expect(buildDedupKey(opts)).toBe(buildDedupKey(opts));
	});
});

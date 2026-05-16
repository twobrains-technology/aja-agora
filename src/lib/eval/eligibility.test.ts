import { describe, expect, it } from "vitest";
import { isEligibleForEval } from "./eligibility";

const NOW = new Date("2026-05-08T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

describe("isEligibleForEval", () => {
	it("rejeita 1 turn (abaixo do threshold)", () => {
		const r = isEligibleForEval(
			{ status: "active", updatedAt: hoursAgo(20), userTurnCount: 1 },
			NOW,
		);
		expect(r.eligible).toBe(false);
		expect(r.reason).toContain("< 4 requeridos");
	});

	it("rejeita 3 turns + active + idle 13h (abaixo do threshold)", () => {
		const r = isEligibleForEval(
			{ status: "active", updatedAt: hoursAgo(13), userTurnCount: 3 },
			NOW,
		);
		expect(r.eligible).toBe(false);
		expect(r.reason).toContain("< 4 requeridos");
	});

	it("rejeita 4 turns + active + idle 6h (idle curto demais)", () => {
		const r = isEligibleForEval(
			{ status: "active", updatedAt: hoursAgo(6), userTurnCount: 4 },
			NOW,
		);
		expect(r.eligible).toBe(false);
		expect(r.reason).toContain("< 12h");
	});

	it("aceita 4 turns + active + idle 13h", () => {
		const r = isEligibleForEval(
			{ status: "active", updatedAt: hoursAgo(13), userTurnCount: 4 },
			NOW,
		);
		expect(r.eligible).toBe(true);
		expect(r.reason).toContain("active");
	});

	it("rejeita 4 turns + handed_off + idle 30h (curto pra handoff)", () => {
		const r = isEligibleForEval(
			{ status: "handed_off", updatedAt: hoursAgo(30), userTurnCount: 4 },
			NOW,
		);
		expect(r.eligible).toBe(false);
		expect(r.reason).toContain("< 48h");
	});

	it("aceita 4 turns + handed_off + idle 50h", () => {
		const r = isEligibleForEval(
			{ status: "handed_off", updatedAt: hoursAgo(50), userTurnCount: 4 },
			NOW,
		);
		expect(r.eligible).toBe(true);
		expect(r.reason).toContain("handed_off");
	});

	it("aceita closed + idle suficiente (mesmas regras de active)", () => {
		const r = isEligibleForEval(
			{ status: "closed", updatedAt: hoursAgo(15), userTurnCount: 6 },
			NOW,
		);
		expect(r.eligible).toBe(true);
		expect(r.reason).toContain("closed");
	});

	it("forceImmediate: aceita mesmo com idle 0 quando turnos suficientes", () => {
		const r = isEligibleForEval({ status: "active", updatedAt: NOW, userTurnCount: 4 }, NOW, {
			forceImmediate: true,
		});
		expect(r.eligible).toBe(true);
		expect(r.reason).toContain("idle bypass");
	});

	it("forceImmediate: ainda rejeita se < 4 turnos", () => {
		const r = isEligibleForEval({ status: "active", updatedAt: NOW, userTurnCount: 2 }, NOW, {
			forceImmediate: true,
		});
		expect(r.eligible).toBe(false);
		expect(r.reason).toContain("< 4 requeridos");
	});
});

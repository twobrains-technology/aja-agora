// src/lib/utils/simulator-clock.test.ts

import { describe, expect, it } from "vitest";
import { getCurrentClockOffset, runWithSimulatorClock, simulatorNow } from "./simulator-clock";

describe("simulatorNow / runWithSimulatorClock", () => {
	it("fora de scope → retorna new Date() real (diff < 50ms)", () => {
		const before = Date.now();
		const sim = simulatorNow().getTime();
		const after = Date.now();
		expect(sim).toBeGreaterThanOrEqual(before);
		expect(sim).toBeLessThanOrEqual(after + 50);
	});

	it("getCurrentClockOffset fora de scope → 0", () => {
		expect(getCurrentClockOffset()).toBe(0);
	});

	it("dentro de runWithSimulatorClock(+5d) → simulatorNow está 5d à frente", () => {
		const fiveDays = 5 * 86_400_000;
		runWithSimulatorClock({ offsetMs: fiveDays, conversationId: "c1" }, () => {
			const real = Date.now();
			const sim = simulatorNow().getTime();
			expect(sim).toBeGreaterThanOrEqual(real + fiveDays - 50);
			expect(sim).toBeLessThanOrEqual(real + fiveDays + 50);
			expect(getCurrentClockOffset()).toBe(fiveDays);
		});
	});

	it("scope aninhado → inner sobrescreve outer", () => {
		runWithSimulatorClock({ offsetMs: 86_400_000, conversationId: "outer" }, () => {
			expect(getCurrentClockOffset()).toBe(86_400_000);
			runWithSimulatorClock({ offsetMs: 5 * 86_400_000, conversationId: "inner" }, () => {
				expect(getCurrentClockOffset()).toBe(5 * 86_400_000);
			});
			// volta ao outer
			expect(getCurrentClockOffset()).toBe(86_400_000);
		});
	});

	it("após scope retornar, fora volta a 0", () => {
		runWithSimulatorClock({ offsetMs: 86_400_000, conversationId: "c" }, () => {
			expect(getCurrentClockOffset()).toBe(86_400_000);
		});
		expect(getCurrentClockOffset()).toBe(0);
	});

	it("propaga por await (Promise dentro do scope)", async () => {
		const offset = 7 * 86_400_000;
		await runWithSimulatorClock({ offsetMs: offset, conversationId: "c" }, async () => {
			await new Promise((r) => setTimeout(r, 5));
			expect(getCurrentClockOffset()).toBe(offset);
			const sim = simulatorNow().getTime();
			expect(sim).toBeGreaterThan(Date.now() + offset - 100);
		});
	});

	it("propaga em promise não-awaited (fire-and-forget) capturada externamente", async () => {
		const offset = 3 * 86_400_000;
		let capturedOffsetInside = -1;
		const trailing = runWithSimulatorClock({ offsetMs: offset, conversationId: "c" }, () => {
			return new Promise<void>((resolve) => {
				setTimeout(() => {
					capturedOffsetInside = getCurrentClockOffset();
					resolve();
				}, 20);
			});
		});
		// fora do scope síncrono, ainda assim a promise interna mantém ALS
		await trailing;
		expect(capturedOffsetInside).toBe(offset);
	});

	it("offsetMs=0 funciona (no-op explícito)", () => {
		runWithSimulatorClock({ offsetMs: 0, conversationId: "c" }, () => {
			expect(getCurrentClockOffset()).toBe(0);
			const real = Date.now();
			const sim = simulatorNow().getTime();
			expect(Math.abs(sim - real)).toBeLessThan(50);
		});
	});
});

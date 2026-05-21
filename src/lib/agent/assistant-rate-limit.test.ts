import { beforeEach, describe, expect, it } from "vitest";
import { _resetForTests, rateLimit } from "./assistant-rate-limit";

describe("assistant-rate-limit", () => {
	beforeEach(() => _resetForTests());

	it("permite até 10 requests por minuto", () => {
		for (let i = 0; i < 10; i++) {
			expect(rateLimit("user-1").allowed).toBe(true);
		}
	});

	it("bloqueia 11º request na mesma janela", () => {
		for (let i = 0; i < 10; i++) rateLimit("user-1");
		expect(rateLimit("user-1").allowed).toBe(false);
	});

	it("isola users", () => {
		for (let i = 0; i < 10; i++) rateLimit("user-1");
		expect(rateLimit("user-2").allowed).toBe(true);
	});

	it("retorna retryAfterMs quando bloqueia", () => {
		for (let i = 0; i < 10; i++) rateLimit("user-1");
		const r = rateLimit("user-1");
		expect(r.allowed).toBe(false);
		expect(r.retryAfterMs).toBeGreaterThan(0);
		expect(r.retryAfterMs).toBeLessThanOrEqual(60_000);
	});
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { generateId } from "./id";

describe("generateId (bug #01: crypto.randomUUID em non-secure context)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("retorna UUID v4 quando crypto.randomUUID está disponível (secure context)", () => {
		const id = generateId();
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	});

	it("gera fallback UUID v4 quando crypto.randomUUID é undefined (non-secure context HTTP)", () => {
		vi.stubGlobal("crypto", { ...crypto, randomUUID: undefined });
		const id = generateId();
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	});

	it("gera fallback quando crypto inteiro é undefined", () => {
		vi.stubGlobal("crypto", undefined);
		const id = generateId();
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	});

	it("gera IDs únicos em chamadas sucessivas (smoke 1000x)", () => {
		const ids = new Set<string>();
		for (let i = 0; i < 1000; i++) ids.add(generateId());
		expect(ids.size).toBe(1000);
	});

	it("gera IDs únicos no fallback também (smoke 1000x sem crypto.randomUUID)", () => {
		vi.stubGlobal("crypto", { ...crypto, randomUUID: undefined });
		const ids = new Set<string>();
		for (let i = 0; i < 1000; i++) ids.add(generateId());
		expect(ids.size).toBe(1000);
	});
});

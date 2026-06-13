import { afterEach, describe, expect, it, vi } from "vitest";
import { generateId, isUuid } from "./id";

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

describe("isUuid (validator pra prevenir 22P02 em handlers de API)", () => {
	it("aceita UUID v4 gerado pelo generateId", () => {
		for (let i = 0; i < 100; i++) {
			expect(isUuid(generateId())).toBe(true);
		}
	});

	it("aceita UUIDs v1-v5 conhecidos", () => {
		// v1, v4, v5 samples
		expect(isUuid("c5a9c6e8-9b62-11ee-b9d1-0242ac120002")).toBe(true);
		expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
		expect(isUuid("a82c2b1f-7e9d-5b3a-9c4e-1234567890ab")).toBe(true);
	});

	it("rejeita strings inválidas (bug QA DEV /api/chat)", () => {
		expect(isUuid("test-qa-001")).toBe(false);
		expect(isUuid("")).toBe(false);
		expect(isUuid("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx")).toBe(false);
		expect(isUuid("123")).toBe(false);
		// versão 6 (não suportada)
		expect(isUuid("550e8400-e29b-61d4-a716-446655440000")).toBe(false);
	});

	it("rejeita não-string", () => {
		expect(isUuid(null)).toBe(false);
		expect(isUuid(undefined)).toBe(false);
		expect(isUuid(123)).toBe(false);
		expect(isUuid({})).toBe(false);
	});
});

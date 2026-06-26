// src/lib/memory/index.test.ts
//
// Unit tests pro factory da camada de memória (FIX-81). Sem circuit breaker —
// a memória vive no mesmo Postgres do app; o contrato best-effort mora dentro
// do adapter. Estratégia: stub de env (MEMORY_ADAPTER).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
	vi.resetModules();
	vi.unstubAllEnvs();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("getMemoryAdapter — modo via env", () => {
	it("MEMORY_ADAPTER=noop → NoopMemoryAdapter", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "noop");
		const { getMemoryAdapter, resetMemoryAdapter, NoopMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		const a = getMemoryAdapter();
		expect(a).toBeInstanceOf(NoopMemoryAdapter);
		expect(a.isPersistent()).toBe(false);
	});

	it("MEMORY_ADAPTER=postgres → PostgresMemoryAdapter", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "postgres");
		const { getMemoryAdapter, resetMemoryAdapter, PostgresMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		const a = getMemoryAdapter();
		expect(a).toBeInstanceOf(PostgresMemoryAdapter);
		expect(a.isPersistent()).toBe(true);
	});

	it("MEMORY_ADAPTER ausente → default postgres", async () => {
		// eslint-disable-next-line no-process-env
		delete process.env.MEMORY_ADAPTER;
		const { getMemoryAdapter, resetMemoryAdapter, PostgresMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		const a = getMemoryAdapter();
		expect(a).toBeInstanceOf(PostgresMemoryAdapter);
	});

	it("MEMORY_ADAPTER=valor-invalido → warn + fallback postgres", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "blabla");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { getMemoryAdapter, resetMemoryAdapter, PostgresMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		const a = getMemoryAdapter();
		expect(a).toBeInstanceOf(PostgresMemoryAdapter);
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown MEMORY_ADAPTER"));
	});

	it("singleton: 2 chamadas seguidas retornam mesma instance", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "postgres");
		const { getMemoryAdapter, resetMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		const a = getMemoryAdapter();
		const b = getMemoryAdapter();
		expect(a).toBe(b);
	});

	it("getMemoryAdapter é síncrono (retorna imediatamente, sem await)", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "postgres");
		const { getMemoryAdapter, resetMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		const start = Date.now();
		getMemoryAdapter();
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(50);
	});
});

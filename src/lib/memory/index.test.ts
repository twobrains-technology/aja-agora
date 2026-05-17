// src/lib/memory/index.test.ts
//
// Unit tests pro factory + circuit breaker. Plano §3.6.
//
// Estratégia: stubando env (MEMORY_ADAPTER) e mockando lettaHealthCheck pra
// não bater na rede.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetLettaCircuit } from "./circuit-state";

beforeEach(() => {
	vi.resetModules();
	resetLettaCircuit();
	vi.unstubAllEnvs();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	resetLettaCircuit();
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

	it("MEMORY_ADAPTER=letta → LettaMemoryAdapter", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "letta");
		// Mock health check pra evitar fetch real
		vi.doMock("./letta-client", async () => {
			const actual = await vi.importActual<typeof import("./letta-client")>(
				"./letta-client",
			);
			return { ...actual, lettaHealthCheck: vi.fn().mockResolvedValue(true) };
		});
		const { getMemoryAdapter, resetMemoryAdapter, LettaMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		const a = getMemoryAdapter();
		expect(a).toBeInstanceOf(LettaMemoryAdapter);
		expect(a.isPersistent()).toBe(true);
		vi.doUnmock("./letta-client");
	});

	it("MEMORY_ADAPTER ausente → default letta", async () => {
		// eslint-disable-next-line no-process-env
		delete process.env.MEMORY_ADAPTER;
		vi.doMock("./letta-client", async () => {
			const actual = await vi.importActual<typeof import("./letta-client")>(
				"./letta-client",
			);
			return { ...actual, lettaHealthCheck: vi.fn().mockResolvedValue(true) };
		});
		const { getMemoryAdapter, resetMemoryAdapter, LettaMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		const a = getMemoryAdapter();
		expect(a).toBeInstanceOf(LettaMemoryAdapter);
		vi.doUnmock("./letta-client");
	});

	it("MEMORY_ADAPTER=valor-invalido → warn + fallback letta", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "blabla");
		vi.doMock("./letta-client", async () => {
			const actual = await vi.importActual<typeof import("./letta-client")>(
				"./letta-client",
			);
			return { ...actual, lettaHealthCheck: vi.fn().mockResolvedValue(true) };
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { getMemoryAdapter, resetMemoryAdapter, LettaMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		const a = getMemoryAdapter();
		expect(a).toBeInstanceOf(LettaMemoryAdapter);
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown MEMORY_ADAPTER"));
		vi.doUnmock("./letta-client");
	});

	it("singleton: 2 chamadas seguidas retornam mesma instance", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "letta");
		vi.doMock("./letta-client", async () => {
			const actual = await vi.importActual<typeof import("./letta-client")>(
				"./letta-client",
			);
			return { ...actual, lettaHealthCheck: vi.fn().mockResolvedValue(true) };
		});
		const { getMemoryAdapter, resetMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		const a = getMemoryAdapter();
		const b = getMemoryAdapter();
		expect(a).toBe(b);
		vi.doUnmock("./letta-client");
	});

	it("modo noop NÃO chama health check", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "noop");
		const healthSpy = vi.fn().mockResolvedValue(true);
		vi.doMock("./letta-client", async () => {
			const actual = await vi.importActual<typeof import("./letta-client")>(
				"./letta-client",
			);
			return { ...actual, lettaHealthCheck: healthSpy };
		});
		const { getMemoryAdapter, resetMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		getMemoryAdapter();
		// micro-task tick — health check é fire-and-forget
		await new Promise((r) => setTimeout(r, 10));
		expect(healthSpy).not.toHaveBeenCalled();
		vi.doUnmock("./letta-client");
	});
});

describe("circuit breaker integration via getMemoryAdapter", () => {
	it("circuito aberto → retorna Noop mesmo com MEMORY_ADAPTER=letta", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "letta");
		vi.doMock("./letta-client", async () => {
			const actual = await vi.importActual<typeof import("./letta-client")>(
				"./letta-client",
			);
			return { ...actual, lettaHealthCheck: vi.fn().mockResolvedValue(true) };
		});
		const { getMemoryAdapter, resetMemoryAdapter, NoopMemoryAdapter } = await import("./index");
		const circuit = await import("./circuit-state");
		resetMemoryAdapter();

		// 1ª chamada: circuito fechado → LettaAdapter
		const first = getMemoryAdapter();
		expect(first.isPersistent()).toBe(true);

		// Força circuito aberto
		circuit.markLettaFailure("err1");
		circuit.markLettaFailure("err2");
		expect(circuit.isLettaCircuitOpen()).toBe(true);

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const second = getMemoryAdapter();
		expect(second).toBeInstanceOf(NoopMemoryAdapter);
		// Aviso de fallback foi logado
		const calls = warnSpy.mock.calls.flat().join(" ");
		expect(calls).toMatch(/fallback_triggered/i);
		vi.doUnmock("./letta-client");
	});

	it("recover: circuito fecha após markLettaSuccess explícito", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "letta");
		vi.doMock("./letta-client", async () => {
			const actual = await vi.importActual<typeof import("./letta-client")>(
				"./letta-client",
			);
			return { ...actual, lettaHealthCheck: vi.fn().mockResolvedValue(true) };
		});
		const { getMemoryAdapter, resetMemoryAdapter, LettaMemoryAdapter } = await import("./index");
		const circuit = await import("./circuit-state");
		resetMemoryAdapter();

		// Abre circuito
		circuit.markLettaFailure("e1");
		circuit.markLettaFailure("e2");
		expect(circuit.isLettaCircuitOpen()).toBe(true);

		// Sucesso de outra fonte (ex: chamada paralela) — fecha circuito
		circuit.markLettaSuccess();
		expect(circuit.isLettaCircuitOpen()).toBe(false);

		const a = getMemoryAdapter();
		expect(a).toBeInstanceOf(LettaMemoryAdapter);
		vi.doUnmock("./letta-client");
	});

	it("getMemoryAdapter é síncrono (retorna imediatamente, sem await)", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "letta");
		vi.doMock("./letta-client", async () => {
			const actual = await vi.importActual<typeof import("./letta-client")>(
				"./letta-client",
			);
			// Health check propositalmente "lento" pra garantir que getMemoryAdapter não bloqueia
			return {
				...actual,
				lettaHealthCheck: vi.fn(
					() => new Promise((resolve) => setTimeout(() => resolve(true), 500)),
				),
			};
		});
		const { getMemoryAdapter, resetMemoryAdapter } = await import("./index");
		resetMemoryAdapter();
		const start = Date.now();
		getMemoryAdapter();
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(50);
		vi.doUnmock("./letta-client");
	});
});

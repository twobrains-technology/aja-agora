// src/lib/memory/letta-client.test.ts
//
// Unit tests pro cliente HTTP REST. Plano §3.4 — mock fetch/dns.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	lettaFetch,
	lettaHealthCheck,
	resetLettaBaseUrlCache,
	resolveLettaBaseUrl,
} from "./letta-client";
import { MemoryError, MemoryTimeoutError } from "./types";

// Mock node:dns/promises pra controlar SRV resolution
vi.mock("node:dns/promises", () => ({
	default: {
		resolveSrv: vi.fn(),
		resolve4: vi.fn(),
	},
}));

const dns = await import("node:dns/promises");

describe("resolveLettaBaseUrl", () => {
	beforeEach(() => {
		resetLettaBaseUrlCache();
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		resetLettaBaseUrlCache();
		vi.clearAllMocks();
	});

	it("retorna LETTA_BASE_URL quando setado, SEM consultar dns", async () => {
		vi.stubEnv("LETTA_BASE_URL", "http://localhost:8283");
		vi.stubEnv("LETTA_SRV_NAME", "");

		const url = await resolveLettaBaseUrl();
		expect(url).toBe("http://localhost:8283");
		expect(dns.default.resolveSrv).not.toHaveBeenCalled();
	});

	it("usa LETTA_SRV_NAME quando LETTA_BASE_URL ausente", async () => {
		// eslint-disable-next-line no-process-env
		delete process.env.LETTA_BASE_URL;
		vi.stubEnv("LETTA_SRV_NAME", "letta-srv.tb.local");
		vi.mocked(dns.default.resolveSrv).mockResolvedValueOnce([
			{ name: "letta.local", port: 8080, priority: 1, weight: 10 },
		]);
		vi.mocked(dns.default.resolve4).mockResolvedValueOnce(["10.0.0.1"]);

		const url = await resolveLettaBaseUrl();
		expect(url).toBe("http://10.0.0.1:8080");
	});

	it("ordena SRV por priority asc + weight desc, pega o primeiro", async () => {
		// eslint-disable-next-line no-process-env
		delete process.env.LETTA_BASE_URL;
		vi.stubEnv("LETTA_SRV_NAME", "letta-srv.tb.local");
		vi.mocked(dns.default.resolveSrv).mockResolvedValueOnce([
			{ name: "host-b.local", port: 8081, priority: 10, weight: 50 },
			{ name: "host-a.local", port: 8080, priority: 1, weight: 100 },
			{ name: "host-c.local", port: 8082, priority: 1, weight: 50 },
		]);
		vi.mocked(dns.default.resolve4).mockResolvedValueOnce(["10.0.0.5"]);

		const url = await resolveLettaBaseUrl();
		// Priority 1 ganha; entre os dois priority=1, weight=100 (desc) → host-a, port 8080
		expect(url).toBe("http://10.0.0.5:8080");
	});

	it("throw MemoryError quando nenhum env setado", async () => {
		// eslint-disable-next-line no-process-env
		delete process.env.LETTA_BASE_URL;
		// eslint-disable-next-line no-process-env
		delete process.env.LETTA_SRV_NAME;

		await expect(resolveLettaBaseUrl()).rejects.toThrow(MemoryError);
		await expect(resolveLettaBaseUrl()).rejects.toThrow(
			/Letta endpoint not configured/,
		);
	});

	it("throw quando SRV retorna 0 registros", async () => {
		// eslint-disable-next-line no-process-env
		delete process.env.LETTA_BASE_URL;
		vi.stubEnv("LETTA_SRV_NAME", "letta-srv.tb.local");
		vi.mocked(dns.default.resolveSrv).mockResolvedValueOnce([]);

		await expect(resolveLettaBaseUrl()).rejects.toThrow(/0 records/);
	});

	it("throw quando A record retorna 0 IPs", async () => {
		// eslint-disable-next-line no-process-env
		delete process.env.LETTA_BASE_URL;
		vi.stubEnv("LETTA_SRV_NAME", "letta-srv.tb.local");
		vi.mocked(dns.default.resolveSrv).mockResolvedValueOnce([
			{ name: "letta.local", port: 8080, priority: 1, weight: 10 },
		]);
		vi.mocked(dns.default.resolve4).mockResolvedValueOnce([]);

		await expect(resolveLettaBaseUrl()).rejects.toThrow(/0 IPs/);
	});
});

describe("lettaFetch", () => {
	beforeEach(() => {
		resetLettaBaseUrlCache();
		vi.unstubAllEnvs();
		vi.stubEnv("LETTA_BASE_URL", "http://localhost:8283");
		vi.stubEnv("LETTA_API_KEY", "test-key");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("throw quando LETTA_API_KEY ausente", async () => {
		// eslint-disable-next-line no-process-env
		delete process.env.LETTA_API_KEY;
		await expect(lettaFetch("/x")).rejects.toThrow(/LETTA_API_KEY not configured/);
	});

	it("GET 200 OK retorna JSON parseado", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response(JSON.stringify({ foo: "bar" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			),
		);
		const data = await lettaFetch<{ foo: string }>("/v1/anything");
		expect(data).toEqual({ foo: "bar" });
	});

	it("adiciona Authorization: Bearer <key>", async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
			new Response(JSON.stringify({}), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		await lettaFetch("/v1/anything");
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer test-key");
	});

	it("adiciona Content-Type: application/json", async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
			new Response(JSON.stringify({}), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		await lettaFetch("/v1/anything");
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");
	});

	it("preserva headers customizados", async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
			new Response(JSON.stringify({}), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		await lettaFetch("/v1/anything", { headers: { "X-Trace": "abc" } });
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers["X-Trace"]).toBe("abc");
		// Default headers ainda presentes
		expect(headers.Authorization).toBe("Bearer test-key");
	});

	it("204 No Content retorna undefined (sem .json())", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 204 })),
		);
		const data = await lettaFetch("/v1/empty");
		expect(data).toBeUndefined();
	});

	it("500 com body lança MemoryError com mensagem incluindo status + body", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("oops", { status: 500 })),
		);
		await expect(lettaFetch("/v1/fail")).rejects.toThrow(/500.*oops/);
		await expect(lettaFetch("/v1/fail")).rejects.toBeInstanceOf(MemoryError);
	});

	it("404 lança MemoryError", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("not found", { status: 404 })),
		);
		await expect(lettaFetch("/v1/none")).rejects.toThrow(/404/);
	});

	it("timeout via AbortController throw MemoryTimeoutError", async () => {
		// Implementação que respeita signal.abort
		const fetchMock = vi.fn(
			(_url: string, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					const signal = init?.signal;
					if (signal) {
						signal.addEventListener("abort", () => {
							const err = new Error("aborted");
							err.name = "AbortError";
							reject(err);
						});
					}
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(lettaFetch("/v1/slow", { timeoutMs: 50 })).rejects.toBeInstanceOf(
			MemoryTimeoutError,
		);
	});

	it("AbortError de fetch é mapeado pra MemoryTimeoutError (não MemoryError)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				const err = new Error("aborted");
				err.name = "AbortError";
				throw err;
			}),
		);
		await expect(lettaFetch("/v1/slow", { timeoutMs: 1000 })).rejects.toBeInstanceOf(
			MemoryTimeoutError,
		);
	});

	it("erro genérico de rede (TypeError) → MemoryError com cause", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("network down");
			}),
		);
		try {
			await lettaFetch("/v1/x");
			expect.fail("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(MemoryError);
			expect((err as MemoryError).message).toContain("/v1/x");
			expect((err as MemoryError).cause).toBeInstanceOf(TypeError);
		}
	});
});

describe("lettaHealthCheck", () => {
	beforeEach(() => {
		resetLettaBaseUrlCache();
		vi.unstubAllEnvs();
		vi.stubEnv("LETTA_BASE_URL", "http://localhost:8283");
		vi.stubEnv("LETTA_API_KEY", "test-key");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("endpoint OK retorna true", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })),
		);
		expect(await lettaHealthCheck()).toBe(true);
	});

	it("endpoint 500 retorna false (swallow)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("nope", { status: 500 })),
		);
		expect(await lettaHealthCheck()).toBe(false);
	});

	it("timeout retorna false (não throw)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(_url: string, init?: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						const signal = init?.signal;
						if (signal) {
							signal.addEventListener("abort", () => {
								const err = new Error("aborted");
								err.name = "AbortError";
								reject(err);
							});
						}
					}),
			),
		);
		expect(await lettaHealthCheck(50)).toBe(false);
	});
});

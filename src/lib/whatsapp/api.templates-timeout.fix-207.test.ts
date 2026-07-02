// Camada 1 (unit) — FIX-207: createTemplate/listTemplates faziam fetch à Meta
// SEM timeout → egress lento do VPS prendia o worker ~30s até o Cloudflare
// cortar com 502 (html). Devem passar `signal` (AbortSignal.timeout) e traduzir
// o AbortError num erro de timeout claro pra o try/catch da rota devolver 502 JSON.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTemplate, listTemplates } from "./api";

const originalFetch = global.fetch;

beforeEach(() => {
	process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
	process.env.WHATSAPP_WABA_ID = "123456789";
});

afterEach(() => {
	global.fetch = originalFetch;
	vi.restoreAllMocks();
	delete process.env.WHATSAPP_WABA_ID;
});

function abortError() {
	const e = new Error("The operation was aborted");
	e.name = "AbortError";
	return e;
}

describe("FIX-207 — timeout no fetch à Meta (createTemplate/listTemplates)", () => {
	it("createTemplate passa um AbortSignal ao fetch", async () => {
		global.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "t1", status: "PENDING" }), { status: 200 })) as unknown as typeof global.fetch;
		await createTemplate({ name: "x", language: "pt_BR", category: "UTILITY", components: [] });
		const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it("listTemplates passa um AbortSignal ao fetch", async () => {
		global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as unknown as typeof global.fetch;
		await listTemplates();
		const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it("createTemplate rejeita com erro de timeout claro quando o fetch aborta", async () => {
		global.fetch = vi.fn(async () => {
			throw abortError();
		}) as unknown as typeof global.fetch;
		await expect(
			createTemplate({ name: "x", language: "pt_BR", category: "UTILITY", components: [] }),
		).rejects.toThrow(/timeout/i);
	});

	it("listTemplates rejeita com erro de timeout claro quando o fetch aborta", async () => {
		global.fetch = vi.fn(async () => {
			throw abortError();
		}) as unknown as typeof global.fetch;
		await expect(listTemplates()).rejects.toThrow(/timeout/i);
	});
});

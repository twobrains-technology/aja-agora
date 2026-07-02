// Camada 1 (structural) — FIX resiliência: os fetches à Graph API (createTemplate,
// listTemplates) precisam de timeout para não pendurarem ~30s e virarem 502 de
// gateway quando o egress está lento. Asserta que (a) cada fetch recebe um
// AbortSignal, e (b) quando o fetch aborta (AbortError), a função rejeita com
// mensagem CLARA de timeout ao falar com a Meta — nunca pendura nem vaza erro cru.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTemplate, listTemplates } from "./api";

const originalFetch = global.fetch;

beforeEach(() => {
	process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
	process.env.WHATSAPP_WABA_ID = "123456789";
	process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-1";
});

afterEach(() => {
	global.fetch = originalFetch;
	vi.restoreAllMocks();
	delete process.env.WHATSAPP_WABA_ID;
});

function abortError() {
	// Reproduz o que AbortSignal.timeout dispara quando estoura o prazo.
	return new DOMException("The operation was aborted due to timeout", "TimeoutError");
}

describe("FIX resiliência — timeout dos fetches de templates", () => {
	it("createTemplate passa um AbortSignal ao fetch", async () => {
		global.fetch = vi.fn(async () => {
			return new Response(JSON.stringify({ id: "t1", status: "PENDING" }), { status: 200 });
		}) as unknown as typeof global.fetch;

		await createTemplate({ name: "x", language: "pt_BR", category: "UTILITY", components: [] });

		const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it("createTemplate rejeita com mensagem clara de timeout quando o fetch aborta", async () => {
		global.fetch = vi.fn(async () => {
			throw abortError();
		}) as unknown as typeof global.fetch;

		await expect(
			createTemplate({ name: "x", language: "pt_BR", category: "UTILITY", components: [] }),
		).rejects.toThrow(/timeout ao falar com a Meta/i);
	});

	it("listTemplates passa um AbortSignal ao fetch", async () => {
		global.fetch = vi.fn(async () => {
			return new Response(JSON.stringify({ data: [] }), { status: 200 });
		}) as unknown as typeof global.fetch;

		await listTemplates();

		const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it("listTemplates rejeita com mensagem clara de timeout quando o fetch aborta", async () => {
		global.fetch = vi.fn(async () => {
			throw abortError();
		}) as unknown as typeof global.fetch;

		await expect(listTemplates()).rejects.toThrow(/timeout ao falar com a Meta/i);
	});
});

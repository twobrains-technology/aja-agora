/**
 * Lib templates Meta — TDD
 * Cobre CA-P0-04 (submit) + CA-P1-02 (status check) + PF-11 (params ordem).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSubmitPayload, buildTemplateSendComponents, countPlaceholders } from "./templates";

describe("countPlaceholders", () => {
	it("conta placeholders {{1}} {{2}} no body", () => {
		expect(countPlaceholders("Olá {{1}}, lembrete da assembleia {{2}}.")).toBe(2);
	});

	it("conta cada placeholder único uma vez", () => {
		expect(countPlaceholders("Oi {{1}}, {{1}} confirma?")).toBe(1);
	});

	it("retorna 0 sem placeholders", () => {
		expect(countPlaceholders("texto fixo")).toBe(0);
	});

	it("ignora {{texto}} não-numérico", () => {
		expect(countPlaceholders("Oi {{nome}}, número {{2}}")).toBe(1);
	});
});

describe("buildSubmitPayload", () => {
	it("monta payload Meta v21 com body + footer + buttons", () => {
		const payload = buildSubmitPayload({
			name: "boas_vindas",
			category: "UTILITY",
			language: "pt_BR",
			bodyText: "Olá {{1}}, seja bem-vindo!",
			footerText: "Equipe Aja Agora",
			buttons: [{ type: "QUICK_REPLY", text: "Sim, quero" }],
		});
		expect(payload.name).toBe("boas_vindas");
		expect(payload.category).toBe("UTILITY");
		expect(payload.language).toBe("pt_BR");
		const body = payload.components.find((c: { type: string }) => c.type === "BODY");
		expect(body).toBeDefined();
		const footer = payload.components.find((c: { type: string }) => c.type === "FOOTER");
		expect(footer).toBeDefined();
		const btns = payload.components.find((c: { type: string }) => c.type === "BUTTONS");
		expect(btns).toBeDefined();
	});

	it("omite componentes não fornecidos", () => {
		const payload = buildSubmitPayload({
			name: "simples",
			category: "MARKETING",
			language: "pt_BR",
			bodyText: "Texto puro.",
		});
		const types = payload.components.map((c: { type: string }) => c.type);
		expect(types).toEqual(["BODY"]);
	});

	it("rejeita nome com espaço ou maiúsculas", () => {
		expect(() =>
			buildSubmitPayload({
				name: "Boas Vindas",
				category: "UTILITY",
				language: "pt_BR",
				bodyText: "x",
			}),
		).toThrow();
	});
});

describe("buildTemplateSendComponents (PF-11: ordem dos params)", () => {
	it("monta componentes na ordem 1, 2, 3", () => {
		const out = buildTemplateSendComponents({ "1": "João", "2": "R$ 500", "3": "amanhã" });
		expect(out).toEqual([
			{
				type: "body",
				parameters: [
					{ type: "text", text: "João" },
					{ type: "text", text: "R$ 500" },
					{ type: "text", text: "amanhã" },
				],
			},
		]);
	});

	it("preserva ordem mesmo se record vier desordenado", () => {
		const out = buildTemplateSendComponents({ "3": "c", "1": "a", "2": "b" });
		const params = (out[0] as { parameters: Array<{ text: string }> }).parameters;
		expect(params.map((p) => p.text)).toEqual(["a", "b", "c"]);
	});

	it("retorna array vazio sem params", () => {
		expect(buildTemplateSendComponents({})).toEqual([]);
	});

	it("rejeita chave não-numérica", () => {
		expect(() => buildTemplateSendComponents({ name: "x" })).toThrow();
	});
});

// Smoke do client de fetch — só garante que monta URL e usa token.
// O comportamento real (status retornado pela Meta) é E2E.
describe("submitTemplateToMeta (smoke)", () => {
	const originalFetch = globalThis.fetch;
	beforeEach(() => {
		process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "test-waba";
		process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("bate em /v21.0/<waba>/message_templates com Bearer", async () => {
		const fetchSpy = vi.fn(
			async () =>
				new Response(JSON.stringify({ id: "tpl_abc", status: "PENDING" }), { status: 201 }),
		);
		globalThis.fetch = fetchSpy as unknown as typeof fetch;
		const { submitTemplateToMeta } = await import("./templates");
		const result = await submitTemplateToMeta({
			name: "test_tpl",
			category: "UTILITY",
			language: "pt_BR",
			bodyText: "Olá!",
		});
		expect(result).toEqual({ id: "tpl_abc", status: "PENDING" });
		expect(fetchSpy).toHaveBeenCalledOnce();
		const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
		const [url, init] = call;
		expect(url).toContain("/v21.0/test-waba/message_templates");
		expect(init.method).toBe("POST");
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer test-token");
	});
});

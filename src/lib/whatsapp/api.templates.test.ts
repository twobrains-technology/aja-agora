// Camada 1 (structural) — FIX-200: cliente Meta para CRIAR/LISTAR templates.
//
// Bug-alvo: existe sendTemplate() (envio), mas NÃO há como criar/submeter um
// template à Meta nem listá-los (necessário pro poll de reconciliação). Criar
// template é no WABA (WhatsApp Business Account ID), não no PHONE_NUMBER_ID —
// exige a env nova WHATSAPP_WABA_ID.
//
// Estratégia: mockamos global.fetch e assertamos endpoint/método/headers/corpo.
// NUNCA batemos na Graph real. Ver docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.
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

describe("FIX-200 — createTemplate", () => {
	it("faz POST no WABA /message_templates com Bearer e corpo correto", async () => {
		global.fetch = vi.fn(async () => {
			return new Response(
				JSON.stringify({ id: "meta-tmpl-1", status: "PENDING", category: "UTILITY" }),
				{ status: 200 },
			);
		}) as unknown as typeof global.fetch;

		const res = await createTemplate({
			name: "aja_confirmacao_v1",
			language: "pt_BR",
			category: "UTILITY",
			components: [{ type: "BODY", text: "Olá {{1}}" }],
		});

		expect(global.fetch).toHaveBeenCalledTimes(1);
		const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(url).toBe("https://graph.facebook.com/v21.0/123456789/message_templates");
		expect(init.method).toBe("POST");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
		const body = JSON.parse(init.body as string);
		expect(body.name).toBe("aja_confirmacao_v1");
		expect(body.language).toBe("pt_BR");
		expect(body.category).toBe("UTILITY");
		expect(body.components).toEqual([{ type: "BODY", text: "Olá {{1}}" }]);
		expect(res).toEqual({ id: "meta-tmpl-1", status: "PENDING", category: "UTILITY" });
	});

	it("lança erro claro quando WHATSAPP_WABA_ID ausente", async () => {
		delete process.env.WHATSAPP_WABA_ID;
		global.fetch = vi.fn() as unknown as typeof global.fetch;
		await expect(
			createTemplate({ name: "x", language: "pt_BR", category: "UTILITY", components: [] }),
		).rejects.toThrow(/WHATSAPP_WABA_ID/);
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("propaga erro da Meta (4xx) em vez de fingir sucesso", async () => {
		global.fetch = vi.fn(async () => {
			return new Response(JSON.stringify({ error: { message: "nome inválido" } }), {
				status: 400,
			});
		}) as unknown as typeof global.fetch;
		await expect(
			createTemplate({ name: "X!", language: "pt_BR", category: "UTILITY", components: [] }),
		).rejects.toThrow();
	});
});

describe("FIX-200 — listTemplates", () => {
	it("faz GET no WABA /message_templates com fields e Bearer", async () => {
		global.fetch = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					data: [
						{
							id: "t1",
							name: "aja_confirmacao_v1",
							status: "APPROVED",
							category: "UTILITY",
							language: "pt_BR",
						},
					],
				}),
				{ status: 200 },
			);
		}) as unknown as typeof global.fetch;

		const res = await listTemplates();

		expect(global.fetch).toHaveBeenCalledTimes(1);
		const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(url).toContain("https://graph.facebook.com/v21.0/123456789/message_templates");
		expect(url).toContain("fields=");
		expect(url).toContain("status");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
		expect(res).toHaveLength(1);
		expect(res[0].name).toBe("aja_confirmacao_v1");
		expect(res[0].status).toBe("APPROVED");
	});

	it("segue paginação (paging.next) e concatena páginas", async () => {
		let call = 0;
		global.fetch = vi.fn(async () => {
			call += 1;
			if (call === 1) {
				return new Response(
					JSON.stringify({
						data: [
							{ id: "t1", name: "a", status: "APPROVED", category: "UTILITY", language: "pt_BR" },
						],
						paging: {
							next: "https://graph.facebook.com/v21.0/123456789/message_templates?after=CURSOR",
						},
					}),
					{ status: 200 },
				);
			}
			return new Response(
				JSON.stringify({
					data: [
						{ id: "t2", name: "b", status: "PENDING", category: "UTILITY", language: "pt_BR" },
					],
				}),
				{ status: 200 },
			);
		}) as unknown as typeof global.fetch;

		const res = await listTemplates();
		expect(global.fetch).toHaveBeenCalledTimes(2);
		expect(res.map((t) => t.id)).toEqual(["t1", "t2"]);
	});

	it("lança erro claro quando WHATSAPP_WABA_ID ausente", async () => {
		delete process.env.WHATSAPP_WABA_ID;
		global.fetch = vi.fn() as unknown as typeof global.fetch;
		await expect(listTemplates()).rejects.toThrow(/WHATSAPP_WABA_ID/);
		expect(global.fetch).not.toHaveBeenCalled();
	});
});

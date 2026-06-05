import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConexiaDocsClient } from "./conexia-docs-client";

// Contract test do mecanismo de upload provado na POC (bevi-upload-poc.md).
// Estrutura de slots = captura real do GET /unauth/proposals/documents/{token}.

const DOCS_ENVELOPE = {
	success: true,
	code: 200,
	message: "Documentos encontrados com sucesso",
	data: {
		section: { _id: "698ddc4c32efa3125e9d0a4a" },
		proposalId: "6a1f7953cf5174e43aa4a10a",
		documents: [
			{
				name: "RG/CNH - Frente ou aberto",
				sort: 1,
				_id: "698ddc4c32efa3125e9d0a4f",
				sectionId: "698ddc4c32efa3125e9d0a4a",
				files: [
					{
						_id: "6a1f7954cf5174e43aa4a196",
						documentId: "698ddc4c32efa3125e9d0a4f",
						sectionId: "698ddc4c32efa3125e9d0a4a",
						proposalId: "6a1f7953cf5174e43aa4a10a",
					},
				],
			},
			{
				name: "RG/CNH - Verso",
				sort: 2,
				_id: "698ddc4c32efa3125e9d0a50",
				sectionId: "698ddc4c32efa3125e9d0a4a",
				files: [
					{
						_id: "6a1f7954cf5174e43aa4a193",
						documentId: "698ddc4c32efa3125e9d0a50",
						sectionId: "698ddc4c32efa3125e9d0a4a",
						proposalId: "6a1f7953cf5174e43aa4a10a",
					},
				],
			},
		],
	},
};

afterEach(() => vi.restoreAllMocks());

describe("ConexiaDocsClient — resolveDocumentsToken", () => {
	it("extrai o token direto de uma URL do portal (sem rede)", async () => {
		const c = new ConexiaDocsClient();
		const t = await c.resolveDocumentsToken(
			"https://conexia.agxsoftware.com/proposals?documentsToken=6a1f797e10ffff8984dc7201&",
		);
		expect(t).toBe("6a1f797e10ffff8984dc7201");
	});

	it("segue o uselink.me (302) e extrai o token do Location", async () => {
		globalThis.fetch = vi.fn(async () => ({
			headers: {
				get: (h: string) =>
					h.toLowerCase() === "location"
						? "https://conexia.agxsoftware.com/proposals?documentsToken=abcdef012345abcdef012345&"
						: null,
			},
		})) as unknown as typeof fetch;
		const t = await new ConexiaDocsClient().resolveDocumentsToken(
			"https://www.uselink.me/ZWoibmELt",
		);
		expect(t).toBe("abcdef012345abcdef012345");
	});
});

describe("ConexiaDocsClient — upload", () => {
	let calls: Array<{ url: string; init: RequestInit }>;
	beforeEach(() => {
		calls = [];
		globalThis.fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
			calls.push({ url, init });
			if ((init.method ?? "GET") === "GET") return { json: async () => DOCS_ENVELOPE } as Response;
			return {
				json: async () => ({
					success: true,
					code: 200,
					message: "Proposta atualizada com sucesso!",
					data: {},
				}),
			} as Response;
		}) as unknown as typeof fetch;
	});

	it("frente → PATCH na URL com section/document/file corretos + multipart", async () => {
		await new ConexiaDocsClient().upload({
			proposalId: "6a1f7953cf5174e43aa4a10a",
			documentsLink:
				"https://conexia.agxsoftware.com/proposals?documentsToken=6a1f797e10ffff8984dc7201",
			slot: "identidade_frente",
			file: new Uint8Array([1, 2, 3]),
			filename: "rg.jpg",
			mimeType: "image/jpeg",
		});
		const patch = calls.find((c) => c.init.method === "PATCH");
		expect(patch).toBeTruthy();
		expect(patch?.url).toContain(
			"/section/698ddc4c32efa3125e9d0a4a/document/698ddc4c32efa3125e9d0a4f/client/6a1f7954cf5174e43aa4a196",
		);
		expect(patch?.init.body).toBeInstanceOf(FormData);
		// referer resolve o tenant; NÃO setar Content-Type (FormData define o boundary)
		const headers = patch?.init.headers as Record<string, string>;
		expect(headers.referer).toContain("conexia.agxsoftware.com");
		expect(headers["Content-Type"]).toBeUndefined();
	});

	it("verso → escolhe o slot 'Verso' (document _id diferente)", async () => {
		await new ConexiaDocsClient().upload({
			proposalId: "6a1f7953cf5174e43aa4a10a",
			documentsLink:
				"https://conexia.agxsoftware.com/proposals?documentsToken=6a1f797e10ffff8984dc7201",
			slot: "identidade_verso",
			file: new Uint8Array([1]),
			filename: "verso.jpg",
			mimeType: "image/jpeg",
		});
		const patch = calls.find((c) => c.init.method === "PATCH");
		expect(patch?.url).toContain(
			"/document/698ddc4c32efa3125e9d0a50/client/6a1f7954cf5174e43aa4a193",
		);
	});

	it("upload falho (success:false) lança — chamador cai pro link", async () => {
		globalThis.fetch = vi.fn(async (_u: string, init: RequestInit = {}) =>
			(init.method ?? "GET") === "GET"
				? ({ json: async () => DOCS_ENVELOPE } as Response)
				: ({
						json: async () => ({ success: false, code: 500, message: "erro", data: {} }),
					} as Response),
		) as unknown as typeof fetch;
		await expect(
			new ConexiaDocsClient().upload({
				proposalId: "p",
				documentsLink:
					"https://conexia.agxsoftware.com/proposals?documentsToken=6a1f797e10ffff8984dc7201",
				slot: "identidade_frente",
				file: new Uint8Array([1]),
				filename: "x.jpg",
				mimeType: "image/jpeg",
			}),
		).rejects.toThrow(/upload falhou/i);
	});
});

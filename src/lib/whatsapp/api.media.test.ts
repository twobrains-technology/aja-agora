// Camada 1 (structural) — Bloco 3 (remarketing com arte): upload de mídia e
// envio de imagem por media id. Mockamos global.fetch e assertamos
// endpoint/método/headers/corpo. NUNCA batemos na Graph real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	mensagemDeErroDaMeta,
	sendImageMessage,
	uploadMedia,
	uploadTemplateHeaderMedia,
} from "./api";

const originalFetch = global.fetch;

beforeEach(() => {
	process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
	process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
	process.env.WHATSAPP_APP_ID = "987654321";
});

afterEach(() => {
	global.fetch = originalFetch;
	vi.restoreAllMocks();
	delete process.env.WHATSAPP_APP_ID;
});

function mockFetch(fn: (url: string, init?: RequestInit) => Response) {
	global.fetch = vi.fn(async (url: string, init?: RequestInit) =>
		fn(String(url), init),
	) as unknown as typeof global.fetch;
	return global.fetch as unknown as ReturnType<typeof vi.fn>;
}

const ARQUIVO = {
	bytes: new TextEncoder().encode("fake-png-bytes").buffer as ArrayBuffer,
	mimeType: "image/png",
	nomeArquivo: "arte.png",
};

describe("Bloco 3 — uploadMedia (envio de mensagem com arquivo nosso)", () => {
	it("faz POST multipart em /{PHONE_NUMBER_ID}/media e devolve o id", async () => {
		const fetchMock = mockFetch(
			() => new Response(JSON.stringify({ id: "media-123" }), { status: 200 }),
		);

		const id = await uploadMedia(ARQUIVO);
		expect(id).toBe("media-123");

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://graph.facebook.com/v21.0/123456789/media");
		expect(init.method).toBe("POST");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
		// Sem Content-Type manual: o fetch preenche o boundary do multipart.
		expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();

		const form = init.body as FormData;
		expect(form).toBeInstanceOf(FormData);
		expect(form.get("messaging_product")).toBe("whatsapp");
		expect(form.get("type")).toBe("image/png");
		expect(form.get("file")).toBeInstanceOf(File);
	});

	it("propaga o erro da Meta já parseado, em vez de fingir sucesso", async () => {
		mockFetch(
			() =>
				new Response(
					JSON.stringify({
						error: { message: "Invalid file type", error_user_msg: "Tipo de arquivo inválido" },
					}),
					{ status: 400 },
				),
		);
		await expect(uploadMedia(ARQUIVO)).rejects.toThrow("Tipo de arquivo inválido");
	});

	it("lança claro quando faltam as envs do canal", async () => {
		delete process.env.WHATSAPP_PHONE_NUMBER_ID;
		mockFetch(() => new Response("{}", { status: 200 }));
		await expect(uploadMedia(ARQUIVO)).rejects.toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
	});
});

describe("Bloco 3 — uploadTemplateHeaderMedia (handle do header de template)", () => {
	it("abre a sessão em /{APP_ID}/uploads e envia com OAuth + file_offset, devolvendo o handle", async () => {
		const fetchMock = mockFetch((url) => {
			if (url.includes("/uploads?")) {
				return new Response(JSON.stringify({ id: "upload:session-1" }), { status: 200 });
			}
			return new Response(JSON.stringify({ h: "4::handle==:abc" }), { status: 200 });
		});

		const handle = await uploadTemplateHeaderMedia(ARQUIVO);
		expect(handle).toBe("4::handle==:abc");
		expect(fetchMock).toHaveBeenCalledTimes(2);

		const [urlSessao, initSessao] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(urlSessao).toContain("https://graph.facebook.com/v21.0/987654321/uploads?");
		expect(urlSessao).toContain("file_type=image%2Fpng");
		expect(urlSessao).toContain("file_length=14");
		expect((initSessao.headers as Record<string, string>).Authorization).toBe("Bearer test-token");

		const [urlEnvio, initEnvio] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(urlEnvio).toBe("https://graph.facebook.com/v21.0/upload:session-1");
		// A doc é literal: aqui é `OAuth`, não `Bearer`.
		expect((initEnvio.headers as Record<string, string>).Authorization).toBe("OAuth test-token");
		expect((initEnvio.headers as Record<string, string>).file_offset).toBe("0");
	});

	it("exige WHATSAPP_APP_ID (a sessão abre no app, não no número)", async () => {
		delete process.env.WHATSAPP_APP_ID;
		mockFetch(() => new Response("{}", { status: 200 }));
		await expect(uploadTemplateHeaderMedia(ARQUIVO)).rejects.toThrow(/WHATSAPP_APP_ID/);
	});

	it("lança quando a Meta não devolve handle", async () => {
		mockFetch((url) =>
			url.includes("/uploads?")
				? new Response(JSON.stringify({ id: "upload:session-1" }), { status: 200 })
				: new Response(JSON.stringify({}), { status: 200 }),
		);
		await expect(uploadTemplateHeaderMedia(ARQUIVO)).rejects.toThrow(/handle/);
	});
});

describe("Bloco 3 — sendImageMessage aceita link E media id", () => {
	it("com string (link) mantém `image.link` — chamadas antigas intactas", async () => {
		const fetchMock = mockFetch(
			() => new Response(JSON.stringify({ messages: [{ id: "wamid-1" }] }), { status: 200 }),
		);

		const res = await sendImageMessage("5562999998888", "https://cdn.exemplo/foto.png", "Olha só");
		expect(res.messageId).toBe("wamid-1");

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.image).toEqual({ link: "https://cdn.exemplo/foto.png", caption: "Olha só" });
	});

	it("com { id } envia `image.id` (arquivo nosso, sem URL pública)", async () => {
		const fetchMock = mockFetch(
			() => new Response(JSON.stringify({ messages: [{ id: "wamid-2" }] }), { status: 200 }),
		);

		const res = await sendImageMessage("5562999998888", { id: "media-abc" });
		expect(res.messageId).toBe("wamid-2");

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.image).toEqual({ id: "media-abc" });
	});
});

describe("Bloco 3 — parse do erro da Meta", () => {
	it("prefere error_user_msg (a versão escrita para o usuário)", () => {
		const corpo = JSON.stringify({
			error: {
				message: "(#100) Param invalid",
				error_user_msg: "A categoria precisa ser Marketing",
			},
		});
		expect(mensagemDeErroDaMeta(corpo)).toBe("A categoria precisa ser Marketing");
	});

	it("cai para error.message quando não há error_user_msg", () => {
		const corpo = JSON.stringify({ error: { message: "Template name already exists" } });
		expect(mensagemDeErroDaMeta(corpo)).toBe("Template name already exists");
	});

	it("devolve o corpo bruto quando não é JSON (HTML de gateway)", () => {
		expect(mensagemDeErroDaMeta("<html>502 Bad Gateway</html>")).toContain("502 Bad Gateway");
	});

	it("tem fallback com motivo quando o corpo é vazio", () => {
		expect(mensagemDeErroDaMeta("")).toContain("sem detalhar o motivo");
	});
});

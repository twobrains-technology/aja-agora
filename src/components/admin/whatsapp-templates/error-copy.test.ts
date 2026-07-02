// Camada 1 (structural) — FIX resiliência: o toast de erro do submit fazia
// body.message ?? body.error ?? `HTTP ${status}`. Com 502 do Cloudflare (body
// text/html) caía em "HTTP 502" genérico e feio. `errorMessageFromResponse`
// deve devolver cópia amigável PT-BR quando a resposta NÃO é JSON ou é 5xx de
// gateway, e a mensagem específica da API quando o body é JSON de erro nosso.
import { describe, expect, it } from "vitest";
import { errorMessageFromResponse, GATEWAY_UNAVAILABLE_COPY } from "./error-copy";

function jsonRes(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function htmlRes(status: number) {
	return new Response("<html><body>502 Bad Gateway</body></html>", {
		status,
		headers: { "content-type": "text/html" },
	});
}

describe("errorMessageFromResponse", () => {
	it("usa body.message quando a API respondeu JSON de erro nosso (ex 400)", async () => {
		const res = jsonRes(400, { error: "Falha", message: "Defina a categoria" });
		expect(await errorMessageFromResponse(res)).toBe("Defina a categoria");
	});

	it("cai em body.error quando não há message", async () => {
		const res = jsonRes(409, { error: "Template já submetido" });
		expect(await errorMessageFromResponse(res)).toBe("Template já submetido");
	});

	it("502 com body text/html (Cloudflare) → cópia amigável PT-BR", async () => {
		const res = htmlRes(502);
		expect(await errorMessageFromResponse(res)).toBe(GATEWAY_UNAVAILABLE_COPY);
	});

	it("503 mesmo com JSON de erro → cópia amigável de gateway", async () => {
		const res = jsonRes(503, { error: "upstream" });
		expect(await errorMessageFromResponse(res)).toBe(GATEWAY_UNAVAILABLE_COPY);
	});

	it("502 do nosso próprio route (JSON com message) → mostra a message específica", async () => {
		// O submit/route responde 502 JSON com message da Meta — essa é útil, não é
		// gateway anônimo. Distinguimos gateway (sem JSON de erro nosso) de 502 nosso.
		const res = jsonRes(502, { error: "Falha ao submeter à Meta", message: "nome inválido" });
		expect(await errorMessageFromResponse(res)).toBe("nome inválido");
	});

	it("body vazio / não-parseável sem content-type JSON → fallback amigável", async () => {
		const res = new Response("", { status: 500 });
		expect(await errorMessageFromResponse(res)).toBe(GATEWAY_UNAVAILABLE_COPY);
	});
});

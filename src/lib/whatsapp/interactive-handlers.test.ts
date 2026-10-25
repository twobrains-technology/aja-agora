import { describe, expect, it, vi } from "vitest";

// O módulo importa o banco; aqui só interessa a decisão de qual URL sai pro cliente.
vi.mock("@/db", () => ({ db: {} }));

const PROPOSTA = {
	url: "https://tb-dev-aja-agora.twobrainstechnology.com/api/proposta/p-1",
	urlAssinada:
		"https://s3.amazonaws.com/ajapropostas/p-1.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=300",
};

describe("o fecho do WhatsApp manda a proposta UMA vez, pelo link estável", () => {
	it("o envio é o link /api/proposta/<id>, não a URL assinada do S3", async () => {
		const { urlDeEnvioDaProposta } = await import("./interactive-handlers");
		const url = urlDeEnvioDaProposta(PROPOSTA);
		expect(url).toBe(PROPOSTA.url);
		// A assinada expira em 5 minutos: quem abre depois vê AccessDenied.
		expect(url).not.toMatch(/X-Amz-Expires/);
	});

	it("sem proposta não há envio (o fecho segue sem o beat)", async () => {
		const { urlDeEnvioDaProposta } = await import("./interactive-handlers");
		expect(urlDeEnvioDaProposta(null)).toBeNull();
	});
});

import { describe, expect, it, vi } from "vitest";

// Os cards foram emitidos por uma busca anterior: o que a conversa guardou é a
// única fonte que o clique pode usar.
const CARTA_NO_CARD = {
	id: "grp-canopus-1",
	administradora: "Canopus",
	category: "auto",
	creditValue: 80000,
	monthlyPayment: 700,
	termMonths: 120,
	contempladosMes: 5,
};

vi.mock("@/db", () => ({
	db: {
		query: {
			messages: {
				findMany: vi.fn(async () => [
					{ artifacts: [{ type: "comparison_table", payload: { groups: [CARTA_NO_CARD] } }] },
				]),
			},
		},
	},
}));

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

describe("o clique na carta usa a carta que a conversa MOSTROU", () => {
	it("group_/simulate_/whatif_ resolvem a cota pelo card persistido", async () => {
		const { cartaDaConversa } = await import("./interactive-handlers");
		const carta = await cartaDaConversa("conv-1", "grp-canopus-1");
		expect(carta).not.toBeNull();
		// Os NÚMEROS são os do card — não de uma busca nova (que poderia devolver
		// outra carta e ancorar uma cota que o cliente nunca viu).
		expect(carta?.administradora).toBe("Canopus");
		expect(carta?.creditValue).toBe(80000);
		expect(carta?.monthlyPayment).toBe(700);
		expect(carta?.termMonths).toBe(120);
	});

	it("cota que a conversa não mostrou não é inventada", async () => {
		const { cartaDaConversa } = await import("./interactive-handlers");
		expect(await cartaDaConversa("conv-1", "grp-que-nunca-apareceu")).toBeNull();
	});
});

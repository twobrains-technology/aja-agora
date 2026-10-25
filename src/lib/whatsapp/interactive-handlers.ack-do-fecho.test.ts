import { describe, expect, it, vi } from "vitest";

// R5.7 (lado WhatsApp) — o clique que fecha dinheiro não pode ficar em silêncio.
// "Confirmar" do contract_form e "Confirmar carta" do real_offer disparam a parte
// CARA do fecho (startContract na Bevi: consulta de bureau + criação da proposta;
// confirmOffer + apresentação do fechamento). Até aqui o cliente via só o próprio
// clique por ~14 s. Agora sai uma mensagem curta ANTES do trabalho pesado.

const ordem: string[] = [];

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: { findFirst: vi.fn(async () => ({ metadata: {} })) },
		},
	},
}));
vi.mock("./session", () => ({
	getOrCreateConversation: vi.fn(async () => ({ id: "conv-1", isNew: false })),
}));
vi.mock("@/lib/conversation/messages", () => ({
	saveMessage: vi.fn(async () => "msg-1"),
}));
vi.mock("./api", () => ({
	sendTextMessage: vi.fn(async (_to: string, texto: string) => {
		ordem.push(`texto:${texto}`);
		return { messageId: "wamid-1" };
	}),
	sendInteractiveMessage: vi.fn(async () => ({ messageId: "wamid-2" })),
}));
vi.mock("./contract-capture", () => ({
	CONTRACT_CANCELLED_REPLY: "Tranquilo! Vou te mostrar outras opções então.",
	// O fecho de verdade: demorado por natureza (Bevi). Aqui só registra a ordem.
	fireContract: vi.fn(async () => {
		ordem.push("fecho:fireContract");
	}),
}));
vi.mock("@/lib/bevi/fulfillment", () => ({
	confirmOffer: vi.fn(async () => {
		ordem.push("fecho:confirmOffer");
		throw new Error("Bevi fora do ar no teste");
	}),
}));

const clicar = async (replyId: string) => {
	ordem.length = 0;
	const { dispatchInteractiveReply } = await import("./interactive-handlers");
	await dispatchInteractiveReply({
		from: "5511987654321",
		replyId,
		replyTitle: "Confirmar",
		processTextMessage: vi.fn(async () => {}),
	});
	return ordem;
};

describe("R5.7 — o cliente recebe retorno antes do trabalho pesado do fecho", () => {
	it("contract_confirm: a mensagem de retorno sai ANTES do fireContract", async () => {
		const passos = await clicar("contract_confirm");
		const { ACK_CONFIRMACAO_CONTRATO } = await import("./interactive-handlers");
		expect(passos).toEqual([`texto:${ACK_CONFIRMACAO_CONTRATO}`, "fecho:fireContract"]);
	});

	it("offer_confirm: a mensagem de retorno sai ANTES do confirmOffer", async () => {
		const passos = await clicar("offer_confirm");
		const { ACK_CONFIRMACAO_OFERTA } = await import("./interactive-handlers");
		expect(passos[0]).toBe(`texto:${ACK_CONFIRMACAO_OFERTA}`);
		expect(passos).toContain("fecho:confirmOffer");
		expect(passos.indexOf("fecho:confirmOffer")).toBeGreaterThan(0);
	});

	it("o retorno não promete proposta pronta — só o que o sistema está fazendo", async () => {
		const { ACK_CONFIRMACAO_CONTRATO, ACK_CONFIRMACAO_OFERTA } = await import(
			"./interactive-handlers"
		);
		for (const texto of [ACK_CONFIRMACAO_CONTRATO, ACK_CONFIRMACAO_OFERTA]) {
			expect(texto).not.toMatch(/est[áa] (pronta|aprovada|fechada)/i);
			expect(texto).not.toMatch(/parab[ée]ns/i);
		}
	});
});

// Camada 1 (FIX-25) — botões do passo 5 no WhatsApp: contract_confirm/cancel
// (fechamento) e o terminal de offer_confirm (contractClosed + Parabéns + resumo,
// paridade com o web).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-ih-fix25";
const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	meta: {} as ConversationMetadata,
	confirmOffer: vi.fn(),
	sendContractSummary: vi.fn().mockResolvedValue({ sent: true }),
	fireContract: vi.fn().mockResolvedValue(undefined),
	processText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./session", () => ({ getOrCreateConversation: vi.fn(async () => ({ id: CONV_ID })) }));
vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));
vi.mock("@/lib/conversation/meta", () => ({
	metaOf: () => mocks.meta,
	persistMeta: mocks.persistMeta,
}));
vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: { findFirst: vi.fn(async () => ({ id: CONV_ID, metadata: mocks.meta })) },
		},
	},
}));
vi.mock("@/lib/bevi/fulfillment", () => ({
	confirmOffer: mocks.confirmOffer,
	startContract: vi.fn(),
}));
vi.mock("@/lib/bevi/contract-summary", () => ({ sendContractSummary: mocks.sendContractSummary }));
// A proposta que o cliente recebe é a NOSSA (PDF co-branded). Sem ela o fecho
// NÃO emite o beat "Sua proposta está pronta" — nunca cai no link da
// administradora em domínio de terceiro (abolido em 2026-07-21).
vi.mock("@/lib/proposal/entrega", () => ({
	prepararPropostaParaEnvio: vi.fn(async () => ({
		url: "https://app.aja.test/api/proposta/prop-row-1",
		urlAssinada: "https://s3.aja.test/proposta.pdf?X-Amz-Signature=abc",
		nomeArquivo: "Proposta-Aja-Agora.pdf",
	})),
}));
// FIX-203: a confirmação agora roteia por resolveAndSend. Aqui simulamos JANELA
// ABERTA — resolveAndSend só executa o freeTextFallback (manda a copy atual), então
// as asserções de texto (reforço/Parabéns/link) seguem valendo. Roteamento por
// template/fila é coberto em template-dispatch.test.ts.
vi.mock("./template-dispatch", () => ({
	resolveAndSend: vi.fn(async (a: { freeTextFallback: () => Promise<void> | void }) => {
		await a.freeTextFallback();
		return { channel: "free_text" as const };
	}),
}));
vi.mock("./contract-capture", () => ({
	fireContract: mocks.fireContract,
	CONTRACT_CANCELLED_REPLY: "Tranquilo! Vou te mostrar outras opções então.",
}));

import { dispatchInteractiveReply } from "./interactive-handlers";

function dispatch(replyId: string, replyTitle = "x") {
	return dispatchInteractiveReply({
		from: WA,
		replyId,
		replyTitle,
		processTextMessage: mocks.processText,
	});
}

beforeEach(() => {
	for (const m of [
		mocks.sendText,
		mocks.sendInteractive,
		mocks.saveMessage,
		mocks.persistMeta,
		mocks.confirmOffer,
		mocks.sendContractSummary,
		mocks.fireContract,
		mocks.processText,
	])
		m.mockClear();
	mocks.meta = {} as ConversationMetadata;
});

afterEach(() => vi.restoreAllMocks());

describe("contract_confirm — aceite do fechamento (CA-2)", () => {
	it("dispara fireContract", async () => {
		const handled = await dispatch("contract_confirm", "Confirmar");
		expect(handled).toBe(true);
		expect(mocks.fireContract).toHaveBeenCalledWith(WA, CONV_ID);
		expect(mocks.saveMessage).toHaveBeenCalledWith(CONV_ID, "user", "Confirmar", "whatsapp");
	});
});

describe("contract_cancel — recusa (CA-4)", () => {
	it("limpa contractCollection e conduz pra 'ver outras'", async () => {
		mocks.meta = { contractCollection: { stage: "confirm" } } as ConversationMetadata;
		const handled = await dispatch("contract_cancel", "Ver outras");
		expect(handled).toBe(true);
		expect(mocks.fireContract).not.toHaveBeenCalled();
		const lastPersist = mocks.persistMeta.mock.calls.at(-1)?.[1] as ConversationMetadata;
		expect(lastPersist.contractCollection).toBeUndefined();
		expect(mocks.processText).toHaveBeenCalledWith(WA, "Quero ver outras opções", undefined);
	});
});

describe("offer_confirm — terminal paridade web (CA-9)", () => {
	const CONFIRM_RESULT = {
		proposalId: "p-1",
		administradora: "ANCORA",
		consortiumProposalLink: "https://bevi/proposta/p-1",
		documentsLinkPersonal: "https://bevi/docs/p-1",
		documentsLinkAddress: "https://bevi/end/p-1",
	};

	it("confirmOffer → contractClosed=true + reforço + Parabéns + resumo", async () => {
		mocks.confirmOffer.mockResolvedValue(CONFIRM_RESULT);
		mocks.meta = { currentPersona: "specialist" } as ConversationMetadata;

		const handled = await dispatch("offer_confirm", "Confirmar carta");
		expect(handled).toBe(true);
		expect(mocks.confirmOffer).toHaveBeenCalledWith(CONV_ID);

		const closedPersist = mocks.persistMeta.mock.calls.find(
			(c) => (c[1] as ConversationMetadata).contractClosed === true,
		);
		expect(closedPersist, "deve setar contractClosed=true").toBeTruthy();

		const allSent = mocks.sendText.mock.calls.map((c) => c[1]).join("\n");
		expect(allSent).toMatch(/cota da ANCORA está reservada/i); // reforço literal (FIX-278: terminologia reserva de cota)
		expect(allSent).toMatch(/Parabéns/i);
		// A proposta entregue é a NOSSA; o link da administradora nunca vai pro cliente.
		expect(allSent).toContain("https://app.aja.test/api/proposta/prop-row-1");
		// A URL assinada (400+ chars, expira em 5 min) NUNCA vai no texto.
		expect(allSent).not.toContain("X-Amz-Signature");
		expect(allSent).not.toContain(CONFIRM_RESULT.consortiumProposalLink);
		// Documento é assunto do atendente que faz a adesão — não do fecho.
		expect(allSent.toLowerCase()).not.toMatch(/rg ou cnh/);
		expect(allSent.toLowerCase()).toMatch(/atendente/);
		expect(mocks.sendContractSummary).toHaveBeenCalledWith(CONV_ID);
	});

	it("erro do confirmOffer → mensagem de retry, sem contractClosed", async () => {
		mocks.confirmOffer.mockRejectedValue(new Error("bevi down"));
		mocks.meta = {} as ConversationMetadata;
		await dispatch("offer_confirm", "Confirmar carta");
		const closed = mocks.persistMeta.mock.calls.find(
			(c) => (c[1] as ConversationMetadata).contractClosed === true,
		);
		expect(closed).toBeFalsy();
		expect(mocks.sendText).toHaveBeenCalledWith(WA, expect.stringMatching(/problema|tentar/i));
	});
});

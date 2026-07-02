// Camada 1 (estrutural) — FIX-203: a confirmação de contratação roteia pelos
// usageKeys canônicos via resolveAndSend, mantendo a copy de texto livre como
// fallback dentro da janela.
//
// Bug-alvo: closingPresentation/sendContractSummary/signatureHandoff disparavam
// texto livre direto — quebrado fora da janela (web→WhatsApp). Agora cada disparo
// referencia uma chave lógica (confirmacao_contratacao, proposta_pronta,
// resumo_contratacao) e usa a copy atual como freeTextFallback.
//
// Estratégia: resolveAndSend mockado (spy) — assere os usageKeys e que o
// freeTextFallback, quando executado (janela aberta), produz a copy atual intacta.
// O roteamento janela→template→fila é coberto em template-dispatch.test.ts (DB real).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-fix203";
const WA = "5562999887766";

const resolveCalls: Array<{ usageKey: string; to: string; conversationId: string; text: string }> = [];

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	meta: {} as ConversationMetadata,
	confirmOffer: vi.fn(),
	sendContractSummary: vi.fn().mockResolvedValue({ sent: true }),
	resolveAndSend: vi.fn(),
}));

vi.mock("./session", () => ({ getOrCreateConversation: vi.fn(async () => ({ id: CONV_ID })) }));
vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: vi.fn(),
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));
vi.mock("@/lib/conversation/meta", () => ({ metaOf: () => mocks.meta, persistMeta: mocks.persistMeta }));
vi.mock("@/db", () => ({
	db: { query: { conversations: { findFirst: vi.fn(async () => ({ id: CONV_ID, metadata: mocks.meta })) } } },
}));
vi.mock("@/lib/bevi/fulfillment", () => ({ confirmOffer: mocks.confirmOffer, startContract: vi.fn() }));
vi.mock("@/lib/bevi/contract-summary", () => ({ sendContractSummary: mocks.sendContractSummary }));
vi.mock("./contract-capture", () => ({ fireContract: vi.fn(), CONTRACT_CANCELLED_REPLY: "x" }));
vi.mock("./template-dispatch", () => ({ resolveAndSend: mocks.resolveAndSend }));

import { dispatchInteractiveReply } from "./interactive-handlers";

function dispatch(replyId: string, replyTitle = "x") {
	return dispatchInteractiveReply({ from: WA, replyId, replyTitle, processTextMessage: vi.fn() });
}

beforeEach(() => {
	resolveCalls.length = 0;
	for (const m of [mocks.sendText, mocks.saveMessage, mocks.persistMeta, mocks.confirmOffer, mocks.sendContractSummary])
		m.mockClear();
	mocks.meta = {} as ConversationMetadata;
	// Simula JANELA ABERTA: resolveAndSend executa o freeTextFallback e registra a chave.
	mocks.resolveAndSend.mockReset().mockImplementation(
		async (a: {
			usageKey: string;
			to: string;
			conversationId: string;
			freeTextFallback: () => Promise<void> | void;
		}) => {
			const before = mocks.sendText.mock.calls.length;
			await a.freeTextFallback();
			const after = mocks.sendText.mock.calls[before]?.[1] ?? "";
			resolveCalls.push({ usageKey: a.usageKey, to: a.to, conversationId: a.conversationId, text: after });
			return { channel: "free_text" };
		},
	);
});

afterEach(() => vi.restoreAllMocks());

describe("FIX-203 — offer_confirm roteia a confirmação por resolveAndSend", () => {
	const CONFIRM_RESULT = {
		proposalId: "p-1",
		administradora: "ANCORA",
		consortiumProposalLink: "https://bevi/proposta/p-1",
		documentsLinkPersonal: "https://bevi/docs/p-1",
	};

	it("usa confirmacao_contratacao e proposta_pronta, com a copy livre intacta", async () => {
		mocks.confirmOffer.mockResolvedValue(CONFIRM_RESULT);
		mocks.meta = { currentPersona: "specialist" } as ConversationMetadata;

		const handled = await dispatch("offer_confirm", "Confirmar carta");
		expect(handled).toBe(true);

		// resolveAndSend foi a via de TODOS os envios (nenhum sendText fora dele)
		expect(mocks.resolveAndSend).toHaveBeenCalled();
		const keys = resolveCalls.map((c) => c.usageKey);
		expect(keys).toContain("confirmacao_contratacao");
		expect(keys).toContain("proposta_pronta");
		// todos pro celular certo, mesma conversa
		expect(resolveCalls.every((c) => c.to === WA && c.conversationId === CONV_ID)).toBe(true);

		// copy livre preservada (reforço, Parabéns, link da proposta)
		const allText = resolveCalls.map((c) => c.text).join("\n");
		expect(allText).toMatch(/contratando um consórcio da ANCORA/i);
		expect(allText).toMatch(/Parabéns/i);
		expect(allText).toContain(CONFIRM_RESULT.consortiumProposalLink);

		// a signature handoff foi a que carregou a chave proposta_pronta
		const proposta = resolveCalls.find((c) => c.usageKey === "proposta_pronta");
		expect(proposta?.text).toMatch(/proposta está pronta/i);
	});
});

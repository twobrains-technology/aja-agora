// Camada 1 (FIX-108) — botão "Ver outras opções" do card da recomendada.
// O clique conduz o usuário às alternativas: registra o clique (histórico do
// lead) e pede ao agente a comparação ("Quero ver outras opções"), espelhando
// o padrão já provado de offer_reject/contract_cancel.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-ih-fix108";
const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	meta: {} as ConversationMetadata,
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
	for (const m of [mocks.sendText, mocks.sendInteractive, mocks.saveMessage, mocks.persistMeta, mocks.processText])
		m.mockClear();
	mocks.meta = {} as ConversationMetadata;
});

afterEach(() => vi.restoreAllMocks());

describe("show_others — 'Ver outras opções' do card da recomendada (FIX-108)", () => {
	it("conduz pra comparação via agente e registra o clique", async () => {
		const handled = await dispatch("show_others", "Ver outras opções");
		expect(handled).toBe(true);
		expect(mocks.processText).toHaveBeenCalledWith(WA, "Quero ver outras opções", undefined);
		expect(mocks.saveMessage).toHaveBeenCalledWith(CONV_ID, "user", "Ver outras opções", "whatsapp");
	});
});

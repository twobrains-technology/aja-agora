import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock hoisting workaround — usar vi.hoisted pra compartilhar mocks entre factory e tests.
const mocks = vi.hoisted(() => ({
	sendTextMock: vi.fn().mockResolvedValue(undefined),
	processOrchestratorMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db", () => ({
	db: {
		query: { conversations: { findFirst: vi.fn().mockResolvedValue(null) } },
		delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
	},
}));

vi.mock("./api", () => ({
	sendTextMessage: mocks.sendTextMock,
	sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./adapter", () => ({
	processWithOrchestrator: mocks.processOrchestratorMock,
}));

vi.mock("./proxy", () => ({
	getHandoffState: vi.fn().mockResolvedValue({ isHandedOff: false }),
	handleAgentMessage: vi.fn(),
	handlePendingHandoffText: vi.fn().mockResolvedValue(false),
	isAttendantPhone: vi.fn().mockResolvedValue(false),
	relayUserToAgent: vi.fn(),
}));

vi.mock("./interactive-handlers", () => ({
	dispatchInteractiveReply: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/conversation/meta", () => ({
	metaOf: vi.fn().mockReturnValue({}),
	persistMeta: vi.fn().mockResolvedValue(undefined),
}));

import { processTextMessage } from "./processor";

describe("WhatsApp processor — paridade web + early-return 'voltar' (bug #06 #20)", () => {
	beforeEach(() => {
		mocks.sendTextMock.mockClear();
		mocks.processOrchestratorMock.mockClear();
	});

	it("mensagem 'voltar' → early-return: NÃO chama orchestrator, manda ack", async () => {
		await processTextMessage("5511999999999", "voltar", "Teste", "msg1");
		expect(mocks.processOrchestratorMock).not.toHaveBeenCalled();
		expect(mocks.sendTextMock).toHaveBeenCalledWith(
			"5511999999999",
			expect.stringMatching(/voltando|in[íi]cio/i),
		);
	});

	it("mensagem 'Voltar pro menu' também é tratada (case-insensitive)", async () => {
		await processTextMessage("5511999999999", "Voltar pro menu", "Teste", "msg2");
		expect(mocks.processOrchestratorMock).not.toHaveBeenCalled();
		expect(mocks.sendTextMock).toHaveBeenCalled();
	});

	it("mensagem normal ('quero comprar uma moto') → chama orchestrator (passa pra agente)", async () => {
		await processTextMessage("5511999999999", "quero comprar uma moto", "Teste", "msg3");
		expect(mocks.processOrchestratorMock).toHaveBeenCalledWith(
			"5511999999999",
			"quero comprar uma moto",
			"Teste",
		);
		// Não chama ack — orchestrator é quem responde
		expect(mocks.sendTextMock).not.toHaveBeenCalled();
	});

	it("mensagem 'vou voltar amanhã' NÃO é tratada como back intent (falso positivo)", async () => {
		await processTextMessage("5511999999999", "vou voltar amanhã", "Teste", "msg4");
		expect(mocks.processOrchestratorMock).toHaveBeenCalled();
	});

	it("paridade web/whatsapp: categoria 'moto' segue mesmo path do orchestrator", async () => {
		await processTextMessage("5511999999999", "quero uma moto nova", "Teste", "msg5");
		expect(mocks.processOrchestratorMock).toHaveBeenCalledTimes(1);
		expect(mocks.processOrchestratorMock.mock.calls[0][1]).toMatch(/moto/i);
	});
});

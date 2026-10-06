// R1 (B5c) — a falha do LLM no WhatsApp precisa virar sinal.
//
// O defeito medido: `processTextMessageSerialized` captura todo erro, responde
// "Desculpe, tive um problema" e retorna normal — então o `.catch` do webhook,
// onde o alerta morava, NUNCA rodava. Mesma coisa no clique, que nem tinha
// catch. Aqui a falha de billing é provocada NO PROCESSOR e o que se prova é
// que `registrarFalhaDoLlm` é chamado (o alerta de verdade é dublado; nenhum
// teste dispara e-mail nem mensagem real).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	sendTextMock: vi.fn().mockResolvedValue(undefined),
	processOrchestratorMock: vi.fn().mockResolvedValue(undefined),
	dispatchInteractiveMock: vi.fn().mockResolvedValue(true),
	isMesaAttendantPhoneMock: vi.fn().mockResolvedValue(false),
	handleMesaCopilotMock: vi.fn().mockResolvedValue(undefined),
	registrarFalhaDoLlmMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./mesa/routing", () => ({
	isMesaAttendantPhone: mocks.isMesaAttendantPhoneMock,
	handleMesaCopilot: mocks.handleMesaCopilotMock,
}));

vi.mock("@/db", () => ({
	db: {
		query: { conversations: { findFirst: vi.fn().mockResolvedValue(null) } },
		delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
	},
}));

vi.mock("./once", () => ({
	claimOnce: vi.fn().mockResolvedValue(true),
	claimInboundMessage: vi.fn().mockResolvedValue(true),
	claimContextBeat: vi.fn().mockResolvedValue(true),
	claimButtonClick: vi.fn().mockResolvedValue(true),
	DOUBLE_CLICK_WINDOW_MS: 12000,
}));

vi.mock("./conversation-lock", () => ({
	withConversationLock: <T>(_waId: string, fn: () => Promise<T>) => fn(),
}));

vi.mock("./api", () => ({
	sendTextMessage: mocks.sendTextMock,
	sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./adapter", () => ({
	processWithOrchestrator: mocks.processOrchestratorMock,
	runDirectiveWithOrchestrator: vi.fn().mockResolvedValue(undefined),
	fireGate: vi.fn().mockResolvedValue(undefined),
	runSearchSummaryWithOrchestrator: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./proxy", () => ({
	getHandoffState: vi.fn().mockResolvedValue({ isHandedOff: false }),
	handleAgentMessage: vi.fn(),
	handlePendingHandoffText: vi.fn().mockResolvedValue(false),
	isAttendantPhone: vi.fn().mockResolvedValue(false),
	relayUserToAgent: vi.fn(),
}));

vi.mock("./interactive-handlers", () => ({
	dispatchInteractiveReply: mocks.dispatchInteractiveMock,
}));

vi.mock("@/lib/conversation/meta", () => ({
	metaOf: vi.fn().mockReturnValue({}),
	persistMeta: vi.fn().mockResolvedValue(undefined),
}));

// A borda do alerta é dublada: o teste prova que ela é CHAMADA, não que o
// e-mail sai (nenhum teste manda e-mail de verdade).
vi.mock("@/lib/llm/alerta-do-llm", () => ({
	registrarFalhaDoLlm: mocks.registrarFalhaDoLlmMock,
}));

import { processInteractiveReply, processTextMessage } from "./processor";

const BILLING = new Error("Your credit balance is too low to access the Anthropic API");

describe("R1 — falha do LLM no WhatsApp vira sinal (registrarFalhaDoLlm)", () => {
	beforeEach(() => {
		mocks.sendTextMock.mockClear();
		mocks.processOrchestratorMock.mockClear().mockResolvedValue(undefined);
		mocks.dispatchInteractiveMock.mockClear().mockResolvedValue(true);
		mocks.isMesaAttendantPhoneMock.mockClear().mockResolvedValue(false);
		mocks.registrarFalhaDoLlmMock.mockClear().mockResolvedValue(undefined);
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("erro de billing no turno de TEXTO registra a falha (o catch do processor sinaliza)", async () => {
		mocks.processOrchestratorMock.mockRejectedValueOnce(BILLING);

		await processTextMessage("5511999999999", "quero comprar um carro", "Teste", "msg-billing");

		expect(mocks.registrarFalhaDoLlmMock).toHaveBeenCalledTimes(1);
		const [erro, contexto] = mocks.registrarFalhaDoLlmMock.mock.calls[0];
		expect(erro).toBe(BILLING);
		expect(contexto).toEqual(expect.objectContaining({ origem: "whatsapp" }));
		// O cliente continua recebendo o pedido de desculpa — o alerta não troca a resposta.
		expect(mocks.sendTextMock).toHaveBeenCalledWith(
			"5511999999999",
			expect.stringMatching(/desculpe|problema/i),
		);
	});

	it("erro de billing no turno de CLIQUE também registra a falha", async () => {
		mocks.dispatchInteractiveMock.mockRejectedValueOnce(BILLING);

		await expect(
			processInteractiveReply("5511999999999", "btn-1", "Tenho interesse", "Teste", "msg-clique"),
		).resolves.toBeUndefined();

		expect(mocks.registrarFalhaDoLlmMock).toHaveBeenCalledTimes(1);
	});
});
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

// vi.mock hoisting workaround — usar vi.hoisted pra compartilhar mocks entre factory e tests.
const mocks = vi.hoisted(() => ({
	sendTextMock: vi.fn().mockResolvedValue(undefined),
	processOrchestratorMock: vi.fn().mockResolvedValue(undefined),
	isMesaAttendantPhoneMock: vi.fn().mockResolvedValue(false),
	handleMesaCopilotMock: vi.fn().mockResolvedValue(undefined),
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

import { db } from "@/db";
import { metaOf } from "@/lib/conversation/meta";
import { processTextMessage } from "./processor";

describe("WhatsApp processor — paridade web + early-return 'voltar' (bug #06 #20)", () => {
	beforeEach(() => {
		mocks.sendTextMock.mockClear();
		mocks.processOrchestratorMock.mockClear();
		mocks.isMesaAttendantPhoneMock.mockClear();
		mocks.isMesaAttendantPhoneMock.mockResolvedValue(false);
		mocks.handleMesaCopilotMock.mockClear();
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

	// FIX-66: número de atendente de mesa → copiloto, NUNCA vendas (spec §8).
	it("número de atendente de mesa → handleMesaCopilot, NÃO chama o orchestrator de vendas", async () => {
		mocks.isMesaAttendantPhoneMock.mockResolvedValue(true);
		await processTextMessage("5562999998888", "como faço o contrato na Canopus?", "Op", "msgM");
		expect(mocks.handleMesaCopilotMock).toHaveBeenCalledWith(
			"5562999998888",
			"como faço o contrato na Canopus?",
		);
		expect(mocks.processOrchestratorMock).not.toHaveBeenCalled();
	});

	it("o check de mesa vem ANTES do funil normal — early-return mesmo com texto comum", async () => {
		mocks.isMesaAttendantPhoneMock.mockResolvedValue(true);
		await processTextMessage("5562999998888", "quero comprar uma moto", "Op", "msgM2");
		// Texto que normalmente iria pro orchestrator não vaza pra vendas.
		expect(mocks.handleMesaCopilotMock).toHaveBeenCalledTimes(1);
		expect(mocks.processOrchestratorMock).not.toHaveBeenCalled();
	});
});

// FIX-217 (Ata 2026-07-04, item 9 + inbox 2026-07-01-whatsapp-identify-gate) —
// no gate identify, texto sem CPF (tentativa de pular, pergunta) NUNCA pode
// cair no pipeline geral do agente: o gate é DETERMINÍSTICO e FORÇADO (Lei 4).
describe("Gate identify determinístico e forçado (FIX-217)", () => {
	// Describe irmão do bloco acima — NÃO herda o beforeEach dele. Reseta aqui
	// pra não vazar isMesaAttendantPhoneMock=true deixado por um teste anterior
	// (achado real: sem isto, "acha logo os grupos" roteava pro copiloto de mesa
	// em vez do gate identify, mascarando 100% dos asserts como falso-negativo).
	beforeEach(() => {
		mocks.sendTextMock.mockClear();
		mocks.processOrchestratorMock.mockClear();
		mocks.isMesaAttendantPhoneMock.mockClear();
		mocks.isMesaAttendantPhoneMock.mockResolvedValue(false);
	});

	// FIX-296 (rodada 10, 2026-07-12): `credit` passou a preceder `identify` no
	// funil (reversão consciente do FIX-53) — pra `nextGate` chegar
	// genuinamente em `identify`, o valor do bem já precisa estar resolvido.
	const IDENTIFY_META = {
		desireAsked: true,
		experiencePrev: "first",
		qualifyConsented: true,
		identityCollected: false,
		qualifyAnswers: { creditMax: 80_000 },
	} as ConversationMetadata;

	it("texto que tenta pular a identidade ('acha logo os grupos') NUNCA chama o orchestrator — reemite o pedido de CPF", async () => {
		vi.mocked(db.query.conversations.findFirst).mockResolvedValueOnce({
			id: "conv-identify-fix217",
			metadata: IDENTIFY_META,
		} as never);
		vi.mocked(metaOf).mockReturnValueOnce(IDENTIFY_META);

		await processTextMessage("5562999998888", "acha logo os grupos pra mim", "Op", "msgID1");

		// Invariante dura: sem identidade, o agente NUNCA roda (search_groups vive
		// atrás do orchestrator) — a trava acontece ANTES, aqui no processor.
		expect(mocks.processOrchestratorMock).not.toHaveBeenCalled();
		expect(mocks.sendTextMock).toHaveBeenCalledTimes(1);
		const sentText = (mocks.sendTextMock.mock.calls[0]?.[1] as string).toLowerCase();
		expect(sentText).toMatch(/cpf/);
		// Nunca narra avanço/busca sem o CPF coletado (o achado real do inbox).
		expect(sentText).not.toMatch(/bora ver|vou buscar|encontrei|opç(õ|o)es reais|encaixa na sua faixa/);
	});

	it("pergunta livre ('por que precisam disso?') também reemite o CPF, sem abrir conversa livre", async () => {
		vi.mocked(db.query.conversations.findFirst).mockResolvedValueOnce({
			id: "conv-identify-fix217",
			metadata: IDENTIFY_META,
		} as never);
		vi.mocked(metaOf).mockReturnValueOnce(IDENTIFY_META);

		await processTextMessage("5562999998888", "por que vocês precisam do meu CPF?", "Op", "msgID2");

		expect(mocks.processOrchestratorMock).not.toHaveBeenCalled();
		expect(mocks.sendTextMock).toHaveBeenCalledTimes(1);
	});
});

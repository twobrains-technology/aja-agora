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

// Idempotência do canal (src/lib/whatsapp/once.ts) fala com o Postgres — nos
// testes de unidade ela é sempre "pode" — o que se prova aqui é a ENTREGA, não a
// idempotência.
vi.mock("./once", () => ({
	claimOnce: vi.fn().mockResolvedValue(true),
	claimInboundMessage: vi.fn().mockResolvedValue(true),
	claimContextBeat: vi.fn().mockResolvedValue(true),
	claimButtonClick: vi.fn().mockResolvedValue(true),
	DOUBLE_CLICK_WINDOW_MS: 12000,
}));
// Serialização por conversa (lease no Postgres) — passthrough no unitário; o que
// se prova aqui é o roteamento do processor, não o lease.
vi.mock("./conversation-lock", () => ({
	withConversationLock: <T>(_waId: string, fn: () => Promise<T>) => fn(),
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

// FIX-357 — REVOGA o FIX-217, que travava o gate identify no processor: qualquer
// texto sem CPF (inclusive uma PERGUNTA) era interceptado e respondido por texto fixo,
// sem nunca chamar o LLM. Era o agente bitolado, e o teste que morava aqui exigia isso
// ("sem abrir conversa livre") — um cadeado testando o cadeado.
//
// O invariante é sobre a AÇÃO, não sobre a FALA — e a ação já está blindada em código:
// `tool-policy.ts` só entrega `search_groups`/cards do reveal ao modelo quando
// `identityCollected === true`. Sem CPF, o modelo NÃO TEM a ferramenta de busca.
describe("Gate identify: a pergunta do cliente chega no agente (FIX-357)", () => {
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

	it("tentativa de pular ('acha logo os grupos') → o AGENTE responde (não um texto fixo)", async () => {
		vi.mocked(db.query.conversations.findFirst).mockResolvedValueOnce({
			id: "conv-identify-fix357",
			metadata: IDENTIFY_META,
		} as never);
		vi.mocked(metaOf).mockReturnValueOnce(IDENTIFY_META);

		await processTextMessage("5562999998888", "acha logo os grupos pra mim", "Op", "msgID1");

		expect(
			mocks.processOrchestratorMock,
			"o cliente pediu algo — quem responde é o modelo; a busca segue impossível sem CPF (tool-policy)",
		).toHaveBeenCalled();
		expect(mocks.sendTextMock).not.toHaveBeenCalled();
	});

	it("pergunta livre ('por que precisam do meu CPF?') → o AGENTE responde a dúvida", async () => {
		vi.mocked(db.query.conversations.findFirst).mockResolvedValueOnce({
			id: "conv-identify-fix357",
			metadata: IDENTIFY_META,
		} as never);
		vi.mocked(metaOf).mockReturnValueOnce(IDENTIFY_META);

		await processTextMessage("5562999998888", "por que vocês precisam do meu CPF?", "Op", "msgID2");

		expect(
			mocks.processOrchestratorMock,
			"reemitir o pedido de CPF em cima da pergunta é o agente bitolado — o cliente pergunta e leva a mesma coisa na cara",
		).toHaveBeenCalled();
		expect(mocks.sendTextMock).not.toHaveBeenCalled();
	});

	it("o CPF continua sendo capturado — o gate não virou sugestão", async () => {
		vi.mocked(db.query.conversations.findFirst).mockResolvedValue({
			id: "conv-identify-fix357",
			metadata: IDENTIFY_META,
		} as never);
		vi.mocked(metaOf).mockReturnValue(IDENTIFY_META);

		await processTextMessage("5562999998888", "meu cpf é 529.982.247-25", "Op", "msgID3");

		expect(mocks.processOrchestratorMock).not.toHaveBeenCalled();
	});
});

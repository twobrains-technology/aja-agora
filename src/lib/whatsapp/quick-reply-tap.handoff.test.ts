/**
 * O TAP NO ATALHO NÃO ATROPELA O ATENDENTE HUMANO.
 *
 * O caminho INTERATIVO do WhatsApp não passa pela checagem de handoff do
 * `processor` (que só cobre mensagem de texto), então cada handler que AGE faz a
 * sua — `handleInterest` e `handleDecisionEspecialista` já faziam. O handler novo
 * do atalho entrou no caminho do dinheiro sem ela (revisão de 20/08/2026).
 *
 * Cenário: o atendente assume a conversa; o cliente ainda tem os botões do
 * último atalho na tela (o WhatsApp não expira mensagem) e toca "A de prazo mais
 * curto". Sem a guarda, o bot grava `escolha`/`contractOffer`, marca
 * `decisionDispatched` e ainda fala por cima do humano — a mesma família do
 * defeito que já está aberto no cortex ("bot atropela atendente"), agora na
 * porta do contrato.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const proxy = vi.hoisted(() => ({ getHandoffState: vi.fn(), startInterestHandoff: vi.fn() }));
const cards = vi.hoisted(() => ({
	ultimoQuickReply: vi.fn(),
	registrarCardEnviado: vi.fn(),
}));
const aceite = vi.hoisted(() => ({ aplicarAceiteEstruturado: vi.fn() }));
vi.mock("@/lib/whatsapp/proxy", () => proxy);
vi.mock("./proxy", () => proxy);
vi.mock("@/lib/conversation/cards", () => cards);
vi.mock("@/lib/agent/aceite", () => aceite);

const { dispatchInteractiveReply } = await import("./interactive-handlers");

describe("handleQuickReplyTap — conversa com atendente humano", () => {
	beforeEach(() => {
		proxy.getHandoffState.mockReset();
		cards.ultimoQuickReply.mockReset();
		aceite.aplicarAceiteEstruturado.mockReset();
	});

	it("com handoff ativo, o tap NÃO ancora nada e o bot não fala", async () => {
		proxy.getHandoffState.mockResolvedValue({ isHandedOff: true });

		const handled = await dispatchInteractiveReply({
			from: "5562999990000",
			replyId: "qr_1_abc123",
			replyTitle: "A de prazo mais curto",
			contactName: "Rute",
			processTextMessage: vi.fn(),
		} as never);

		expect(handled).toBe(false);
		expect(aceite.aplicarAceiteEstruturado).not.toHaveBeenCalled();
		// Nem chega a consultar o atalho — a conversa é do humano.
		expect(cards.ultimoQuickReply).not.toHaveBeenCalled();
	});
});

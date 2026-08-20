/**
 * O CAMINHO FELIZ DO TAP — sem isto, o handler pode estar INERTE e a suíte
 * inteira continua verde.
 *
 * A revisão de 20/08/2026 provou isso por sabotagem: inserindo um `return false`
 * logo depois de o `groupId` ser resolvido, o handler deixava de ancorar,
 * persistir e conduzir — e 542 testes seguiam passando. A cobertura existente
 * era o resolvedor puro e o caso NEGATIVO do handoff, e o teste do handoff é
 * vacuoso contra essa falha por construção: ele assere que o aceite NÃO foi
 * chamado, o que também é verdade num handler morto.
 *
 * É a mesma lição que `cenario-tool-escolher-cota.fix-410.test.ts` já registrou:
 * sem o controle positivo, não dá para distinguir "o veto funcionou" de "o
 * caminho nunca rodou".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const proxy = vi.hoisted(() => ({ getHandoffState: vi.fn(), startInterestHandoff: vi.fn() }));
const cards = vi.hoisted(() => ({ ultimoQuickReply: vi.fn(), registrarCardEnviado: vi.fn() }));
const aceite = vi.hoisted(() => ({ aplicarAceiteEstruturado: vi.fn() }));
const meta = vi.hoisted(() => ({
	persistMeta: vi.fn(async (_id: string, _meta: Record<string, unknown>) => {}),
	metaOf: vi.fn(() => ({})),
	reloadMeta: vi.fn(async () => ({})),
}));
const adapter = vi.hoisted(() => ({
	fireGate: vi.fn(async () => {}),
	runDirectiveWithOrchestrator: vi.fn(async () => {}),
	runSearchSummaryWithOrchestrator: vi.fn(async () => {}),
	runTransitionWithOrchestrator: vi.fn(async () => {}),
}));
const messages = vi.hoisted(() => ({ saveMessage: vi.fn(async () => "msg-1") }));

vi.mock("./proxy", () => proxy);
vi.mock("@/lib/conversation/cards", () => cards);
vi.mock("@/lib/agent/aceite", () => aceite);
vi.mock("@/lib/conversation/meta", () => meta);
vi.mock("./adapter", () => adapter);
vi.mock("@/lib/conversation/messages", () => ({ ...messages, loadConversationHistory: vi.fn() }));

const { dispatchInteractiveReply } = await import("./interactive-handlers");
const { idDoAtalho } = await import("./quick-reply-tap");

const PAYLOAD = {
	options: [
		{ label: "A de menor parcela", groupId: "itau-158" },
		{ label: "A de prazo mais curto", groupId: "itau-147" },
	],
};

function tap(replyId: string) {
	return dispatchInteractiveReply({
		from: "5562988887777",
		replyId,
		replyTitle: "A de prazo mais curt",
		contactName: "Rute",
		processTextMessage: vi.fn(),
	} as never);
}

describe("handleQuickReplyTap — CONTROLE POSITIVO", () => {
	beforeEach(() => {
		for (const m of [
			proxy.getHandoffState,
			cards.ultimoQuickReply,
			aceite.aplicarAceiteEstruturado,
			meta.persistMeta,
			adapter.runDirectiveWithOrchestrator,
			messages.saveMessage,
		])
			m.mockReset();
		proxy.getHandoffState.mockResolvedValue(null);
		cards.ultimoQuickReply.mockResolvedValue(PAYLOAD);
		messages.saveMessage.mockResolvedValue("msg-1");
	});

	it("o tap ancora a cota, marca a decisão e conduz — o caminho vive", async () => {
		aceite.aplicarAceiteEstruturado.mockResolvedValue({
			meta: { recommendedAdministradora: "ITAÚ" },
			efeito: "escolha-ancorada",
		});

		const handled = await tap(idDoAtalho(1, PAYLOAD));

		expect(handled, "o handler tem que RECLAMAR o tap").toBe(true);
		// A cota que chegou ao aceite é a do botão tocado — não o título truncado.
		expect(aceite.aplicarAceiteEstruturado).toHaveBeenCalledTimes(1);
		expect(aceite.aplicarAceiteEstruturado.mock.calls[0][0]).toMatchObject({
			aceite: { groupId: "itau-147" },
			canal: "whatsapp",
		});
		// O estado avança: sem `decisionDispatched` o formulário de contratação
		// nunca é liberado pela tool-policy.
		expect(meta.persistMeta).toHaveBeenCalledTimes(1);
		expect(meta.persistMeta.mock.calls[0][1]).toMatchObject({ decisionDispatched: true });
		// E o agente conduz a partir da escolha.
		expect(adapter.runDirectiveWithOrchestrator).toHaveBeenCalledTimes(1);
		// A fala do cliente entra no histórico ANTES do directive rodar.
		expect(messages.saveMessage).toHaveBeenCalled();
	});

	it("sem âncora, nada é persistido e nenhum directive sai — o tap vira texto", async () => {
		aceite.aplicarAceiteEstruturado.mockResolvedValue({
			meta: {},
			efeito: "nada-cota-nao-exibida",
		});

		const handled = await tap(idDoAtalho(1, PAYLOAD));

		expect(handled, "sem âncora o dispatcher cai no caminho de texto").toBe(false);
		expect(meta.persistMeta).not.toHaveBeenCalled();
		expect(adapter.runDirectiveWithOrchestrator).not.toHaveBeenCalled();
		// E a fala NÃO é gravada aqui: quem grava é o turno de texto, a jusante.
		expect(messages.saveMessage).not.toHaveBeenCalled();
	});

	it("atalho sem cota devolve o tap ao caminho de texto, sem tocar no aceite", async () => {
		const semCota = { options: [{ label: "Pode buscar" }, { label: "Me explica melhor" }] };
		cards.ultimoQuickReply.mockResolvedValue(semCota);

		const handled = await tap(idDoAtalho(0, semCota));

		expect(handled).toBe(false);
		expect(aceite.aplicarAceiteEstruturado).not.toHaveBeenCalled();
	});
});

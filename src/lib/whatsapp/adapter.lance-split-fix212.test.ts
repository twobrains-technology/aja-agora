// Camada 1 (FIX-212) — lance-embutido em 2 tempos no WhatsApp.
//
// Kairo: "garantir que a ia fale mais naturalmente quanto a qtd de itens no
// whatsapp". O card do lance embutido carregava 3 parágrafos de aula + a pergunta
// numa unidade só. C3/C4 do spec: a educação sai como balão de contexto ANTES, e
// o card fica só com a pergunta curta + botões. Channel-aware: na web o card
// segue com educação + pergunta (gateQuestion compõe as duas).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CONV_ID = "conv-lance-split-212";
const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	reloadMeta: vi.fn(),
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
vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
}));
vi.mock("@/lib/conversation/meta", () => ({
	persistMeta: mocks.persistMeta,
	reloadMeta: mocks.reloadMeta,
}));

import { fireGate } from "./adapter";

beforeEach(() => {
	for (const m of [mocks.sendText, mocks.sendInteractive, mocks.persistMeta]) m.mockClear();
	mocks.reloadMeta.mockResolvedValue({ currentCategory: "auto" });
});

afterEach(() => vi.clearAllMocks());

// 2026-07-21: a EDUCAÇÃO enlatada do lance embutido saiu do servidor
// (`lanceEmbutidoEdu` foi removida) — ela ensinava o conselho errado e, no
// WhatsApp, ocupava o lugar da fala do modelo. Explicar é conversa, e conversa é
// do modelo, com os números que o código apura (`converse.ts`, blocoEmbutido).
// O canal entrega só a PERGUNTA curta com os botões.
describe("lance-embutido no WhatsApp — só a pergunta, sem aula enlatada", () => {
	it("fireGate('lance-embutido') emite o CARD com a pergunta curta, sem texto de educação", async () => {
		await fireGate(WA, CONV_ID, "lance-embutido", { currentCategory: "auto" } as never);

		expect(mocks.sendText).not.toHaveBeenCalled();

		// o CARD (interactive) com SÓ a pergunta curta + botões
		expect(mocks.sendInteractive).toHaveBeenCalledTimes(1);
		const card = JSON.stringify(mocks.sendInteractive.mock.calls[0]?.[1]);
		expect(card).toMatch(/Quer considerar esse tipo de lance/);
		// a aula NÃO está mais dentro do card
		expect(card).not.toMatch(/R\$ 100 mil/);
		expect(card).not.toMatch(/própria carta/);
	});
});

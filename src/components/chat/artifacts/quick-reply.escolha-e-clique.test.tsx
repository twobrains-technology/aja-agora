// @vitest-environment happy-dom
/**
 * D6 (PRD 19/08/2026) — QUANDO O ATALHO ESCOLHE UMA COTA, O CLIQUE É CLIQUE.
 *
 * O atalho de resposta rápida manda TEXTO por design, e é isso que mantém a
 * regra de ouro do FIX-406 de pé: cota, escolha e contrato só por ação
 * estruturada. Só que o agente usa esses atalhos justamente para a pergunta que
 * mais decide a venda — "qual das duas você prefere?" — e aí o clique da
 * cliente virava uma frase que o servidor recusava ancorar. Ela respondia, e
 * nada acontecia.
 *
 * Quando o servidor reconhece que o rótulo aponta para uma cota REAL exibida
 * (coerção server-side, `coerceEscolhaNosAtalhos`), o atalho ganha o `groupId`
 * e o clique passa pelo mesmo caminho do botão do card. Atalho sem cota
 * (`Me explica melhor`) continua sendo texto, como sempre foi.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chat = vi.hoisted(() => ({
	sendAction: vi.fn(),
	sendUserMessage: vi.fn(),
}));

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ ...chat, status: "ready" }),
}));

const { QuickReply } = await import("./quick-reply");

describe("QuickReply — atalho com cota vira escolha estruturada", () => {
	beforeEach(() => {
		chat.sendAction.mockClear();
		chat.sendUserMessage.mockClear();
		document.body.innerHTML = "";
	});

	it("clicar no atalho da cota manda choose_offer com o groupId real", () => {
		render(
			<QuickReply
				payload={{
					options: [
						{ label: "A de menor parcela", groupId: "ita-158" },
						{ label: "A de prazo mais curto", groupId: "ita-147" },
					],
				}}
			/>,
		);
		fireEvent.click(screen.getByText("A de prazo mais curto"));

		expect(chat.sendAction).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "choose_offer", groupId: "ita-147" }),
			"A de prazo mais curto",
		);
		expect(chat.sendUserMessage).not.toHaveBeenCalled();
	});

	it("atalho sem cota continua sendo texto puro", () => {
		render(
			<QuickReply
				payload={{ options: [{ label: "Pode buscar" }, { label: "Me explica melhor" }] }}
			/>,
		);
		fireEvent.click(screen.getByText("Me explica melhor"));

		expect(chat.sendUserMessage).toHaveBeenCalledWith("Me explica melhor");
		expect(chat.sendAction).not.toHaveBeenCalled();
	});
});

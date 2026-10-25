// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AjaUIMessage } from "@/lib/chat/ui-message";

const ctx = vi.hoisted(() => ({
	sendAction: vi.fn(),
	status: "ready" as "ready" | "submitted" | "streaming" | "error",
	messages: [] as AjaUIMessage[],
}));

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendAction: ctx.sendAction,
		status: ctx.status,
		messages: ctx.messages,
	}),
}));

import { BotaoConfirmarContratar } from "./botao-confirmar-contratar";

beforeEach(() => {
	ctx.sendAction.mockReset();
	ctx.status = "ready";
	ctx.messages = [];
});

afterEach(cleanup);

function assistant(texto: string, id = "m-resposta"): AjaUIMessage {
	return {
		id,
		role: "assistant",
		parts: [{ type: "text", text: texto }],
	} as unknown as AjaUIMessage;
}

function fecho(type: "signature_handoff" | "atendimento_handoff", id = "m-fecho"): AjaUIMessage {
	return {
		id,
		role: "assistant",
		parts: [{ type: "data-artifact", data: { type, payload: {} } }],
	} as unknown as AjaUIMessage;
}

/** O turno no ar, como o `useChat` entrega: `submitted` → `streaming`. */
function streamar(view: ReturnType<typeof render>) {
	ctx.status = "submitted";
	view.rerender(<BotaoConfirmarContratar />);
	ctx.status = "streaming";
	view.rerender(<BotaoConfirmarContratar />);
}

/** O turno termina com a conversa atual. */
function terminar(view: ReturnType<typeof render>, mensagens: AjaUIMessage[]) {
	ctx.messages = mensagens;
	ctx.status = "ready";
	view.rerender(<BotaoConfirmarContratar />);
}

describe("“Confirmar e contratar” — retorno visual imediato (R5.7)", () => {
	it("muda o rótulo do botão no clique, sem esperar a resposta do servidor", () => {
		// O servidor demora: a promessa NÃO resolve durante o teste.
		ctx.sendAction.mockImplementation(() => new Promise<void>(() => {}));

		render(<BotaoConfirmarContratar />);
		const botao = screen.getByTestId("offer-confirm");
		expect(botao.textContent).toContain("Confirmar e contratar");

		fireEvent.click(botao);

		// Síncrono ao clique: o cliente vê que algo aconteceu antes do servidor falar.
		expect(botao.textContent).toContain("Confirmando");
		expect((botao as HTMLButtonElement).disabled).toBe(true);
		expect(ctx.sendAction).toHaveBeenCalledWith({ kind: "offer-confirm" }, "Confirmo essa carta");
	});

	it("volta ao normal se a ação falhar (cliente pode tentar de novo)", async () => {
		ctx.sendAction.mockRejectedValue(new Error("sem rede"));

		render(<BotaoConfirmarContratar />);
		const botao = screen.getByTestId("offer-confirm");
		fireEvent.click(botao);

		await vi.waitFor(() => {
			expect(botao.textContent).toContain("Confirmar e contratar");
		});
		expect((botao as HTMLButtonElement).disabled).toBe(false);
	});
});

describe("“Confirmar e contratar” — recuperação quando o fecho não acontece (P144/P292)", () => {
	// A causa: `api/chat/route.ts` converte a falha de negócio do `confirmOffer`
	// em TEXTO normal ("Tive um problema ao gerar sua proposta. Pode tentar
	// confirmar de novo?") — o response é 200, a promessa do `sendAction`
	// RESOLVE e o `.catch` nunca roda. Travar até a rejeição deixava o botão
	// morto justo no caso em que o cliente precisa clicar de novo.
	it("libera o clique quando o turno termina sem fechar o contrato", () => {
		ctx.sendAction.mockImplementation(() => new Promise<void>(() => {}));

		const view = render(<BotaoConfirmarContratar />);
		const botao = screen.getByTestId("offer-confirm") as HTMLButtonElement;
		fireEvent.click(botao);
		streamar(view);

		terminar(view, [
			assistant("Tive um problema ao gerar sua proposta. Pode tentar confirmar de novo?"),
		]);

		expect(botao.textContent).toContain("Confirmar e contratar");
		expect(botao.disabled).toBe(false);

		// E o segundo clique volta a disparar a ação.
		fireEvent.click(botao);
		expect(ctx.sendAction).toHaveBeenCalledTimes(2);
	});

	it("também libera quando o turno termina em erro, sem card de fecho", () => {
		ctx.sendAction.mockImplementation(() => new Promise<void>(() => {}));

		const view = render(<BotaoConfirmarContratar />);
		const botao = screen.getByTestId("offer-confirm") as HTMLButtonElement;
		fireEvent.click(botao);
		streamar(view);

		ctx.messages = [assistant("Algo deu errado por aqui.")];
		ctx.status = "error";
		view.rerender(<BotaoConfirmarContratar />);

		expect(botao.disabled).toBe(false);
	});

	it("fica concluído quando a proposta em PDF fecha o contrato", () => {
		ctx.sendAction.mockImplementation(() => new Promise<void>(() => {}));

		const view = render(<BotaoConfirmarContratar />);
		const botao = screen.getByTestId("offer-confirm") as HTMLButtonElement;
		fireEvent.click(botao);
		streamar(view);

		terminar(view, [assistant("Sua cota está reservada."), fecho("signature_handoff")]);

		expect(botao.textContent).toContain("Proposta confirmada");
		expect(botao.disabled).toBe(true);
		expect(botao.dataset.concluido).toBe("true");

		// Concluído NÃO reabre: um segundo clique criaria outra proposta.
		fireEvent.click(botao);
		expect(ctx.sendAction).toHaveBeenCalledTimes(1);
	});

	it("fica concluído também no fecho sem PDF, com o card do atendente", () => {
		// `prepararPropostaParaEnvio` é best-effort: sem PDF não sai
		// `signature_handoff`, mas a contratação fechou e o fecho traz o card do
		// atendimento. Reabrir aqui ofereceria uma segunda proposta.
		ctx.sendAction.mockImplementation(() => new Promise<void>(() => {}));

		const view = render(<BotaoConfirmarContratar />);
		const botao = screen.getByTestId("offer-confirm") as HTMLButtonElement;
		fireEvent.click(botao);
		streamar(view);

		terminar(view, [assistant("Sua cota está reservada."), fecho("atendimento_handoff")]);

		expect(botao.textContent).toContain("Proposta confirmada");
		expect(botao.disabled).toBe(true);
	});

	it("não confunde card de fecho ANTIGO com o fechamento deste clique", () => {
		// A conversa pode já ter um `signature_handoff` de um fecho anterior: só o
		// que chegou DEPOIS do clique prova que este pedido fechou.
		ctx.messages = [fecho("signature_handoff", "m-fecho-antigo")];
		ctx.sendAction.mockImplementation(() => new Promise<void>(() => {}));

		const view = render(<BotaoConfirmarContratar />);
		const botao = screen.getByTestId("offer-confirm") as HTMLButtonElement;
		fireEvent.click(botao);
		streamar(view);

		terminar(view, [
			fecho("signature_handoff", "m-fecho-antigo"),
			assistant("Tive um problema ao gerar sua proposta. Pode tentar confirmar de novo?", "m-erro"),
		]);

		expect(botao.disabled).toBe(false);
		expect(botao.dataset.concluido).toBeUndefined();
	});
});

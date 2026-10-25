// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({
	sendAction: vi.fn(),
}));

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendAction: ctx.sendAction,
		status: "ready" as const,
		messages: [],
	}),
}));

import { BotaoConfirmarContratar } from "./botao-confirmar-contratar";

afterEach(cleanup);

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
		ctx.sendAction.mockReset();
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

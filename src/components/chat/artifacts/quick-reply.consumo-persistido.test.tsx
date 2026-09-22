// @vitest-environment happy-dom
/**
 * L4 — CONSUMO PERSISTIDO DO ATALHO DE RESPOSTA RÁPIDA.
 *
 * Medido em produção (21/09/2026): o `quick_reply` sumia só por estado local
 * (`submitted`), então recarregar a página devolvia o botão vivo e o cliente
 * clicava o mesmo atalho duas vezes. O segundo clique era reprocessado como
 * resposta nova e o agente respondia seco ("você já viu o formulário aqui em
 * cima").
 *
 * Aqui se prova o comportamento, não a fala: o atalho já consumido não volta,
 * o primeiro clique reivindica antes de enviar, e o clique repetido NÃO dispara
 * um turno novo — a tela aponta o próximo passo.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chat = vi.hoisted(() => ({
	sendAction: vi.fn(),
	sendUserMessage: vi.fn(),
	conversationId: "conv-1",
}));

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ ...chat, status: "ready" }),
}));

const { QuickReply } = await import("./quick-reply");

type FakeResponse = { ok: boolean; json: () => Promise<unknown> };

function resposta(body: unknown, ok = true): FakeResponse {
	return { ok, json: async () => body };
}

describe("QuickReply — consumo persistido do atalho", () => {
	beforeEach(() => {
		chat.sendAction.mockClear();
		chat.sendUserMessage.mockClear();
		document.body.innerHTML = "";
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("não devolve no reload o atalho já consumido", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => resposta({ consumed: ["r-aluguel"] })),
		);
		render(
			<QuickReply
				payload={{
					options: [
						{ label: "Aluguel", replyId: "r-aluguel" },
						{ label: "Comprar", replyId: "r-comprar" },
					],
				}}
			/>,
		);

		expect(await screen.findByText("Comprar")).toBeTruthy();
		await waitFor(() => expect(screen.queryByText("Aluguel")).toBeNull());
	});

	it("primeiro clique reivindica o consumo e envia o turno", async () => {
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
			init?.method === "POST" ? resposta({ claimed: true }) : resposta({ consumed: [] }),
		);
		vi.stubGlobal("fetch", fetchMock);
		render(<QuickReply payload={{ options: [{ label: "Pode buscar", replyId: "r-buscar" }] }} />);

		fireEvent.click(screen.getByText("Pode buscar"));

		await waitFor(() => expect(chat.sendUserMessage).toHaveBeenCalledWith("Pode buscar"));
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/chat/quick-reply",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("clique repetido não vira resposta seca: não envia turno e aponta o próximo passo", async () => {
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
			init?.method === "POST" ? resposta({ claimed: false }) : resposta({ consumed: [] }),
		);
		vi.stubGlobal("fetch", fetchMock);
		render(<QuickReply payload={{ options: [{ label: "Tenho interesse", replyId: "r-i" }] }} />);

		fireEvent.click(screen.getByText("Tenho interesse"));

		expect(await screen.findByText(/próximo passo/i)).toBeTruthy();
		expect(chat.sendUserMessage).not.toHaveBeenCalled();
		expect(chat.sendAction).not.toHaveBeenCalled();
	});
});

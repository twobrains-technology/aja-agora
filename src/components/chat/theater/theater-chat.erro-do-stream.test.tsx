// @vitest-environment happy-dom
// B5b — o chat NO AR mostra o erro em português, nunca o código cru.
//
// A tradução do B5 morava numa casca de layout que NÃO é renderizada em nenhuma
// rota — quem o cliente vê é o `TheaterChat` (via ChatTheater nas landings).
// Este teste monta o componente VIVO: o servidor manda um CÓDIGO no erro do
// stream, e a tela tem que mostrar o texto da UI em português.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O erro que o `useChatContext` entrega — trocado por teste.
const estado: { error: Error | undefined } = { error: undefined };

vi.mock("@/lib/chat/provider", () => ({
	ChatProvider: ({ children }: { children: React.ReactNode }) => children,
	useChatContext: () => ({
		conversationId: "conv-teste",
		messages: [],
		status: "ready",
		error: estado.error,
		handoff: { status: "active", agentName: null },
		sendUserMessage: vi.fn(async () => {}),
		sendAction: vi.fn(async () => {}),
		regenerate: vi.fn(),
		reset: vi.fn(),
		resetAll: vi.fn(),
		refreshHandoff: vi.fn(),
	}),
}));

vi.mock("@/lib/analytics/data-layer", () => ({
	empurrarMarcosNoDataLayer: vi.fn(async () => {}),
}));

import { TEXTO_ERRO_DO_CHAT } from "@/lib/chat/stream-error";
import { TheaterChat } from "./theater-chat";

beforeEach(() => {
	estado.error = undefined;
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({ ok: true, json: async () => ({ conversation: null }) })),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** Monta o chat vivo e espera o composer (o resume assenta antes do body). */
async function montarComErro(error: Error | undefined) {
	estado.error = error;
	render(<TheaterChat seed="" settled />);
	await screen.findByLabelText("Digite sua mensagem");
}

describe("TheaterChat — erro do stream em português", () => {
	it("código de billing vira o texto em português e não mostra o código cru", async () => {
		await montarComErro(new Error("llm_billing"));

		const banner = screen.getByTestId("chat-erro");
		expect(banner.textContent).toBe(TEXTO_ERRO_DO_CHAT.llm_billing);
		expect(screen.queryByText("llm_billing")).toBeNull();
	});

	it("código de indisponível vira o texto em português", async () => {
		await montarComErro(new Error("llm_indisponivel"));

		expect(screen.getByTestId("chat-erro").textContent).toBe(
			TEXTO_ERRO_DO_CHAT.llm_indisponivel,
		);
	});

	it("erro que não é do conjunto (watchdog, já em português) não vira banner", async () => {
		await montarComErro(new Error("A resposta demorou demais. Pode tentar de novo?"));

		expect(screen.queryByTestId("chat-erro")).toBeNull();
	});

	it("sem erro não há banner", async () => {
		await montarComErro(undefined);

		expect(screen.queryByTestId("chat-erro")).toBeNull();
	});
});
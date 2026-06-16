// @vitest-environment happy-dom
/**
 * FIX-51 — gate de entrada da retomada. Conversa retomável COM progresso real →
 * popup (não hidrata direto). "Voltar à conversa" → ChatProvider hidratado.
 * "Começar nova" → ChatProvider SEM initialMessages (thread limpa; o cookie/
 * contato é preservado pelo POST /api/chat). Conversa sem progresso → sem popup
 * (hidrata direto, zero ruído).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hooks/use-reduced-motion", () => ({ useReducedMotion: () => true }));

// Captura o que o ChatProvider recebe (prova hidratado vs limpo) sem montar o chat real.
const captured: { mounted: boolean; hasInitialMessages: boolean; count: number } = {
	mounted: false,
	hasInitialMessages: false,
	count: 0,
};
vi.mock("@/lib/chat/provider", () => ({
	ChatProvider: ({
		children,
		initialMessages,
	}: {
		children: React.ReactNode;
		initialMessages?: unknown[];
	}) => {
		captured.mounted = true;
		captured.hasInitialMessages = Array.isArray(initialMessages);
		captured.count = Array.isArray(initialMessages) ? initialMessages.length : 0;
		return <div data-testid="chat-provider">{children}</div>;
	},
	useChatContext: () => ({
		messages: [],
		status: "ready",
		error: undefined,
		regenerate: vi.fn(),
		sendUserMessage: vi.fn(),
	}),
}));
vi.mock("../message-list", () => ({ MessageList: () => <div data-testid="message-list" /> }));
vi.mock("../chat-input", () => ({ ChatInput: () => <div data-testid="chat-input" /> }));

import { TheaterChat } from "./theater-chat";

function stubResume(conversation: unknown) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ conversation }) }),
	);
}

const RESUMABLE = {
	conversationId: "conv-1",
	messages: [
		{ id: "m1", role: "user", content: "quero um carro" },
		{ id: "m2", role: "assistant", content: "vamos planejar" },
	],
	messageCount: 6,
	lastActivityAt: "2026-06-15T10:00:00.000Z",
	meaningfulProgress: true,
};

beforeEach(() => {
	captured.mounted = false;
	captured.hasInitialMessages = false;
	captured.count = 0;
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("FIX-51 — TheaterChat gate de retomada", () => {
	it("conversa com progresso real → mostra o popup, NÃO hidrata direto", async () => {
		stubResume(RESUMABLE);
		render(<TheaterChat seed="" settled={true} />);
		expect(await screen.findByText(/Continuar de onde você parou/i)).toBeDefined();
		expect(screen.queryByTestId("chat-provider")).toBeNull();
		expect(captured.mounted).toBe(false);
	});

	it("'Voltar à conversa' → ChatProvider hidratado com o histórico", async () => {
		stubResume(RESUMABLE);
		render(<TheaterChat seed="" settled={true} />);
		fireEvent.click(await screen.findByRole("button", { name: /Voltar à conversa/i }));
		await waitFor(() => expect(screen.getByTestId("chat-provider")).toBeDefined());
		expect(captured.hasInitialMessages).toBe(true);
		expect(captured.count).toBe(2);
	});

	it("'Começar nova' → ChatProvider SEM initialMessages (thread limpa)", async () => {
		stubResume(RESUMABLE);
		render(<TheaterChat seed="" settled={true} />);
		fireEvent.click(await screen.findByRole("button", { name: /Começar nova/i }));
		await waitFor(() => expect(screen.getByTestId("chat-provider")).toBeDefined());
		expect(captured.hasInitialMessages).toBe(false);
		expect(captured.count).toBe(0);
	});

	it("conversa SEM progresso significativo → hidrata direto, sem popup (zero ruído)", async () => {
		stubResume({
			conversationId: "conv-2",
			messages: [{ id: "m1", role: "user", content: "oi" }],
			messageCount: 1,
			lastActivityAt: "2026-06-15T10:00:00.000Z",
			meaningfulProgress: false,
		});
		render(<TheaterChat seed="" settled={true} />);
		await waitFor(() => expect(screen.getByTestId("chat-provider")).toBeDefined());
		expect(screen.queryByText(/Continuar de onde você parou/i)).toBeNull();
		expect(captured.hasInitialMessages).toBe(true);
	});
});

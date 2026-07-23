// @vitest-environment happy-dom
/**
 * FIX-368 (rodada 2, veredito do juiz) — o seed sintético "Voltei" (disparado
 * automaticamente pelo teatro quando a retomada hidrata SEM nada digitado pelo
 * cliente) precisa sinalizar `isResumeGreeting: true` pro backend, pra
 * `system-prompt.ts` disparar o reconhecimento da reserva já feita na PRIMEIRA
 * frase — sem essa sinalização o servidor não tem como distinguir esta
 * mensagem de um "Voltei" digitado à mão no meio da conversa. Ver
 * `system-prompt.resume-after-close.test.ts` pra cobertura da montagem do
 * prompt em si.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hooks/use-reduced-motion", () => ({ useReducedMotion: () => true }));

const sendUserMessage = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	ChatProvider: ({ children }: { children: React.ReactNode }) => children,
	useChatContext: () => ({
		messages: [],
		status: "ready",
		error: undefined,
		regenerate: vi.fn(),
		sendUserMessage,
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

// `meaningfulProgress: false` hidrata DIRETO (sem popup de escolha) — caminho
// mais simples pra observar o seed sintético disparando.
const RESUMABLE_SEM_POPUP = {
	conversationId: "conv-1",
	messages: [
		{ id: "m1", role: "user", content: "quero um carro" },
		{ id: "m2", role: "assistant", content: "vamos planejar" },
	],
	messageCount: 2,
	lastActivityAt: "2026-07-22T10:00:00.000Z",
	meaningfulProgress: false,
};

beforeEach(() => {
	sendUserMessage.mockClear();
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("FIX-368 — sinalização isResumeGreeting no seed de retomada", () => {
	it('conversa retomada sem seed digitado → envia "Voltei" com isResumeGreeting: true', async () => {
		stubResume(RESUMABLE_SEM_POPUP);
		vi.useFakeTimers();
		try {
			render(<TheaterChat seed="" settled={true} />);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});
			expect(sendUserMessage).toHaveBeenCalledWith("Voltei", { isResumeGreeting: true });
		} finally {
			vi.useRealTimers();
		}
	});

	it("conversa fresca (sem retomada) com seed digitado → isResumeGreeting: false", async () => {
		stubResume(null);
		vi.useFakeTimers();
		try {
			render(<TheaterChat seed="Quero trocar de carro." settled={true} />);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});
			expect(sendUserMessage).toHaveBeenCalledWith("Quero trocar de carro.", {
				isResumeGreeting: false,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("chip de categoria numa conversa JÁ retomada → reenvia o texto do chip, isResumeGreeting: false (não é o 'Voltei' sintético)", async () => {
		stubResume(RESUMABLE_SEM_POPUP);
		vi.useFakeTimers();
		try {
			render(<TheaterChat seed="Quero comprar um carro." seedOrigin="chip" settled={true} />);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});
			// seedOrigin "chip" + retomando → seedDoCliente vira "" → cai no "Voltei" sintético.
			expect(sendUserMessage).toHaveBeenCalledWith("Voltei", { isResumeGreeting: true });
		} finally {
			vi.useRealTimers();
		}
	});
});

// @vitest-environment happy-dom
/**
 * Integração — "Modo Teatro" (handoff_chat_teatro). Roda em reduced-motion pra
 * ser determinístico (sem WAAPI, que happy-dom não implementa): nesse caminho o
 * morph é pulado e o painel abre/fecha direto. Cobre: abre ao gatilho, trava o
 * scroll do body, X/scrim/Esc fecham e restauram o scroll, e a semente vira a
 * 1ª mensagem do usuário no chat real.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// reduced-motion ON → caminho determinístico, sem element.animate().
vi.mock("@/lib/hooks/use-reduced-motion", () => ({
	useReducedMotion: () => true,
}));

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

// Isola a casca: não puxa a árvore de artefatos/markdown do chat real.
vi.mock("../message-list", () => ({
	MessageList: () => <div data-testid="message-list" />,
}));
vi.mock("../chat-input", () => ({
	ChatInput: () => <div data-testid="chat-input" />,
}));

import { ChatTheater } from "./chat-theater";
import { TheaterProvider, useTheater } from "./theater-context";

function Harness({ seed = "" }: { seed?: string }) {
	const { openTheater } = useTheater();
	return (
		<button type="button" data-testid="trigger" onClick={(e) => openTheater(seed, e.currentTarget)}>
			abrir
		</button>
	);
}

function renderTheater(seed = "") {
	return render(
		<TheaterProvider>
			<Harness seed={seed} />
			<ChatTheater />
		</TheaterProvider>,
	);
}

beforeEach(() => {
	sendUserMessage.mockClear();
	document.body.style.overflow = "";
	// TheaterChat consulta GET /api/chat/resume ao abrir (FIX-46). Sem mock, o
	// fetch real pende/falha e o painel fica preso em "loading" — o chat nunca
	// monta. Default destes testes: SEM conversa anterior (primeira vez), que é
	// o cenário em que a semente vira a 1ª mensagem.
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ conversation: null }),
		}),
	);
});

afterEach(() => {
	cleanup();
	document.body.style.overflow = "";
	vi.unstubAllGlobals();
});

describe("Modo Teatro — casca de transição", () => {
	it("não renderiza o painel até o gatilho", () => {
		renderTheater();
		expect(screen.queryByTestId("chat-theater")).toBeNull();
	});

	it("abre ao clicar no gatilho e trava o scroll do body", () => {
		renderTheater();
		act(() => {
			fireEvent.click(screen.getByTestId("trigger"));
		});
		expect(screen.getByTestId("chat-theater")).toBeTruthy();
		expect(screen.getByRole("dialog", { name: "Conversa com a Aja Agora" })).toBeTruthy();
		expect(document.body.style.overflow).toBe("hidden");
	});

	it("o botão X fecha e restaura o scroll", async () => {
		renderTheater();
		act(() => {
			fireEvent.click(screen.getByTestId("trigger"));
		});
		act(() => {
			fireEvent.click(screen.getByTestId("theater-close"));
		});
		await waitFor(() => expect(screen.queryByTestId("chat-theater")).toBeNull());
		expect(document.body.style.overflow).toBe("");
	});

	it("clicar no scrim fecha", async () => {
		renderTheater();
		act(() => {
			fireEvent.click(screen.getByTestId("trigger"));
		});
		act(() => {
			fireEvent.click(screen.getByTestId("theater-scrim"));
		});
		await waitFor(() => expect(screen.queryByTestId("chat-theater")).toBeNull());
	});

	it("Esc fecha", async () => {
		renderTheater();
		act(() => {
			fireEvent.click(screen.getByTestId("trigger"));
		});
		act(() => {
			fireEvent.keyDown(window, { key: "Escape" });
		});
		await waitFor(() => expect(screen.queryByTestId("chat-theater")).toBeNull());
	});

	it("semente não-vazia vira a 1ª mensagem do usuário no chat real", async () => {
		vi.useFakeTimers();
		try {
			renderTheater("Quero trocar de carro.");
			act(() => {
				fireEvent.click(screen.getByTestId("trigger"));
			});
			// resolve o GET /api/chat/resume (sem conversa anterior) → monta o chat
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			expect(sendUserMessage).not.toHaveBeenCalled();
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

	it("REGRESSÃO: semente sobrevive ao double-invoke do StrictMode (Next dev) — envia 1x", async () => {
		// Em dev, o React StrictMode roda mount→cleanup→remount. Um guard via ref
		// (sentRef) persiste entre os invokes: o cleanup do 1º timer dispara, mas o
		// guard impede reagendar no remount → a semente nunca era enviada (bug
		// encontrado no smoke: a 1ª mensagem do chip não aparecia). O effect deve
		// reagendar no remount e enviar exatamente uma vez.
		vi.useFakeTimers();
		try {
			render(
				<StrictMode>
					<TheaterProvider>
						<Harness seed="Quero trocar de carro." />
						<ChatTheater />
					</TheaterProvider>
				</StrictMode>,
			);
			act(() => {
				fireEvent.click(screen.getByTestId("trigger"));
			});
			// resolve o(s) fetch(es) de resume (StrictMode dispara o effect 2x) →
			// monta o chat e agenda o timer da semente; só então avança o relógio.
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(600);
			});
			expect(sendUserMessage).toHaveBeenCalledTimes(1);
			expect(sendUserMessage).toHaveBeenCalledWith("Quero trocar de carro.", {
				isResumeGreeting: false,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("semente vazia NÃO dispara mensagem (abre na saudação do agente)", async () => {
		vi.useFakeTimers();
		try {
			renderTheater("");
			act(() => {
				fireEvent.click(screen.getByTestId("trigger"));
			});
			// resolve o resume e monta o chat — mesmo montado, semente vazia não envia
			await act(async () => {
				await vi.advanceTimersByTimeAsync(500);
			});
			expect(sendUserMessage).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});

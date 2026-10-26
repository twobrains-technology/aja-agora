// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AjaUIMessage } from "@/lib/chat/ui-message";

const ctx = vi.hoisted(() => ({
	sendUserMessage: vi.fn(),
	resetAll: vi.fn(),
	status: "ready" as "ready" | "streaming" | "submitted" | "error",
	error: undefined as Error | undefined,
	messages: [] as AjaUIMessage[],
}));

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendUserMessage: ctx.sendUserMessage,
		resetAll: ctx.resetAll,
		status: ctx.status,
		error: ctx.error,
		messages: ctx.messages,
	}),
}));

vi.mock("@/lib/heatmap/chat", () => ({ chatDigitou: vi.fn() }));

import { ChatInput } from "./chat-input";

afterEach(cleanup);

function textarea(): HTMLTextAreaElement {
	return screen.getByLabelText("Digite sua mensagem") as HTMLTextAreaElement;
}

describe("ChatInput — 429 do /api/chat (R5.6)", () => {
	beforeEach(() => {
		ctx.sendUserMessage.mockReset();
		ctx.sendUserMessage.mockResolvedValue(undefined);
		ctx.status = "ready";
		ctx.error = undefined;
	});

	it("devolve a mensagem digitada quando o servidor responde 429", () => {
		const { rerender } = render(<ChatInput isStreaming={false} />);
		fireEvent.change(textarea(), { target: { value: "quero ver as opções de 60 mil" } });
		fireEvent.keyDown(textarea(), { key: "Enter" });

		expect(ctx.sendUserMessage).toHaveBeenCalledWith("quero ver as opções de 60 mil");
		expect(textarea().value).toBe("");

		// O servidor recusou com o código de limite (`respostaDeLimiteDeMensagens`).
		ctx.status = "error";
		ctx.error = new Error("llm_rate_limit");
		rerender(<ChatInput isStreaming={false} />);

		// A mensagem volta pro campo: o cliente reenvia sem digitar de novo.
		expect(textarea().value).toBe("quero ver as opções de 60 mil");
		expect((screen.getByLabelText("Enviar mensagem") as HTMLButtonElement).disabled).toBe(false);
	});

	it("não devolve a mensagem quando o campo já tem outra coisa digitada", () => {
		const { rerender } = render(<ChatInput isStreaming={false} />);
		fireEvent.change(textarea(), { target: { value: "oi" } });
		fireEvent.keyDown(textarea(), { key: "Enter" });

		fireEvent.change(textarea(), { target: { value: "outra coisa" } });
		ctx.status = "error";
		ctx.error = new Error("llm_rate_limit");
		rerender(<ChatInput isStreaming={false} />);

		expect(textarea().value).toBe("outra coisa");
	});
});

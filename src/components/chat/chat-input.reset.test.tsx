// @vitest-environment happy-dom
/**
 * Camada 1 — /reset web (D17): interceptação do comando oculto no input.
 * Test plan P0-3 (docs/test-plans/reset-web.md): só o match EXATO
 * (trim+lowercase === "/reset") intercepta — espelha o WhatsApp
 * (processor.ts:45). O comando NUNCA vira mensagem (não vai pro LLM
 * nem pro histórico).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendUserMessage = vi.fn();
const resetAll = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendUserMessage, resetAll, status: "ready" }),
}));

import { ChatInput } from "./chat-input";

beforeEach(() => {
	sendUserMessage.mockClear();
	resetAll.mockClear();
	document.body.innerHTML = "";
});

afterEach(() => {
	cleanup();
});

function type(text: string) {
	const input = screen.getByLabelText("Digite sua mensagem");
	fireEvent.change(input, { target: { value: text } });
	fireEvent.keyDown(input, { key: "Enter" });
	return input as HTMLTextAreaElement;
}

describe("D17 — comando oculto /reset no chat web", () => {
	it("'/reset' intercepta: chama resetAll, NÃO envia mensagem, limpa o input", () => {
		render(<ChatInput isStreaming={false} />);
		const input = type("/reset");
		expect(resetAll).toHaveBeenCalledTimes(1);
		expect(sendUserMessage).not.toHaveBeenCalled();
		expect(input.value).toBe("");
	});

	it("variações de caixa/espaço interceptam: ' /RESET ' e '/Reset'", () => {
		render(<ChatInput isStreaming={false} />);
		type(" /RESET ");
		type("/Reset");
		expect(resetAll).toHaveBeenCalledTimes(2);
		expect(sendUserMessage).not.toHaveBeenCalled();
	});

	it("'/resetar', 'reset' e '/reset agora' NÃO interceptam — viram mensagem normal", () => {
		render(<ChatInput isStreaming={false} />);
		type("/resetar");
		type("reset");
		type("/reset agora");
		expect(resetAll).not.toHaveBeenCalled();
		expect(sendUserMessage).toHaveBeenCalledTimes(3);
		expect(sendUserMessage.mock.calls.map(([t]) => t)).toEqual([
			"/resetar",
			"reset",
			"/reset agora",
		]);
	});

	it("durante streaming o input está bloqueado — /reset não dispara (P0-5: sem race com stream)", () => {
		render(<ChatInput isStreaming={true} />);
		type("/reset");
		expect(resetAll).not.toHaveBeenCalled();
		expect(sendUserMessage).not.toHaveBeenCalled();
	});
});

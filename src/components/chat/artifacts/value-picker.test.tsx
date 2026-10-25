// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AjaUIMessage } from "@/lib/chat/ui-message";

const ctx = vi.hoisted(() => ({
	messages: [] as AjaUIMessage[],
	sendUserMessage: vi.fn(),
	sendAction: vi.fn(),
	status: "ready" as "ready" | "streaming" | "submitted",
}));

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendUserMessage: ctx.sendUserMessage,
		sendAction: ctx.sendAction,
		status: ctx.status,
		messages: ctx.messages,
	}),
}));

import { ValuePicker } from "./value-picker";

afterEach(cleanup);

const PAYLOAD = {
	category: "auto" as const,
	fields: [
		{
			id: "credit",
			label: "Valor do carro",
			min: 20_000,
			max: 200_000,
			step: 10_000,
			default: 40_000,
			format: "currency" as const,
		},
	],
};

function user(text: string, id: string): AjaUIMessage {
	return { id, role: "user", parts: [{ type: "text", text }] } as unknown as AjaUIMessage;
}

describe("ValuePicker — recolhe quando o cliente digita o valor na conversa (R5.5)", () => {
	it("some depois que o cliente manda o valor pelo campo de texto do chat", () => {
		ctx.messages = [];
		const { rerender } = render(<ValuePicker payload={PAYLOAD} />);
		expect(screen.getByTestId("value-input-credit")).toBeTruthy();

		// O cliente ignorou o card e digitou "uns 60 mil" na conversa.
		ctx.messages = [user("uns 60 mil", "u1")];
		rerender(<ValuePicker payload={PAYLOAD} />);

		expect(screen.queryByTestId("value-input-credit")).toBeNull();
	});

	it("continua na tela enquanto o cliente não respondeu nada", () => {
		ctx.messages = [user("quero um carro", "u0")];
		const { rerender } = render(<ValuePicker payload={PAYLOAD} />);
		expect(screen.getByTestId("value-input-credit")).toBeTruthy();

		rerender(<ValuePicker payload={PAYLOAD} />);
		expect(screen.getByTestId("value-input-credit")).toBeTruthy();
	});
});

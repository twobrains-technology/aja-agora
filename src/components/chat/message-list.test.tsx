// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AjaUIMessage } from "@/lib/chat/ui-message";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendUserMessage: vi.fn(),
		sendAction: vi.fn(),
		status: "ready" as const,
		messages: [],
	}),
}));

import { MessageList } from "./message-list";

afterEach(cleanup);

function user(text: string, id: string): AjaUIMessage {
	return { id, role: "user", parts: [{ type: "text", text }] } as unknown as AjaUIMessage;
}

describe("MessageList — pergunta duplicada", () => {
	it("não repete o mesmo balão quando a reconciliação do stream traz a mesma fala", () => {
		render(
			<MessageList
				messages={[
					user("Quero comprar um carro de uns 60 mil.", "u1"),
					user("Quero comprar um carro de uns 60 mil.", "u2-reconciliada"),
				]}
				isStreaming={false}
			/>,
		);

		expect(screen.getAllByText("Quero comprar um carro de uns 60 mil.")).toHaveLength(1);
	});

	it("mantém duas falas iguais quando o cliente repetiu de propósito em turnos diferentes", () => {
		render(
			<MessageList
				messages={[
					user("oi", "u1"),
					{
						id: "a1",
						role: "assistant",
						parts: [{ type: "text", text: "Oi! Como posso ajudar?" }],
					} as unknown as AjaUIMessage,
					user("oi", "u2"),
				]}
				isStreaming={false}
			/>,
		);

		expect(screen.getAllByText("oi")).toHaveLength(2);
	});
});

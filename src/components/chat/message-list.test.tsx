// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
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

describe("MessageList — feedback após enviar", () => {
	it("mostra o 'Digitando…' quando o lead acabou de enviar e o agente ainda não respondeu", () => {
		render(<MessageList messages={[user("Oi", "u1")]} isStreaming />);
		expect(screen.getByText("Oi")).toBeTruthy();
		expect(screen.getByText("Digitando…")).toBeTruthy();
	});

	it("não mostra o indicador fora do envio", () => {
		render(<MessageList messages={[user("Oi", "u1")]} isStreaming={false} />);
		expect(screen.queryByText("Digitando…")).toBeNull();
	});

	it("o indicador some quando o assistente já tem texto", () => {
		const assistant = {
			id: "a1",
			role: "assistant",
			parts: [{ type: "text", text: "Olá, tudo bem?" }],
		} as unknown as AjaUIMessage;
		render(<MessageList messages={[user("Oi", "u1"), assistant]} isStreaming />);
		expect(screen.queryByText("Digitando…")).toBeNull();
		expect(screen.getByText(/Olá, tudo bem/)).toBeTruthy();
	});
});

describe("MessageList — um indicador por vez", () => {
	const assistantVazio = { id: "a1", role: "assistant", parts: [] } as unknown as AjaUIMessage;

	it("(a) só o lead enviou: um 'Digitando…' e nenhuma pílula, mesmo após 7s", () => {
		vi.useFakeTimers();
		try {
			render(<MessageList messages={[user("Oi", "u1")]} isStreaming />);
			act(() => {
				vi.advanceTimersByTime(7_000);
			});
			expect(screen.getAllByText("Digitando…")).toHaveLength(1);
			expect(screen.queryByText("Montando sua resposta")).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("(b) assistente vazio em streaming: só a pílula, zero 'Digitando…'", () => {
		vi.useFakeTimers();
		try {
			render(<MessageList messages={[user("Oi", "u1"), assistantVazio]} isStreaming />);
			act(() => {
				vi.advanceTimersByTime(7_000);
			});
			expect(screen.getAllByText("Montando sua resposta")).toHaveLength(1);
			expect(screen.queryByText("Digitando…")).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("(c) assistente com texto: nenhum dos dois", () => {
		const assistant = {
			id: "a1",
			role: "assistant",
			parts: [{ type: "text", text: "Olá, tudo bem?" }],
		} as unknown as AjaUIMessage;
		render(<MessageList messages={[user("Oi", "u1"), assistant]} isStreaming />);
		expect(screen.queryByText("Digitando…")).toBeNull();
		expect(screen.queryByText("Montando sua resposta")).toBeNull();
	});
});

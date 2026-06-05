// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock useChat — não queremos chamar /api real em test estrutural.
vi.mock("@ai-sdk/react", () => ({
	useChat: vi.fn(() => ({
		messages: [],
		sendMessage: vi.fn(),
		status: "ready",
	})),
}));

// Mock DefaultChatTransport.
vi.mock("ai", () => ({
	DefaultChatTransport: vi.fn(),
}));

const { AIAssistantSidebar } = await import("./ai-assistant-sidebar");

afterEach(() => cleanup());

// biome-ignore lint/suspicious/noExplicitAny: form mock
function mockForm(): any {
	return {
		setValue: vi.fn(),
		getValues: vi.fn(() => []),
	};
}

describe("AIAssistantSidebar — render baseline", () => {
	it("renderiza header com título 'AI Assistant'", () => {
		render(<AIAssistantSidebar personaId="p1" formMethods={mockForm()} />);
		expect(screen.getByText(/AI Assistant/i)).toBeInTheDocument();
	});

	it("renderiza placeholder de exemplos quando mensagens vazias", () => {
		render(<AIAssistantSidebar personaId="p1" formMethods={mockForm()} />);
		expect(screen.getByText(/menos formal/i)).toBeInTheDocument();
		expect(screen.getByText(/comissão/i)).toBeInTheDocument();
	});

	it("textarea está vazio inicialmente e botão Enviar desabilitado", () => {
		render(<AIAssistantSidebar personaId="p1" formMethods={mockForm()} />);
		const btn = screen.getByRole("button", { name: /enviar/i });
		expect(btn).toBeDisabled();
	});
});

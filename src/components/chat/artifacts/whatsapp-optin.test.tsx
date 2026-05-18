// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsappOptin } from "./whatsapp-optin";

const mockSendAction = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendAction: mockSendAction,
		conversationId: "conv-123",
		status: "ready",
	}),
}));
vi.mock("@/lib/hooks/use-reduced-motion", () => ({
	useReducedMotion: () => true,
}));

describe("WhatsappOptin", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		mockSendAction.mockClear();
	});

	it("renderiza copy + input + 2 botões", () => {
		render(<WhatsappOptin />);
		expect(screen.getByText(/WhatsApp/i)).toBeDefined();
		expect(screen.getByPlaceholderText(/98765-4321/)).toBeDefined();
		expect(screen.getByRole("button", { name: /quero/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /agora não/i })).toBeDefined();
	});

	it("aplica máscara (DD) 9XXXX-XXXX no input", () => {
		render(<WhatsappOptin />);
		const input = screen.getByPlaceholderText(/98765-4321/) as HTMLInputElement;
		fireEvent.change(input, { target: { value: "11987654321" } });
		expect(input.value).toBe("(11) 98765-4321");
	});

	it("aplica máscara progressiva (parcial)", () => {
		render(<WhatsappOptin />);
		const input = screen.getByPlaceholderText(/98765-4321/) as HTMLInputElement;
		fireEvent.change(input, { target: { value: "119" } });
		expect(input.value).toBe("(11) 9");
	});

	it("desabilita 'Quero' se phone inválido", () => {
		render(<WhatsappOptin />);
		const btn = screen.getByRole("button", { name: /quero/i }) as HTMLButtonElement;
		expect(btn.disabled).toBe(true);

		const input = screen.getByPlaceholderText(/98765-4321/) as HTMLInputElement;
		fireEvent.change(input, { target: { value: "11987654321" } });
		expect(btn.disabled).toBe(false);
	});

	it("dispara sendAction whatsapp_optin com phone normalizado ao clicar Quero", () => {
		render(<WhatsappOptin />);
		fireEvent.change(screen.getByPlaceholderText(/98765-4321/), {
			target: { value: "11987654321" },
		});
		fireEvent.click(screen.getByRole("button", { name: /quero/i }));
		expect(mockSendAction).toHaveBeenCalledWith(
			{ kind: "whatsapp_optin", phone: "11987654321" },
			expect.any(String),
		);
	});

	it("dispara sendAction whatsapp_optin_decline ao clicar Agora não", () => {
		render(<WhatsappOptin />);
		fireEvent.click(screen.getByRole("button", { name: /agora não/i }));
		expect(mockSendAction).toHaveBeenCalledWith(
			{ kind: "whatsapp_optin_decline" },
			expect.any(String),
		);
	});

	it("congela controles após aceite", () => {
		render(<WhatsappOptin />);
		fireEvent.change(screen.getByPlaceholderText(/98765-4321/), {
			target: { value: "11987654321" },
		});
		fireEvent.click(screen.getByRole("button", { name: /quero/i }));
		const input = screen.getByPlaceholderText(/98765-4321/) as HTMLInputElement;
		expect(input.disabled).toBe(true);
	});
});

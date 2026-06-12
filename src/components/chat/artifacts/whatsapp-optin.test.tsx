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

// FIX-27 (bloco-n): número já informado → confirmação 1-clique, sem input vazio.
describe("FIX-27 — confirmação 1-clique com knownPhone", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		mockSendAction.mockClear();
	});

	it("com knownPhone: mostra o número mascarado e NÃO mostra input de coleta", () => {
		render(<WhatsappOptin payload={{ knownPhone: "(62) 9...-6793" }} />);
		expect(screen.getByText(/\(62\) 9\.\.\.-6793/)).toBeDefined();
		expect(document.querySelector("input[type='tel']")).toBeNull();
	});

	it("com knownPhone: confirmar dispara whatsapp_optin_confirm (sem re-digitar)", () => {
		render(<WhatsappOptin payload={{ knownPhone: "(62) 9...-6793" }} />);
		fireEvent.click(screen.getByRole("button", { name: /pode|sim|confirmar/i }));
		expect(mockSendAction).toHaveBeenCalledTimes(1);
		expect(mockSendAction.mock.calls[0][0]).toEqual({ kind: "whatsapp_optin_confirm" });
	});

	it("com knownPhone: 'usar outro número' revela o input de coleta", () => {
		render(<WhatsappOptin payload={{ knownPhone: "(62) 9...-6793" }} />);
		fireEvent.click(screen.getByRole("button", { name: /outro n[úu]mero/i }));
		expect(document.querySelector("input[type='tel']")).not.toBeNull();
	});

	it("sem knownPhone (payload vazio): modo legado com input de coleta", () => {
		render(<WhatsappOptin payload={{}} />);
		expect(document.querySelector("input[type='tel']")).not.toBeNull();
	});
});

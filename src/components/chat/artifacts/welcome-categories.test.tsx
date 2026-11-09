// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WelcomeCategories } from "./welcome-categories";

const sendUserMessage = vi.fn(async () => {});
const sendAction = vi.fn(async () => {});
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendUserMessage, sendAction, status: "ready" }),
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("WelcomeCategories", () => {
	it("clique na categoria vira mensagem normal do cliente, sem ação category", () => {
		const payload = {
			options: [{ value: "auto", label: "Automóvel" }],
		} as never;
		const { container } = render(<WelcomeCategories payload={payload} />);
		fireEvent.click(screen.getByText("Automóvel"));
		expect(sendUserMessage).toHaveBeenCalledWith("Automóvel");
		expect(sendAction).not.toHaveBeenCalled();
		expect(container.textContent ?? "").not.toContain("entrou na conversa");
	});
});

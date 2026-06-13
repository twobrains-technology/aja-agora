// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadForm } from "./lead-form";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		conversationId: "conv-123",
		refreshHandoff: vi.fn(),
		status: "ready",
	}),
}));
vi.mock("@/lib/hooks/use-reduced-motion", () => ({
	useReducedMotion: () => true,
}));

describe("LeadForm — pré-preenchimento + email opcional", () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		document.body.innerHTML = "";
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				name: "Kairo",
				phone: "11987654321",
				email: "",
			}),
		}) as typeof global.fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("pré-preenche nome e WhatsApp via GET /api/leads/[id]", async () => {
		render(<LeadForm payload={{ conversationId: "conv-123" }} />);
		await waitFor(() => {
			const nameInput = screen.getByLabelText(/^Nome$/) as HTMLInputElement;
			expect(nameInput.value).toBe("Kairo");
		});
		const phoneInput = screen.getByLabelText(/WhatsApp/) as HTMLInputElement;
		expect(phoneInput.value).toBe("11987654321");
	});

	it("renderiza label com '(opcional)' no email", async () => {
		render(<LeadForm payload={{ conversationId: "conv-123" }} />);
		await waitFor(() => screen.getByLabelText(/Email/));
		expect(screen.getByText(/opcional/i)).toBeDefined();
	});

	it("chama GET /api/leads/[id] no mount", () => {
		render(<LeadForm payload={{ conversationId: "conv-123" }} />);
		expect(global.fetch).toHaveBeenCalledWith("/api/leads/conv-123");
	});
});

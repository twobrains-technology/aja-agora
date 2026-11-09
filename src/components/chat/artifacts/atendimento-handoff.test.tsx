// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AtendimentoHandoff } from "./atendimento-handoff";

const base = {
	numero: "5511955020229",
	numeroFormatado: "+55 11 95502-0229",
	administradora: "CANOPUS",
};

function mockMatchMedia(reduce: boolean) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn().mockImplementation((query: string) => ({
			matches: reduce && query.includes("prefers-reduced-motion"),
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	);
}

beforeEach(() => mockMatchMedia(false));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("AtendimentoHandoff — card único de finalização", () => {
	it("traz parabéns, o aviso do atendente e a proposta como ação secundária no mesmo card", () => {
		render(<AtendimentoHandoff payload={{ ...base, proposalUrl: "https://x/p.pdf" }} />);
		expect(screen.getByText(/Parabéns! Agora você está oficialmente mais perto/)).toBeTruthy();
		expect(screen.getByText(/Um atendente da Aja Agora vai te chamar/)).toBeTruthy();
		expect(screen.getByTestId("atendimento-whatsapp")).toBeTruthy();
		const ver = screen.getByTestId("signature-link");
		expect(ver.textContent).toContain("Ver minha proposta");
		// secundário: ghost/outline, nunca o vermelho principal
		expect(ver.className).not.toContain("bg-primary");
	});

	it("sem URL da proposta não renderiza o botão", () => {
		render(<AtendimentoHandoff payload={base} />);
		expect(screen.queryByTestId("signature-link")).toBeNull();
		expect(screen.queryByText(/Ver minha proposta/)).toBeNull();
	});

	it("sem prazo prometido na copy", () => {
		const { container } = render(<AtendimentoHandoff payload={base} />);
		expect(container.textContent).not.toMatch(/minutos|horas|reservad/i);
	});

	it("com movimento liberado, solta o confete (decorativo, escondido de leitor de tela)", async () => {
		render(<AtendimentoHandoff payload={base} />);
		const confete = await screen.findByTestId("confete");
		expect(confete.getAttribute("aria-hidden")).toBe("true");
	});

	it("com prefers-reduced-motion não há confete e o parabéns segue em texto", async () => {
		mockMatchMedia(true);
		render(<AtendimentoHandoff payload={base} />);
		await Promise.resolve();
		expect(screen.queryByTestId("confete")).toBeNull();
		expect(screen.getByText(/Parabéns!/)).toBeTruthy();
	});
});

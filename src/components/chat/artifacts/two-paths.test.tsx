// @vitest-environment happy-dom
/**
 * FIX-229 (docs/02-cards-novos.md CARD 3 — two_paths). Invariantes duros:
 * NUNCA traz % de chance/probabilidade; NÃO recomenda um dos dois caminhos
 * (mesmo peso visual).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TwoPathsPayload } from "@/lib/chat/types";
import { TwoPaths } from "./two-paths";

const sendUserMessage = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendUserMessage, status: "ready" }),
}));

const payload: TwoPathsPayload = {
	monthlyPayment: 812,
	administradora: "CANOPUS",
	disclaimer: "Nenhuma das opções é garantia de contemplação.",
};

describe("TwoPaths", () => {
	it("apresenta exatamente 2 caminhos", () => {
		render(<TwoPaths payload={payload} />);
		expect(screen.getByText(/esperar o sorteio/i)).toBeTruthy();
		expect(screen.getByText(/lance pequeno/i)).toBeTruthy();
	});

	it("NUNCA mostra nenhuma métrica de chance/probabilidade de contemplação", () => {
		render(<TwoPaths payload={payload} />);
		const text = document.body.textContent ?? "";
		expect(text).not.toMatch(/\d+%\s*(de\s*)?chance/i);
		expect(text).not.toMatch(/probabilidade/i);
	});

	it("não marca nenhuma das opções como recomendada (mesmo peso visual)", () => {
		render(<TwoPaths payload={payload} />);
		const text = document.body.textContent ?? "";
		expect(text).not.toMatch(/recomend/i);
		expect(text).not.toMatch(/melhor op[çc][ãa]o/i);
	});
});

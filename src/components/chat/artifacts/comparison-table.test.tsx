// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const sendAction = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendUserMessage: vi.fn(),
		sendAction,
		status: "ready" as const,
		messages: [],
	}),
}));

import { ComparisonTable } from "./comparison-table";

afterEach(cleanup);

const GROUPS = [1, 2, 3, 4].map((n) => ({
	id: `g${n}`,
	administradora: `ADM ${n}`,
	category: "auto" as const,
	creditValue: 60_000,
	monthlyPayment: 1_200,
	adminFeePercent: 18,
	termMonths: 80,
	availableSlots: 3,
}));

describe("ComparisonTable — carrossel de cartas", () => {
	// jsdom/happy-dom não fazem layout: o que este teste garante é que a receita
	// de CSS que impede o corte do último card continua no container e nos chips
	// (scroll-snap + scroll-padding). O ajuste visual está descrito no relatório.
	it("usa scroll-snap e scroll-padding pra não cortar o último card na borda", () => {
		render(<ComparisonTable payload={{ groups: GROUPS }} />);

		const carrossel = screen.getByTestId("carrossel-cartas");
		expect(carrossel.className).toContain("snap-x");
		expect(carrossel.className).toContain("scroll-px-4");
		expect(carrossel.className).toContain("overflow-x-auto");

		for (const chip of screen.getAllByTestId(/cartao-grupo-/)) {
			expect(chip.className).toContain("snap-start");
		}
	});

	it("o clique vira fala de interesse, sem a palavra simular", () => {
		render(<ComparisonTable payload={{ groups: GROUPS }} />);
		const chip = screen.getByTestId("cartao-grupo-g1");
		expect(chip.getAttribute("aria-label")).not.toMatch(/simul/i);
		fireEvent.click(chip);
		expect(sendAction).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "select-group", groupId: "g1" }),
			"Me interessei na ADM 1 de R$ 60 mil, prazo de 80 meses",
		);
	});
});

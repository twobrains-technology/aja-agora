// @vitest-environment happy-dom
/**
 * FIX-231 (docs/02-cards-novos.md, docs/01-gates-e-ordem.md "recommendation"):
 * a carta em destaque também vale pro recommendation-card — hoje a parcela é
 * o hero; carta precisa virar o hero, com a nota "parcela cheia, que você
 * paga até ser contemplada" (a parcela pós-contemplação só aparece na
 * agulha — ver recommendation-card.fix-221.test.tsx).
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationCardPayload } from "@/lib/chat/types";
import { RecommendationCard } from "./recommendation-card";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

const payload: RecommendationCardPayload = {
	id: "grp-1",
	administradora: "ÂNCORA",
	category: "auto",
	creditValue: 100_000,
	monthlyPayment: 1_500,
	adminFeePercent: 18,
	termMonths: 80,
	contemplationRate: 0,
	score: 0.8,
	scoreBreakdown: { monthlyFit: 0.8, contemplation: 0.5, adminFee: 0.5, termMatch: 0.5 },
};

describe("RecommendationCard — carta em destaque (FIX-231)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("a carta (valor do bem) é o hero — fonte maior que a parcela", () => {
		render(<RecommendationCard payload={payload} />);
		const hero = screen.getByTestId("recommendation-hero-credit");
		const secondary = screen.getByTestId("recommendation-secondary-payment");
		expect(hero.textContent).toMatch(/100\.000/);
		expect(secondary.textContent).toMatch(/1\.500/);
	});

	it("mostra a nota de parcela cheia até a contemplação", () => {
		render(<RecommendationCard payload={payload} />);
		expect(screen.getByText(/parcela cheia.*at[ée] (ser|voc[êe] ser) contempl/i)).toBeTruthy();
	});
});

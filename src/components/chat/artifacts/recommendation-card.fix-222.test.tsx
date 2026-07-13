// @vitest-environment happy-dom
/**
 * FIX-222 (Ata 2026-07-04): logo da administradora no card de recomendação.
 * Assets reais são PENDENTE — o card cai no fallback (iniciais) sem quebrar.
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
	administradora: "BANCO DO BRASIL",
	category: "auto",
	creditValue: 100_000,
	monthlyPayment: 1_500,
	adminFeePercent: 18,
	termMonths: 80,
	contemplationRate: 0,
	score: 0.8,
	scoreBreakdown: { monthlyFit: 0.8, contemplation: 0.5, adminFee: 0.5, termMatch: 0.5 },
};

describe("FIX-222 — logo da administradora no card", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("renderiza o logo quando logoUrl está presente", () => {
		render(<RecommendationCard payload={{ ...payload, logoUrl: "https://cdn/bb.png" }} />);
		const img = screen.getByRole("img", { name: /banco do brasil/i });
		expect(img).toHaveProperty("src", "https://cdn/bb.png");
	});

	it("sem logoUrl: cai no fallback (iniciais) sem quebrar", () => {
		render(<RecommendationCard payload={payload} />);
		expect(screen.queryByRole("img", { name: /banco do brasil/i })).toBeNull();
		expect(screen.getByText("BA")).toBeTruthy();
	});
});

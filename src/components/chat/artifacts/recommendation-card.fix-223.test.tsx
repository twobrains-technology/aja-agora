// @vitest-environment happy-dom
/**
 * FIX-223 (Ata 2026-07-04, item 4.2): "Exibir o lance médio no card (hoje
 * falta — info importante)." Exibe só quando o dado é REAL (nunca fabrica).
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

describe("FIX-223 — lance médio no card de recomendação", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("exibe 'Lance médio' quando avgBidValue está presente", () => {
		render(<RecommendationCard payload={{ ...payload, avgBidValue: 4_200 }} />);
		expect(screen.getByText(/lance m[ée]dio/i)).toBeTruthy();
		expect(document.body.textContent).toMatch(/4\.200/);
	});

	it("omite a linha quando avgBidValue está ausente (nunca fabrica)", () => {
		render(<RecommendationCard payload={payload} />);
		expect(screen.queryByText(/lance m[ée]dio/i)).toBeNull();
	});
});

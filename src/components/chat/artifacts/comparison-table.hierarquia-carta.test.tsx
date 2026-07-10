// @vitest-environment happy-dom
/**
 * FIX-231 (docs/02-cards-novos.md — ajustes nos cards existentes): a carta em
 * destaque também vale pro comparison-table (carrossel legado + QuotaSelector
 * do reveal) — hoje a parcela é o hero dos chips; carta precisa virar o hero,
 * parcela abaixo, lance médio como linha discreta quando presente.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComparisonTablePayload } from "@/lib/chat/types";
import { RevealSelectionProvider } from "../reveal-selection";
import { ComparisonTable } from "./comparison-table";
import { RecommendationCard } from "./recommendation-card";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

const carrosselPayload: ComparisonTablePayload = {
	highlightBestIndex: 0,
	groups: [
		{
			id: "g1",
			administradora: "ITAÚ",
			category: "auto",
			creditValue: 147238,
			monthlyPayment: 5978,
			adminFeePercent: 18,
			termMonths: 29,
			contemplationRate: 2,
			availableSlots: 6,
			avgBidValue: 12_345,
		},
	],
};

describe("ComparisonTable (carrossel legado) — carta em destaque (FIX-231)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("a carta (valor do bem) é o hero do chip — fonte maior que a parcela", () => {
		render(<ComparisonTable payload={carrosselPayload} />);
		const hero = screen.getByTestId("comparison-chip-hero-credit-g1");
		const secondary = screen.getByTestId("comparison-chip-secondary-payment-g1");
		expect(hero.textContent).toMatch(/147\.238/);
		expect(secondary.textContent).toMatch(/5\.978/);
	});

	it("mostra lance médio como linha discreta quando presente", () => {
		render(<ComparisonTable payload={carrosselPayload} />);
		const lance = screen.getByTestId("comparison-chip-lance-medio-g1");
		expect(lance.textContent).toMatch(/lance m[ée]dio/i);
	});

	it("omite a linha de lance médio quando ausente", () => {
		const { groups, ...rest } = carrosselPayload;
		const { avgBidValue: _drop, ...group } = groups[0];
		render(<ComparisonTable payload={{ ...rest, groups: [group] }} />);
		expect(screen.queryByTestId("comparison-chip-lance-medio-g1")).toBeNull();
	});
});

describe("QuotaSelector (reveal) — carta em destaque no chip (FIX-231)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("a carta é o hero do chip de cota no seletor do reveal", () => {
		const recPayload = {
			id: "g1",
			administradora: "ITAÚ",
			category: "auto" as const,
			creditValue: 147238,
			monthlyPayment: 5978,
			adminFeePercent: 18,
			termMonths: 29,
			contemplationRate: 2,
			score: 0.8,
			scoreBreakdown: { monthlyFit: 0.8, contemplation: 0.5, adminFee: 0.5, termMatch: 0.5 },
			avgBidValue: 12_345,
		};
		render(
			<RevealSelectionProvider
				artifacts={[
					{ id: "a1", type: "recommendation_card", payload: recPayload },
					{ id: "a2", type: "comparison_table", payload: carrosselPayload },
				]}
			>
				<RecommendationCard payload={recPayload} />
				<ComparisonTable payload={carrosselPayload} />
			</RevealSelectionProvider>,
		);
		const hero = screen.getByTestId("quota-chip-hero-credit-g1");
		expect(hero.textContent).toMatch(/147\.238/);
	});
});

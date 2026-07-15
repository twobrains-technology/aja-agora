// @vitest-environment happy-dom
/**
 * FIX-358 — nos chips estreitos do carrossel (w-[150px]) do comparison-table, a
 * linha da Parcela usava `flex justify-between` com o label e o valor como filhos
 * flex ADJACENTES (sem nó de texto/espaço entre eles). Com parcela de 4 dígitos
 * ("R$ 3.134,55/mês") o conteúdo estoura os ~124px úteis e os dois encostam —
 * renderizando "ParcelaR$ 3.134,55/mês" (relato real, card ITAÚ), sem espaço.
 *
 * Invariante (não é trava de copy): o label "Parcela" e o valor SEMPRE têm um
 * espaço visível entre eles e o número aparece INTEIRO, mesmo com parcela alta.
 * Vale pros dois chips com a mesma estrutura: o carrossel legado e o QuotaSelector
 * do reveal. O mockup canônico (aja-dois-cenarios.html `.grp .parcela`) usa fluxo
 * inline "Parcela <b>{valor}</b>/mês", justamente pra nunca colar.
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

// Parcela de 4 dígitos com centavos — o caso que colava (card ITAÚ real).
const carrosselPayload: ComparisonTablePayload = {
	highlightBestIndex: 0,
	groups: [
		{
			id: "g1",
			administradora: "ITAÚ",
			category: "auto",
			creditValue: 147_238,
			monthlyPayment: 3_134.55,
			adminFeePercent: 18,
			termMonths: 51,
			contemplationRate: 2,
			availableSlots: 6,
			avgBidValue: 12_345,
		},
	],
};

describe("FIX-358 — carrossel legado: Parcela não cola no valor (4 dígitos)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("tem espaço entre 'Parcela' e o valor, com o número inteiro visível", () => {
		render(<ComparisonTable payload={carrosselPayload} />);
		const value = screen.getByTestId("comparison-chip-secondary-payment-g1");
		const line = value.parentElement;
		expect(line).not.toBeNull();
		// Antes do fix: "ParcelaR$ 3.134,55/mês" (sem espaço). Depois: com espaço.
		expect(line?.textContent).toMatch(/Parcela\s+R\$\s*3\.134,55\/mês/);
	});

	it("o valor da parcela nunca é truncado (número completo no <b>)", () => {
		render(<ComparisonTable payload={carrosselPayload} />);
		const value = screen.getByTestId("comparison-chip-secondary-payment-g1");
		expect(value.textContent).toMatch(/R\$\s*3\.134,55/);
	});
});

describe("FIX-358 — QuotaSelector (reveal): Parcela não cola no valor (4 dígitos)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("chip de cota também mantém o espaço entre 'Parcela' e o valor", () => {
		const recPayload = {
			id: "g1",
			administradora: "ITAÚ",
			category: "auto" as const,
			creditValue: 147_238,
			monthlyPayment: 3_134.55,
			adminFeePercent: 18,
			termMonths: 51,
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
		const value = screen.getByTestId("quota-chip-secondary-payment-g1");
		const line = value.parentElement;
		expect(line?.textContent).toMatch(/Parcela\s+R\$\s*3\.134,55\/mês/);
		expect(value.textContent).toMatch(/R\$\s*3\.134,55/);
	});
});

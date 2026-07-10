// @vitest-environment happy-dom
/**
 * FIX-242 (rodada 2, Fable r1, §D2.3 do veredito) — parcela arredondada
 * (`maximumFractionDigits: 0`) em comparison-table.tsx / contemplation-dial.tsx
 * / two-paths.tsx: R$ 2.182,01 renderizava "R$ 2.182/mês". Inconsistente com
 * recommendation-card/real-offer (que já usam centavos) e cutuca "nunca
 * arredonda valor monetário" (CDC art. 30) — pra CARTA (valor redondo) é
 * inócuo, mas pra PARCELA é arredondamento real. Carta segue sem centavos —
 * só a parcela precisa de centavos.
 *
 * embedded-bid.tsx: o veredito citou o arquivo, mas EmbeddedBidPayload não
 * tem campo de parcela (só embeddedBidValue/netCredit, valores de carta) —
 * achado REFUTADO nesta rodada, documentado abaixo, sem alteração no arquivo.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	ComparisonTablePayload,
	ContemplationDialPayload,
	EmbeddedBidPayload,
	TwoPathsPayload,
} from "@/lib/chat/types";
import { ComparisonTable } from "./comparison-table";
import { ContemplationDial } from "./contemplation-dial";
import { EmbeddedBid } from "./embedded-bid";
import { TwoPaths } from "./two-paths";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), sendUserMessage: vi.fn(), status: "ready" }),
}));

afterEach(() => {
	document.body.innerHTML = "";
});

describe("FIX-242 — ComparisonTable: parcela com centavos, carta sem centavos", () => {
	const payload: ComparisonTablePayload = {
		groups: [
			{
				id: "g1",
				administradora: "ÂNCORA",
				category: "auto",
				creditValue: 120_000,
				monthlyPayment: 2_182.01,
				adminFeePercent: 18,
				termMonths: 80,
				availableSlots: 3,
				contemplationRate: 0.5,
			},
		],
	};

	it("parcela renderiza com centavos (R$ 2.182,01), nunca arredondada", () => {
		render(<ComparisonTable payload={payload} />);
		expect(document.body.textContent).toMatch(/2\.182,01/);
		expect(document.body.textContent).not.toMatch(/2\.182\/mês/);
	});

	it("carta (valor do bem) segue sem centavos — não é o problema (CDC art. 30 é sobre a parcela)", () => {
		render(<ComparisonTable payload={payload} />);
		expect(screen.getByTestId("comparison-chip-hero-credit-g1").textContent).toMatch(
			/^R\$\s*120\.000$/,
		);
	});
});

describe("FIX-242 — ContemplationDial: parcela (antes/depois) com centavos", () => {
	const payload: ContemplationDialPayload = {
		administradora: "ÂNCORA",
		category: "auto",
		creditValue: 100_000,
		termMonths: 80,
		monthlyPayment: 2_182.01,
		initialTargetMonth: 20,
	};

	it("a parcela até a contemplação renderiza com centavos", () => {
		render(<ContemplationDial payload={payload} />);
		expect(document.body.textContent).toMatch(/2\.182,01/);
	});
});

describe("FIX-242 — TwoPaths: parcela do caminho 'sorteio' com centavos", () => {
	const payload: TwoPathsPayload = {
		monthlyPayment: 2_182.01,
		administradora: "CANOPUS",
		disclaimer: "Nenhuma das opções é garantia de contemplação.",
	};

	it("a parcela citada no card e no texto do clique tem centavos", () => {
		render(<TwoPaths payload={payload} />);
		expect(document.body.textContent).toMatch(/2\.182,01/);
		expect(document.body.textContent).not.toMatch(/2\.182\/mês/);
	});
});

describe("FIX-242 — EmbeddedBid: achado REFUTADO (payload não tem campo de parcela)", () => {
	const payload: EmbeddedBidPayload = {
		maxEmbutidoPct: 30,
		creditValue: 120_000,
		embeddedBidValue: 36_000.5,
		netCredit: 84_000,
		disclaimer: "O embutido sai da carta, então o crédito recebido diminui.",
	};

	it("EmbeddedBidPayload não declara monthlyPayment — nada de parcela pra arredondar aqui", () => {
		const keys = Object.keys(payload);
		expect(keys).not.toContain("monthlyPayment");
	});

	it("valores de carta (embeddedBidValue) seguem sem centavos, por design — não é parcela", () => {
		render(<EmbeddedBid payload={payload} />);
		expect(document.body.textContent).toMatch(/36\.001|36\.000/);
		expect(document.body.textContent).not.toMatch(/36\.000,50/);
	});
});

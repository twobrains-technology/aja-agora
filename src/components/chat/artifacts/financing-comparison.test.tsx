// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FinancingComparison } from "./financing-comparison";

describe("FinancingComparison — comparador consórcio × financiamento (bug #17)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	const payload = {
		category: "imovel" as const,
		creditValue: 900_000,
		termMonths: 240,
		consorcio: { monthlyPayment: 5_715, totalCost: 1_371_600 },
		financing: { monthlyPayment: 8_681.75, totalCost: 2_083_620, annualRate: 10 },
		diff: { monthlyDelta: -2_966.75, totalDelta: -712_020 },
		disclaimer:
			"Comparação estimativa baseada em taxa CET de 10% ao ano. Taxa real depende de análise de crédito.",
	};

	it("renderiza 2 cards (consórcio + financiamento)", () => {
		render(<FinancingComparison payload={payload} />);
		expect(screen.getByTestId("comparison-consorcio")).toBeDefined();
		expect(screen.getByTestId("comparison-financing")).toBeDefined();
	});

	it("mostra parcela mensal dos 2", () => {
		render(<FinancingComparison payload={payload} />);
		expect(screen.getByText(/R\$\s?5\.715/)).toBeDefined();
		expect(screen.getByText(/R\$\s?8\.681/)).toBeDefined();
	});

	it("mostra premissa CET anual", () => {
		render(<FinancingComparison payload={payload} />);
		expect(screen.getByText(/10%\/ano/i)).toBeDefined();
	});

	it("comunica qual fica mais barato + diff mensal e total", () => {
		render(<FinancingComparison payload={payload} />);
		expect(screen.getByText(/mais barato/i)).toBeDefined();
		expect(screen.getAllByText(/R\$\s?2\.966/).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/R\$\s?712/).length).toBeGreaterThan(0);
	});

	it("disclaimer obrigatório aparece (#17 regulatório)", () => {
		render(<FinancingComparison payload={payload} />);
		expect(screen.getByText(/estimativa.*taxa real depende/i)).toBeDefined();
	});
});

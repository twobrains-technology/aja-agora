// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Scenarios } from "./scenarios";
import { computeScenarios } from "@/lib/agent/scenarios";

describe("Scenarios — 3 cards lado a lado (bug #16)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	const payload = {
		groupId: "g1",
		administradora: "Rodobens",
		creditValue: 900_000,
		termMonths: 200,
		scenarios: computeScenarios({ creditValue: 900_000, termMonths: 200 }),
	};

	it("renderiza 3 cards distintos", () => {
		render(<Scenarios payload={payload} />);
		expect(screen.getByTestId("scenario-conservador")).toBeDefined();
		expect(screen.getByTestId("scenario-provavel")).toBeDefined();
		expect(screen.getByTestId("scenario-acelerado")).toBeDefined();
	});

	it("labels e prazos esperados aparecem", () => {
		render(<Scenarios payload={payload} />);
		expect(screen.getByText(/Conservador/)).toBeDefined();
		expect(screen.getByText(/Provável/)).toBeDefined();
		expect(screen.getByText(/Acelerado/)).toBeDefined();
		expect(screen.getAllByText(/meses/i).length).toBeGreaterThanOrEqual(3);
	});

	it("acelerado mostra Lance em R$ e Recursos próprios em R$", () => {
		render(<Scenarios payload={payload} />);
		const acelerado = screen.getByTestId("scenario-acelerado");
		expect(acelerado.textContent).toMatch(/lance/i);
		expect(acelerado.textContent).toMatch(/recursos pr[óo]prios/i);
		expect(acelerado.textContent).toMatch(/R\$\s?270/); // R$ 270.000
		expect(acelerado.textContent).toMatch(/R\$\s?90/); // R$ 90.000
	});

	it("disclaimer obrigatório aparece em cada cenário (#16 regulatório)", () => {
		render(<Scenarios payload={payload} />);
		const disclaimers = screen.getAllByText(/estimativa|n[ãa]o h[áa] garantia/i);
		expect(disclaimers.length).toBeGreaterThanOrEqual(3);
	});
});

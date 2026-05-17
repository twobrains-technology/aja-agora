// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SimulationResultPayload } from "@/lib/chat/types";
import { SimulationResult } from "./simulation-result";

// Mock do useChatContext — componente usa sendAction e status
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendAction: vi.fn(),
		status: "ready",
	}),
}));

const basePayload: SimulationResultPayload = {
	groupId: "grp-1",
	administradora: "Rodobens",
	category: "imovel",
	creditValue: 900000,
	monthlyPayment: 5715,
	adminFee: 162000,
	reserveFund: 33750,
	insurance: 45000,
	totalCost: 1140750,
	termMonths: 200,
	effectiveRate: 27,
	lanceScenario: {
		lancePercent: 20,
		expectedTermMonths: 80,
	},
	expectedAdjustment: {
		index: "INCC",
		annualPercent: 6,
	},
};

describe("SimulationResult — 7 campos obrigatórios (bug #10)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("renderiza valor da carta (crédito)", () => {
		render(<SimulationResult payload={basePayload} />);
		expect(screen.getByText(/valor do (cr[ée]dito|carta)/i)).toBeDefined();
	});

	it("renderiza prazo em meses", () => {
		render(<SimulationResult payload={basePayload} />);
		expect(screen.getByText(/200 meses/i)).toBeDefined();
	});

	it("renderiza parcela mensal", () => {
		render(<SimulationResult payload={basePayload} />);
		expect(screen.getByText(/\/mês/i)).toBeDefined();
	});

	it("renderiza taxa de administração", () => {
		render(<SimulationResult payload={basePayload} />);
		expect(screen.getByText(/taxa de administra[çc][ãa]o/i)).toBeDefined();
	});

	it("renderiza fundo de reserva", () => {
		render(<SimulationResult payload={basePayload} />);
		expect(screen.getByText(/fundo de reserva/i)).toBeDefined();
	});

	it("renderiza cenário com lance (#10 novo campo)", () => {
		render(<SimulationResult payload={basePayload} />);
		expect(screen.getByText(/cen[áa]rio com lance/i)).toBeDefined();
		expect(screen.getAllByText(/lance/i).length).toBeGreaterThan(0);
		expect(screen.getByText(/contempla[çc][ãa]o/i)).toBeDefined();
	});

	it("renderiza correção prevista com índice INCC para imóvel (#10 novo campo)", () => {
		render(<SimulationResult payload={basePayload} />);
		expect(screen.getByText(/INCC/i)).toBeDefined();
		expect(screen.queryByText(/IPCA/i)).toBeNull();
	});

	it("auto/moto usa IPCA", () => {
		const autoPayload: SimulationResultPayload = {
			...basePayload,
			category: "auto",
			expectedAdjustment: { index: "IPCA", annualPercent: 4.5 },
		};
		render(<SimulationResult payload={autoPayload} />);
		expect(screen.getByText(/IPCA/i)).toBeDefined();
		expect(screen.queryByText(/INCC/i)).toBeNull();
	});
});

describe("SimulationResult — CTAs explícitos no fechamento (bug #12)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("renderiza botão 'Tenho interesse' (sempre presente)", () => {
		render(<SimulationResult payload={basePayload} />);
		expect(screen.getByRole("button", { name: /tenho interesse/i })).toBeDefined();
	});

	it("renderiza CTAs secundárias quando payload.actions é populado", () => {
		const payloadWithActions: SimulationResultPayload = {
			...basePayload,
			actions: [
				{ label: "Ajustar valor", intent: "adjust_value" },
				{ label: "Nova simulação", intent: "new_simulation" },
				{ label: "Comparar outra adm", intent: "compare_other" },
			],
		};
		render(<SimulationResult payload={payloadWithActions} />);
		expect(screen.getByRole("button", { name: /ajustar valor/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /nova simula[çc][ãa]o/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /comparar outra/i })).toBeDefined();
	});

	it("não quebra quando payload.actions é ausente (retrocompat)", () => {
		const { actions, ...payloadWithoutActions } = {
			...basePayload,
			actions: undefined,
		};
		expect(() => render(<SimulationResult payload={payloadWithoutActions} />)).not.toThrow();
	});
});

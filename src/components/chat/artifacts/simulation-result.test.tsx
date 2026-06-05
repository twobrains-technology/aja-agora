// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

	it("renderiza o valor do bem (FIX-2: linguagem leiga, sem 'crédito' seco)", () => {
		render(<SimulationResult payload={basePayload} />);
		expect(screen.getAllByText(/valor do bem/i).length).toBeGreaterThan(0);
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

	it("botão 'Tenho interesse' tem afordância elevada — shadow + ring (#13)", () => {
		render(<SimulationResult payload={basePayload} />);
		const cta = screen.getByTestId("tenho-interesse-cta");
		const cls = cta.className;
		expect(cls).toMatch(/shadow-lg/);
		expect(cls).toMatch(/ring-1|ring-2|ring-primary/);
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

// FIX-8 (teste manual Kairo 2026-06-05): nunca exibir "Lance estimado p/
// contemplar R$ 0,00" — sem dado confiável a linha é OMITIDA.
describe("FIX-8 — lance estimado p/ contemplar nunca rende R$ 0,00", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("com dado real (> 0): linha aparece com o valor literal", () => {
		render(
			<SimulationResult
				payload={{
					...basePayload,
					embeddedBid: {
						percent: 30,
						embeddedBidValue: 24_000,
						receivedCredit: 56_000,
						necessaryBidToContemplate: 34_520,
					},
				}}
			/>,
		);
		expect(document.body.textContent).toContain("Lance estimado p/ contemplar");
		expect(document.body.textContent).toMatch(/34\.520/);
	});

	it("com null (Bevi sem dado): linha OMITIDA, sem R$ 0,00 em lugar nenhum", () => {
		render(
			<SimulationResult
				payload={{
					...basePayload,
					embeddedBid: {
						percent: 30,
						embeddedBidValue: 24_000,
						receivedCredit: 56_000,
						necessaryBidToContemplate: null,
					},
				}}
			/>,
		);
		expect(document.body.textContent).not.toContain("Lance estimado p/ contemplar");
		expect(document.body.textContent).not.toMatch(/R\$\s*0,00/);
		// O bloco do lance embutido continua (crédito líquido é dado real).
		expect(document.body.textContent).toContain("Valor que você recebe");
	});

	it("com 0 (payload legado): trata como sem dado — linha omitida", () => {
		render(
			<SimulationResult
				payload={{
					...basePayload,
					embeddedBid: {
						percent: 30,
						embeddedBidValue: 24_000,
						receivedCredit: 56_000,
						necessaryBidToContemplate: 0,
					},
				}}
			/>,
		);
		expect(document.body.textContent).not.toMatch(/R\$\s*0,00/);
	});
});

// FIX-7 (teste manual Kairo 2026-06-05): CTA "Tenho interesse" duplicado —
// botão interno do card + action igual vinda do payload (modelo).
describe("FIX-7 — CTA duplicado filtrado", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("action do payload que repete 'Tenho interesse' não renderiza 2º botão", () => {
		render(
			<SimulationResult
				payload={{
					...basePayload,
					actions: [
						{ intent: "interest", label: "Tenho interesse!" },
						{ intent: "adjust", label: "Ajustar valor" },
					],
				}}
			/>,
		);
		const buttons = Array.from(document.querySelectorAll("button"));
		const interesse = buttons.filter((b) => /tenho interesse/i.test(b.textContent ?? ""));
		expect(interesse).toHaveLength(1);
		// as demais actions continuam
		expect(buttons.some((b) => /ajustar valor/i.test(b.textContent ?? ""))).toBe(true);
	});
});

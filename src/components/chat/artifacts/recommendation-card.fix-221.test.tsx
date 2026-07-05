// @vitest-environment happy-dom
/**
 * FIX-221 (Ata 2026-07-04, item 4.2, P0): "mostrar parcela antes e depois da
 * contemplação (indispensável)" — consolidada DENTRO do card de recomendação
 * (portado do bloco antes/depois do contemplation-dial.tsx). Usa o MESMO motor
 * puro (computeContemplationDial) com os dados que o card já tem — sem inventar
 * lance declarado pelo usuário, é a mesma estimativa heurística já usada em
 * outros pontos do produto (rotulada como estimativa).
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

describe("FIX-221 — card mostra parcela ATÉ e DEPOIS da contemplação", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("mostra as duas parcelas — até contemplar (real) e após (estimativa, menor)", () => {
		render(<RecommendationCard payload={payload} />);
		expect(screen.getByText(/at[ée] contemplar/i)).toBeTruthy();
		expect(screen.getByText(/ap[óo]s receber/i)).toBeTruthy();
		// "até" é a parcela real (hero, R$ 1.500). "depois" cai pra ~R$ 833 (mesmo
		// motor heurístico do dial, mês-âncora 20/80 — ver contemplation-dial.ts).
		const text = document.body.textContent ?? "";
		expect(text).toMatch(/1\.500/);
		expect(text).toMatch(/833/);
	});

	it("o rótulo do 'depois' nunca mente — só diz 'menor' quando de fato caiu", () => {
		render(<RecommendationCard payload={payload} />);
		// termMonths=80, sem lance declarado → heurística no mês âncora produz
		// lance>0 → a parcela depois CAI → rótulo "menor, depois do lance".
		expect(screen.getByText(/menor, depois do lance/i)).toBeTruthy();
	});

	it("enuncia que o lance embutido reduz o crédito recebido (educação, sempre presente)", () => {
		render(<RecommendationCard payload={payload} />);
		expect(screen.getByText(/recebe menos/i)).toBeTruthy();
	});

	it("sem dados suficientes (termMonths/creditValue ausentes) não quebra nem mostra o bloco", () => {
		const { termMonths: _t, creditValue: _c, ...rest } = payload;
		render(
			<RecommendationCard
				payload={{ ...rest, termMonths: 0, creditValue: 0 } as RecommendationCardPayload}
			/>,
		);
		expect(screen.queryByText(/at[ée] contemplar/i)).toBeNull();
	});
});

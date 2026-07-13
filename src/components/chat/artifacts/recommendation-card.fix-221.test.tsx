// @vitest-environment happy-dom
/**
 * FIX-221 (Ata 2026-07-04, item 4.2, P0) pediu "mostrar parcela antes e
 * depois da contemplação" DENTRO do recommendation-card.
 *
 * FIX-231 (handoff 2026-07-09, docs/02-cards-novos.md e docs/01-gates-e-ordem.md,
 * seção "recommendation") SUPERSEDE essa decisão especificamente neste ponto:
 * "Não mostrar parcela pós-contemplação aqui — só a agulha (contemplation_dial)
 * mostra isso." Instrução mais nova, documentada no handoff, vence a Ata
 * anterior. O bloco "Até contemplar / Após receber" sai do card; entra a nota
 * fixa "parcela cheia, que você paga até ser contemplada".
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

describe("FIX-231 supersede FIX-221 — recommendation-card NÃO mostra parcela pós-contemplação", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("não mostra mais o bloco 'até contemplar / após receber'", () => {
		render(<RecommendationCard payload={payload} />);
		expect(screen.queryByText(/at[ée] contemplar/i)).toBeNull();
		expect(screen.queryByText(/ap[óo]s receber/i)).toBeNull();
	});

	it("mostra a nota fixa: parcela cheia, paga até ser contemplada", () => {
		render(<RecommendationCard payload={payload} />);
		expect(screen.getByText(/parcela cheia.*at[ée] (ser|voc[êe] ser) contempl/i)).toBeTruthy();
	});

	it("continua mostrando a parcela hero real (R$ 1.500)", () => {
		render(<RecommendationCard payload={payload} />);
		expect(document.body.textContent).toMatch(/1\.500/);
	});
});

// @vitest-environment happy-dom
/**
 * Camada 1 — FIX-18: rótulo honesto do card quando o orçamento declarado não
 * fecha. Jornada real do Kairo (2026-06-11): perfil 250k de carro · R$ 1.000/mês;
 * a melhor oferta real tinha parcela de R$ 9.828,92 (9,8× o orçamento) e o card
 * rotulava "Compatível com seu perfil" com o breakdown confessando "Orçamento 0%".
 * Agora: monthlyFit≈0 → "Melhor opção na faixa de crédito" (honesto), nunca a
 * promessa de compatibilidade. Tom guia-não-empurra (jornada: "Seu objetivo primeiro").
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationCardPayload } from "@/lib/chat/types";
import { RecommendationCard } from "./recommendation-card";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

const base: RecommendationCardPayload = {
	id: "grp-1",
	administradora: "ÂNCORA",
	category: "auto",
	creditValue: 250_000,
	monthlyPayment: 9_828.92,
	adminFeePercent: 18,
	termMonths: 80,
	contemplationRate: 2,
	contempladosMes: 2,
	score: 0.68,
	scoreBreakdown: { monthlyFit: 0, contemplation: 0.8, adminFee: 0.9, termMatch: 1 },
};

describe("FIX-18 — RecommendationCard rótulo honesto", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("monthlyFit≈0 → rótulo honesto, NUNCA 'Compatível com seu perfil'", () => {
		render(<RecommendationCard payload={base} />);
		const text = document.body.textContent ?? "";
		expect(text).toContain("Melhor opção na faixa de crédito");
		expect(text).not.toContain("Compatível com seu perfil");
	});

	it("orçamento razoável → mantém o rótulo qualitativo do score", () => {
		render(
			<RecommendationCard
				payload={{
					...base,
					score: 0.91,
					monthlyPayment: 980,
					scoreBreakdown: { ...base.scoreBreakdown, monthlyFit: 0.9 },
				}}
			/>,
		);
		const text = document.body.textContent ?? "";
		expect(text).toContain("Ótima compatibilidade");
		expect(text).not.toContain("Melhor opção na faixa de crédito");
	});
});

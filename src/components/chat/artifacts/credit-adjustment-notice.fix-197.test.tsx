// @vitest-environment happy-dom
/**
 * Camada 1 — FIX-197 (§3.6 do refino): aviso discreto de ajuste de faixa. A Bevi
 * devolve cartas na denominação do grupo (ex. R$ 300k); a tela mostra a faixa
 * re-simulada (ex. ~R$ 131k). O aviso aparece SÓ quando o valorCarta bruto
 * (rawCreditValue) difere da faixa exibida — ancorado nos dois números reais.
 * Cenário de aceite §7.7: difere → exibe; iguais/ausente → não exibe.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RealOfferPayload, RecommendationCardPayload } from "@/lib/chat/types";
import { RealOffer } from "./real-offer";
import { RecommendationCard } from "./recommendation-card";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), sendUserMessage: vi.fn(), status: "ready" }),
}));

const rec = (rawCreditValue?: number): RecommendationCardPayload => ({
	id: "bb",
	administradora: "BANCO DO BRASIL",
	category: "auto",
	creditValue: 131_042,
	monthlyPayment: 2_365.57,
	adminFeePercent: 18,
	termMonths: 72,
	contemplationRate: 0,
	score: 0.9,
	scoreBreakdown: { monthlyFit: 0.9, contemplation: 0.8, adminFee: 0.9, termMatch: 1 },
	rawCreditValue,
});

const offer = (rawCreditValue?: number): RealOfferPayload => ({
	proposalId: "p1",
	administradora: "BANCO DO BRASIL",
	grupo: "1797",
	category: "auto",
	creditValue: 131_042,
	monthlyPayment: 2_365.57,
	rawCreditValue,
});

describe("FIX-197 — aviso de ajuste de faixa (recommendation_card)", () => {
	afterEach(cleanup);

	it("valorCarta bruto ≠ faixa → exibe o aviso com os dois números reais", () => {
		render(<RecommendationCard payload={rec(300_000)} />);
		const notice = screen.getByTestId("credit-adjustment-notice");
		expect(notice).toBeTruthy();
		expect(notice.textContent ?? "").toMatch(/300\.000/);
		expect(notice.textContent ?? "").toMatch(/131\.042/);
	});

	// FIX-277 (veredito r9, G1): a copy do hero estava com a direção INVERTIDA —
	// chamava o valor PEDIDO (rawCreditValue) de "essa carta" e a carta REAL
	// (creditValue) de "sua faixa ajustada", quando na verdade a carta sempre foi
	// creditValue. Paridade com o padrão já correto de real-offer.tsx: "Você
	// pediu ~X — a carta real ficou em Y". Falha com "ajustamos essa carta".
	it("FIX-277: direção do aviso — 'você pediu ~X — a carta real ficou em Y' (paridade com real_offer)", () => {
		render(<RecommendationCard payload={rec(300_000)} />);
		const notice = screen.getByTestId("credit-adjustment-notice");
		const text = notice.textContent ?? "";
		expect(text).toMatch(/pediu/i);
		expect(text).not.toMatch(/ajustamos essa carta/i);
		expect(text).not.toMatch(/sua faixa/i);
	});

	it("sem rawCreditValue → NÃO exibe o aviso", () => {
		render(<RecommendationCard payload={rec(undefined)} />);
		expect(screen.queryByTestId("credit-adjustment-notice")).toBeNull();
	});

	it("valorCarta bruto == faixa → NÃO exibe o aviso", () => {
		render(<RecommendationCard payload={rec(131_042)} />);
		expect(screen.queryByTestId("credit-adjustment-notice")).toBeNull();
	});
});

describe("FIX-197 — aviso de ajuste de faixa (real_offer)", () => {
	afterEach(cleanup);

	it("valorCarta bruto ≠ faixa → exibe o aviso", () => {
		render(<RealOffer payload={offer(300_000)} />);
		const notice = screen.getByTestId("credit-adjustment-notice");
		expect(notice.textContent ?? "").toMatch(/300\.000/);
		expect(notice.textContent ?? "").toMatch(/131\.042/);
	});

	it("sem rawCreditValue → NÃO exibe o aviso (não regride o card legado)", () => {
		render(<RealOffer payload={offer(undefined)} />);
		expect(screen.queryByTestId("credit-adjustment-notice")).toBeNull();
	});
});

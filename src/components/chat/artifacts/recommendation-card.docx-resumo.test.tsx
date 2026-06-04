// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationCardPayload } from "@/lib/chat/types";
import { RecommendationCard } from "./recommendation-card";

// docx passo 4 (linha 38): resumo por opção = valor da carta · parcela · prazo ·
// TIPO DE GRUPO · lance/embutido · qtde de CONTEMPLADOS/MÊS. Os dois últimos
// faltavam no card (e contemplationRate da Bevi é CONTAGEM, não percentual).

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendAction: vi.fn(),
		status: "ready",
	}),
}));

const payload: RecommendationCardPayload = {
	id: "grp-1",
	administradora: "ÂNCORA",
	category: "auto",
	creditValue: 60_000,
	monthlyPayment: 980,
	adminFeePercent: 18,
	termMonths: 80,
	contemplationRate: 2,
	contempladosMes: 2,
	score: 0.91,
	scoreBreakdown: { monthlyFit: 0.9, contemplation: 0.8, adminFee: 0.9, termMatch: 1 },
};

describe("RecommendationCard — resumo por opção do docx (passo 4)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("exibe a quantidade de contemplados por mês (dado real da oferta)", () => {
		render(<RecommendationCard payload={payload} />);
		expect(screen.getByText(/contemplados\/m[êe]s/i)).toBeTruthy();
		expect(screen.getByText(/2 por m[êe]s|^2$/)).toBeTruthy();
	});

	it("exibe o tipo de grupo (categoria)", () => {
		render(<RecommendationCard payload={payload} />);
		expect(screen.getByText(/autom[óo]vel|^auto$/i)).toBeTruthy();
	});

	it("sem contempladosMes não inventa número — cai no rótulo de contemplação", () => {
		const { contempladosMes: _omit, ...rest } = payload;
		render(<RecommendationCard payload={rest as RecommendationCardPayload} />);
		expect(screen.queryByText(/contemplados\/m[êe]s/i)).toBeNull();
	});
});

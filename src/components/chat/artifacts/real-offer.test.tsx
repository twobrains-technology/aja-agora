// @vitest-environment happy-dom
// ============================================================================
// Camada 1 — FIX-13: card "Confirmado com a {administradora}" sem prazo.
// A oferta da API de Parceiro tem EXATAMENTE 8 campos e `term` NÃO é um deles
// (bevi-api-parceiro-spec.md §7). Regra de produto D11: nenhum número sem
// fonte real — o card NUNCA renderiza prazo (nem derivado de valorCarta ÷
// parcela) e SE EXPLICA: copy honesta aponta pro PDF da proposta.
// ============================================================================
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RealOffer } from "./real-offer";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendAction: vi.fn(),
		sendUserMessage: vi.fn(),
		status: "ready",
	}),
}));

// Números REAIS do bug (rodada 2026-06-05): CANOPUS grupo 4400, carta R$ 46.000,
// parcela R$ 469,95 — parecia "errada" perto do BB (R$ 2.872,71 em 17 meses);
// a diferença era 100% prazo, que a API de Parceiro não devolve.
const PAYLOAD = {
	proposalId: "prop-1",
	administradora: "CANOPUS",
	grupo: "4400",
	category: "auto" as const,
	creditValue: 46_000,
	monthlyPayment: 469.95,
};

describe("RealOffer — FIX-13: prazo ausente explicado, nunca inventado", () => {
	afterEach(cleanup);

	it("copy honesta presente: prazo e demais condições na proposta (PDF)", () => {
		render(<RealOffer payload={PAYLOAD} />);
		expect(screen.getByText(/prazo e demais condições/i)).toBeDefined();
		expect(screen.getByText(/proposta \(PDF\)/i)).toBeDefined();
	});

	it("NUNCA renderiza prazo sem fonte (nem derivado): nada de 'N meses' ou 'Nx'", () => {
		const { container } = render(<RealOffer payload={PAYLOAD} />);
		const text = container.textContent ?? "";
		// 46000 ÷ 469,95 ≈ 98 — se alguém derivar e renderizar, isso pega.
		expect(text).not.toMatch(/\d+\s*(meses|mês)\b/i);
		expect(text).not.toMatch(/\b\d+\s*x\b/i);
		expect(text).not.toMatch(/prazo:\s*\d/i);
	});

	it("sanity: os 4 campos COM fonte renderizados (valor, parcela, grupo, administradora)", () => {
		render(<RealOffer payload={PAYLOAD} />);
		expect(screen.getByText("Valor do bem")).toBeDefined();
		expect(screen.getByText(/46\.000/)).toBeDefined();
		expect(screen.getByText("Parcela")).toBeDefined();
		expect(screen.getByText(/469,95/)).toBeDefined();
		expect(screen.getByText("Grupo")).toBeDefined();
		expect(screen.getByText("4400")).toBeDefined();
		expect(screen.getByText(/Confirmado com a CANOPUS/)).toBeDefined();
	});
});

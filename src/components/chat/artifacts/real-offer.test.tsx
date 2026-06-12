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

// BUG-PARCELA-STRING (dev real 2026-06-12): payload com monthlyPayment null
// (round2(undefined)=NaN → JSON null) fazia brl2(null) lançar TypeError e
// derrubar a árvore React inteira — "This page couldn't load" pós-submit.
// CONTRATO: o card NUNCA morre por campo ausente — omite a linha (D11) e
// segue renderizável com os CTAs vivos.
describe("RealOffer — BUG-PARCELA-STRING: payload com monthlyPayment null não derruba o front", () => {
	afterEach(cleanup);

	it("monthlyPayment null → renderiza sem lançar, sem linha de Parcela, CTAs presentes", () => {
		const payload = {
			...PAYLOAD,
			monthlyPayment: null as unknown as number,
		};
		expect(() => render(<RealOffer payload={payload} />)).not.toThrow();
		expect(screen.queryByText(/^Parcela$/)).toBeNull();
		expect(screen.getByTestId("offer-confirm")).toBeDefined();
	});

	it("creditValue null também não derruba — card degrada com honestidade", () => {
		const payload = {
			...PAYLOAD,
			creditValue: null as unknown as number,
			monthlyPayment: null as unknown as number,
		};
		expect(() => render(<RealOffer payload={payload} />)).not.toThrow();
		expect(screen.getByTestId("offer-confirm")).toBeDefined();
	});
});

// FIX-39 (API nova Bevi 2026-06-12): a oferta de parceiro passou a trazer `prazo`
// (meses) — o gap que originou o FIX-13 acabou. Quando termMonths chega (fonte
// REAL, não derivado), o card mostra "Prazo: NN meses" e troca a copy de desculpa
// por "Demais condições no PDF". Ausente (shape antigo / API volta atrás) → a copy
// do FIX-13 PERMANECE como fallback. Defensivo (Number.isFinite) — nunca renderiza
// NaN nem morre (lição BUG-PARCELA-STRING).
describe("RealOffer — FIX-39: prazo real (campo da API) renderiza; ausente mantém fallback", () => {
	afterEach(cleanup);

	it("com termMonths: mostra 'Prazo' e 'NN meses' (fonte real, não derivado)", () => {
		render(<RealOffer payload={{ ...PAYLOAD, termMonths: 72 }} />);
		expect(screen.getByText("Prazo")).toBeDefined();
		expect(screen.getByText(/72\s*meses/i)).toBeDefined();
	});

	it("com termMonths: aposenta a copy de desculpa 'Prazo e demais condições', mantém o PDF pras DEMAIS", () => {
		const { container } = render(<RealOffer payload={{ ...PAYLOAD, termMonths: 72 }} />);
		expect(container.textContent ?? "").not.toMatch(/prazo e demais condições/i);
		expect(screen.getByText(/demais condições.*proposta \(PDF\)/i)).toBeDefined();
	});

	it("sem termMonths (shape antigo / API volta atrás): mantém copy FIX-13 e não morre", () => {
		expect(() => render(<RealOffer payload={PAYLOAD} />)).not.toThrow();
		expect(screen.getByText(/prazo e demais condições/i)).toBeDefined();
	});

	it("termMonths null/não-finito: não renderiza linha de prazo nem morre (defensivo)", () => {
		const payload = { ...PAYLOAD, termMonths: null as unknown as number };
		expect(() => render(<RealOffer payload={payload} />)).not.toThrow();
		expect(screen.queryByText("Prazo")).toBeNull();
		expect(screen.getByText(/prazo e demais condições/i)).toBeDefined();
	});
});

// FIX-40 (API nova Bevi 2026-06-12): a oferta de parceiro ganhou `lanceMedio` (R$
// do grupo). Quando presente, o card mostra "Lance médio do grupo: R$ X" (rótulo
// LITERAL do campo — sem prometer contemplação, regra D11). Ausente → omite a linha
// e não morre (lição BUG-PARCELA-STRING).
describe("RealOffer — FIX-40: lance médio do grupo (campo da API) renderiza; ausente omite", () => {
	afterEach(cleanup);

	it("com avgBidValue: mostra 'Lance médio do grupo' e o valor em R$ (rótulo literal)", () => {
		render(<RealOffer payload={{ ...PAYLOAD, avgBidValue: 69_361.27 }} />);
		expect(screen.getByText(/lance médio do grupo/i)).toBeDefined();
		expect(screen.getByText(/69\.361/)).toBeDefined();
	});

	it("rótulo NÃO promete contemplação (sem 'contemplação'/'garante'/'chance')", () => {
		const { container } = render(<RealOffer payload={{ ...PAYLOAD, avgBidValue: 69_361.27 }} />);
		const text = container.textContent ?? "";
		expect(text).not.toMatch(/contempl|garant|chance/i);
	});

	it("sem avgBidValue: NÃO renderiza a linha de lance médio", () => {
		render(<RealOffer payload={PAYLOAD} />);
		expect(screen.queryByText(/lance médio do grupo/i)).toBeNull();
	});

	it("avgBidValue null/não-finito: omite a linha e não morre (defensivo)", () => {
		const payload = { ...PAYLOAD, avgBidValue: null as unknown as number };
		expect(() => render(<RealOffer payload={payload} />)).not.toThrow();
		expect(screen.queryByText(/lance médio do grupo/i)).toBeNull();
		expect(screen.getByTestId("offer-confirm")).toBeDefined();
	});
});

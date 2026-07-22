// @vitest-environment happy-dom
/**
 * Camada 1 — FIX-196: reveal hero fixo + seletor de cotas (Opção 1, decisão
 * Kairo 2026-07-01). Spec: docs/design/specs/2026-07-01-reveal-hero-seletor-cotas-design.md
 * + adendo B8 (CONTRATO com bloco-a).
 *
 * Prova estrutural do comportamento de UI do reveal:
 *  - tocar um chip do seletor troca a cota do hero CLIENT-SIDE (sem sendAction);
 *  - "Seguir com <cota>" emite `choose_offer` com o `groupId` REAL da selecionada
 *    (o cassette que trava o retorno do P0 — agente re-resolvendo grupo — é do
 *    bloco-a em tests/regression/agent-trajectory.test.ts; aqui garantimos que a
 *    UI NÃO manda texto livre, e sim a ação estruturada);
 *  - contemplação oculta quando availableSlots ausente/0 (§3.1), nunca % de taxa;
 *  - cota alternativa selecionada não afirma "Recomendação" nem exibe score
 *    (Lei 3 — não fabricar score não-ancorado).
 *
 * FIX-220 (Ata 2026-07-04, superSEDE parte do comportamento acima): com 2+
 * cotas na "1ª lista" (ainda sem dado de lance), NENHUMA é branded como
 * "Recomendação"/"Top" por padrão — mesmo peso (ver correção abaixo). O selo +
 * score breakdown só voltam quando `recommendationStage: "personalized"`
 * (gancho pro estágio 2, ONDA 2 — ver jornada-canonica.md item 6).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Artifact, ComparisonTablePayload, RecommendationCardPayload } from "@/lib/chat/types";
import { RevealSelectionProvider } from "../reveal-selection";
import { ComparisonTable } from "./comparison-table";
import { RecommendationCard } from "./recommendation-card";

const sendAction = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction, status: "ready" }),
}));

const rec: RecommendationCardPayload = {
	id: "bb",
	groupId: "bb",
	ofertaId: "of-bb",
	administradora: "BANCO DO BRASIL",
	category: "auto",
	creditValue: 131_042,
	monthlyPayment: 2_365.57,
	adminFeePercent: 18,
	termMonths: 72,
	contemplationRate: 0,
	availableSlots: 0,
	score: 0.91,
	scoreBreakdown: { monthlyFit: 0.9, contemplation: 0.8, adminFee: 0.9, termMatch: 1 },
};

const cmp: ComparisonTablePayload = {
	highlightBestIndex: 0,
	groups: [
		{
			id: "bb",
			groupId: "bb",
			administradora: "BANCO DO BRASIL",
			category: "auto",
			creditValue: 131_042,
			monthlyPayment: 2_365.57,
			adminFeePercent: 18,
			termMonths: 72,
			availableSlots: 0,
			contemplationRate: 0,
		},
		{
			id: "itau",
			groupId: "itau",
			ofertaId: "of-itau",
			administradora: "ITAÚ",
			category: "auto",
			creditValue: 120_000,
			monthlyPayment: 3_200,
			adminFeePercent: 16,
			termMonths: 60,
			availableSlots: 2,
			contemplationRate: 2,
		},
	],
};

function renderReveal(recPayload = rec, cmpPayload = cmp) {
	const artifacts: Artifact[] = [
		{ id: "a1", type: "recommendation_card", payload: recPayload },
		{ id: "a2", type: "comparison_table", payload: cmpPayload },
	];
	return render(
		<RevealSelectionProvider artifacts={artifacts}>
			<RecommendationCard payload={recPayload} />
			<ComparisonTable payload={cmpPayload} />
		</RevealSelectionProvider>,
	);
}

describe("FIX-196 — hero + seletor de cotas", () => {
	afterEach(() => {
		cleanup();
		sendAction.mockClear();
	});

	it("FIX-220: hero inicia na cota SEM selo Recomendação (1ª lista neutra, mesmo peso)", () => {
		renderReveal();
		// CTA continua funcional (mecanismo de hero/seleção não muda)
		expect(screen.getByRole("button", { name: /seguir com banco do brasil/i })).toBeTruthy();
		// mas SEM branding de preferência — ainda não há dado de lance (Ata 2026-07-04)
		expect(screen.queryByText("Recomendação")).toBeNull();
		expect(screen.getByText("Cota selecionada")).toBeTruthy();
		expect(screen.queryByText(/por que esta recomenda/i)).toBeNull();
		// troca a seleção — a cota recomendada (BB) deixa de estar selecionada no
		// chip e AINDA ASSIM não ganha o crown "Top" (mesmo peso, sem preferencial)
		fireEvent.click(screen.getByRole("option", { name: /ITAÚ/i }));
		expect(screen.queryByText("Top")).toBeNull();
	});

	it("tocar um chip troca a cota do hero CLIENT-SIDE (sem sendAction)", () => {
		renderReveal();
		fireEvent.click(screen.getByRole("option", { name: /ITAÚ/i }));
		// hero rebindou pra ITAÚ (CTA reflete a cota selecionada)
		expect(screen.getByRole("button", { name: /seguir com ITAÚ/i })).toBeTruthy();
		// parcela do ITAÚ no HERO — com centavos (FIX-242: o chip do seletor
		// TAMBÉM passou a mostrar centavos, então os dois batem — escopa no
		// testid do hero pra não ambiguar a query).
		expect(screen.getByTestId("recommendation-secondary-payment").textContent).toMatch(
			/R\$\s*3\.200,00/,
		);
		// seleção é client-side: NENHUMA chamada ao agente
		expect(sendAction).not.toHaveBeenCalled();
	});

	it("cota alternativa selecionada não afirma Recomendação nem exibe score", () => {
		renderReveal();
		fireEvent.click(screen.getByRole("option", { name: /ITAÚ/i }));
		expect(screen.getByText("Cota selecionada")).toBeTruthy();
		expect(screen.queryByText(/por que esta recomenda/i)).toBeNull();
	});

	it("'Seguir com <cota>' emite choose_offer com o groupId REAL da selecionada", () => {
		renderReveal();
		fireEvent.click(screen.getByRole("option", { name: /ITAÚ/i }));
		fireEvent.click(screen.getByRole("button", { name: /seguir com ITAÚ/i }));
		expect(sendAction).toHaveBeenCalledTimes(1);
		expect(sendAction).toHaveBeenCalledWith(
			{ kind: "choose_offer", groupId: "itau", ofertaId: "of-itau", label: "Seguir com ITAÚ" },
			"Seguir com ITAÚ",
		);
	});

	it("segue com a recomendada por default (sem tocar chip) → choose_offer da recomendada", () => {
		renderReveal();
		fireEvent.click(screen.getByRole("button", { name: /seguir com banco do brasil/i }));
		expect(sendAction).toHaveBeenCalledWith(
			{
				kind: "choose_offer",
				groupId: "bb",
				ofertaId: "of-bb",
				label: "Seguir com BANCO DO BRASIL",
			},
			"Seguir com BANCO DO BRASIL",
		);
	});

	it("contemplação OCULTA quando availableSlots=0 (§3.1 — nunca % de taxa)", () => {
		renderReveal();
		// BB (recomendada, availableSlots 0) → sem linha de contemplação
		expect(screen.queryByText(/contemplados\/m[êe]s/i)).toBeNull();
		// e jamais a taxa como % (contemplationRate)
		expect(document.body.textContent ?? "").not.toMatch(/0[,.]0?%/);
	});

	it("contemplação VISÍVEL (coagida) quando availableSlots>0", () => {
		const recWithSlots: RecommendationCardPayload = { ...rec, availableSlots: 3 };
		const cmpWithSlots: ComparisonTablePayload = {
			...cmp,
			groups: [{ ...cmp.groups[0], availableSlots: 3 }, cmp.groups[1]],
		};
		renderReveal(recWithSlots, cmpWithSlots);
		expect(screen.getByText(/contemplados\/m[êe]s/i)).toBeTruthy();
		expect(screen.getByText(/3 por m[êe]s/i)).toBeTruthy();
	});
});

// FIX-220 — gancho pro estágio 2 (ONDA 2, jornada-canonica.md item 6): quando o
// payload sinalizar `recommendationStage: "personalized"` (dado de lance já
// coletado), o selo + score breakdown + "Top" do chip VOLTAM. A lógica de QUANDO
// setar "personalized" é onda 2 — aqui só prova que o gancho existe e funciona.
describe("FIX-220 — recommendationStage: personalized reativa o destaque (gancho onda 2)", () => {
	afterEach(() => {
		cleanup();
		sendAction.mockClear();
	});

	it("com recommendationStage=personalized, o selo Recomendação + score breakdown voltam", () => {
		renderReveal({ ...rec, recommendationStage: "personalized" });
		expect(screen.getByText("Recomendação")).toBeTruthy();
		expect(screen.getByText(/por que esta recomenda/i)).toBeTruthy();
		// troca a seleção pra ver o crown "Top" na cota recomendada (BB), que deixa
		// de estar selecionada no chip mas segue marcada como a melhor
		fireEvent.click(screen.getByRole("option", { name: /ITAÚ/i }));
		expect(screen.getByText("Top")).toBeTruthy();
	});
});

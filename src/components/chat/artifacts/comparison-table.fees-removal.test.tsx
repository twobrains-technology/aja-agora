// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComparisonTablePayload } from "@/lib/chat/types";
import { ComparisonTable } from "./comparison-table";

// Decisão de produto (Bernardo, 2026-06-11): cards diretos, sem taxa de
// administração (assusta o leigo). O comparison-table (carrossel "Ver outras
// opções" / reveal) escapou da primeira poda e ainda exibia "Taxa". A composição
// completa vive na proposta (PDF) pré-assinatura — ver docs/jornada/CONTEXT.md.

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendAction: vi.fn(),
		status: "ready",
	}),
}));

const payload: ComparisonTablePayload = {
	highlightBestIndex: 0,
	groups: [
		{
			id: "g1",
			administradora: "ITAÚ",
			category: "auto",
			creditValue: 147238,
			monthlyPayment: 5978,
			adminFeePercent: 18,
			termMonths: 29,
			contemplationRate: 2,
			availableSlots: 6,
		},
		{
			id: "g2",
			administradora: "RODOBENS",
			category: "auto",
			creditValue: 120000,
			monthlyPayment: 3200,
			adminFeePercent: 16,
			termMonths: 60,
			contemplationRate: 2,
			availableSlots: 4,
		},
	],
};

describe("ComparisonTable — sem Taxa no carrossel (Bernardo 2026-06-11)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("NÃO exibe Taxa (nem o % de administração) nos cards do carrossel", () => {
		render(<ComparisonTable payload={payload} />);
		expect(screen.queryByText(/^taxa$/i)).toBeNull();
		expect(document.body.textContent).not.toMatch(/\bTaxa\b/);
		expect(document.body.textContent).not.toMatch(/18[,.]0?%/);
	});

	it("mantém o essencial: administradora, valor do bem, parcela e prazo", () => {
		render(<ComparisonTable payload={payload} />);
		expect(screen.getByText(/ITAÚ/)).toBeTruthy();
		// O rótulo virou "Carta de crédito" (o termo que a administradora usa e o
		// que aparece na proposta) — um por oferta listada.
		expect(screen.getAllByText(/carta de crédito/i).length).toBe(2);
		expect(document.body.textContent).toMatch(/29m/);
	});
});

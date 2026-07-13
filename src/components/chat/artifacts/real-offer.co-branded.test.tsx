// @vitest-environment happy-dom
/**
 * FIX-232 (docs/02-cards-novos.md "real-offer (proposta)"): header co-branded
 * Aja Agora + administradora, selo "0% de juros", chips de credibilidade.
 * Economia vs. financiamento SÓ com a premissa (taxa/CET) — nunca número de
 * economia sem premissa (mesmo risco de "prometer prazo").
 */

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

const PAYLOAD = {
	proposalId: "prop-1",
	administradora: "CANOPUS",
	grupo: "4400",
	category: "auto" as const,
	creditValue: 46_000,
	monthlyPayment: 469.95,
	termMonths: 72,
};

describe("RealOffer — header co-branded + selo + chips (FIX-232)", () => {
	afterEach(cleanup);

	it("mostra o selo '0% de juros — você paga o bem, não os juros do banco'", () => {
		render(<RealOffer payload={PAYLOAD} />);
		expect(screen.getByText(/0%\s*de juros/i)).toBeTruthy();
		expect(screen.getByText(/voc[êe] paga o bem, n[ãa]o os juros do banco/i)).toBeTruthy();
	});

	it("mostra os 4 chips de credibilidade", () => {
		render(<RealOffer payload={PAYLOAD} />);
		expect(screen.getByText(/sem juros/i)).toBeTruthy();
		expect(screen.getByText(/fiscalizado pelo banco central/i)).toBeTruthy();
		expect(screen.getByText(/dados protegidos/i)).toBeTruthy();
		expect(screen.getByText(/acompanhamento at[ée] a contempla[çc][ãa]o/i)).toBeTruthy();
	});

	it("mostra a administradora no header co-branded (logo/marca)", () => {
		render(<RealOffer payload={PAYLOAD} />);
		expect(screen.getAllByText(/CANOPUS/i).length).toBeGreaterThan(0);
	});

	it("nunca exibe economia vs financiamento sem a premissa (taxa/CET) junto", () => {
		render(<RealOffer payload={PAYLOAD} />);
		const text = document.body.textContent ?? "";
		if (/economia/i.test(text)) {
			expect(text).toMatch(/CET|taxa/i);
		}
	});
});

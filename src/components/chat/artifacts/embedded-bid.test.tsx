// @vitest-environment happy-dom
/**
 * FIX-228 (docs/02-cards-novos.md CARD 1 — embedded_bid). Regra dura: o card
 * SEMPRE mostra a consequência "o crédito recebido diminui" — hardcoded na
 * copy (não interpolado do disclaimer), pra sobreviver independente do que o
 * servidor mandar.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EmbeddedBidPayload } from "@/lib/chat/types";
import { EmbeddedBid } from "./embedded-bid";

const payload: EmbeddedBidPayload = {
	maxEmbutidoPct: 30,
	creditValue: 120_000,
	embeddedBidValue: 36_000,
	netCredit: 84_000,
	disclaimer: "O embutido sai da carta, então o crédito recebido diminui.",
};

describe("EmbeddedBid", () => {
	it("mostra o título 'Lance embutido — sem tirar do bolso'", () => {
		render(<EmbeddedBid payload={payload} />);
		expect(screen.getByText(/lance embutido.*sem tirar do bolso/i)).toBeTruthy();
	});

	it("SEMPRE mostra que o crédito recebido diminui", () => {
		render(<EmbeddedBid payload={payload} />);
		expect(screen.getAllByText(/cr[ée]dito recebido diminui/i).length).toBeGreaterThan(0);
	});

	it("mostra o crédito líquido real (netCredit)", () => {
		render(<EmbeddedBid payload={payload} />);
		expect(document.body.textContent).toMatch(/84\.000/);
	});

	it("SEMPRE mostra a consequência mesmo com payload variando (sem depender do disclaimer do server)", () => {
		render(<EmbeddedBid payload={{ ...payload, disclaimer: "" }} />);
		expect(screen.getAllByText(/cr[ée]dito recebido diminui/i).length).toBeGreaterThan(0);
	});
});

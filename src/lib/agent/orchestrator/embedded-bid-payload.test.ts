// FIX-228 (docs/02-cards-novos.md CARD 1 — embedded_bid): "esse card sempre
// diz que o crédito recebido diminui" — regra dura, não opcional. Os números
// vêm da oferta REAL ancorada no turno; a LLM só escolhe o grupo (mesmo
// padrão de coerção server-side de recommendation-payload.ts/dial-payload.ts).

import { describe, expect, it } from "vitest";
import type { RecommendedOfferSnapshot } from "./dial-payload";
import { coerceEmbeddedBidPayload } from "./embedded-bid-payload";

const offer: RecommendedOfferSnapshot = {
	administradora: "ÂNCORA",
	category: "auto",
	creditValue: 120_000,
	termMonths: 80,
	monthlyPayment: 1_800,
	maxEmbutidoPct: 30,
};

describe("coerceEmbeddedBidPayload", () => {
	it("netCredit === creditValue - embeddedBidValue, mesmo se a LLM mandar outros números", () => {
		const input = {
			maxEmbutidoPct: 999,
			creditValue: 1,
			embeddedBidValue: 1,
			netCredit: 999_999,
			disclaimer: "texto inventado pela LLM",
		};
		const out = coerceEmbeddedBidPayload(input, offer);
		expect(out.creditValue).toBe(120_000);
		expect(out.maxEmbutidoPct).toBe(30);
		expect(out.embeddedBidValue).toBe(36_000);
		expect(out.netCredit).toBe(84_000);
		expect(out.netCredit).toBe((out.creditValue as number) - (out.embeddedBidValue as number));
	});

	it("disclaimer sempre contém 'crédito recebido diminui', ignorando o que a LLM mandou", () => {
		const out = coerceEmbeddedBidPayload({ disclaimer: "sem consequência nenhuma" }, offer);
		expect(out.disclaimer).toMatch(/cr[ée]dito recebido diminui/i);
	});

	it("sem oferta ancorada (turno sem reveal), ainda força o disclaimer fixo", () => {
		const out = coerceEmbeddedBidPayload({}, null);
		expect(out.disclaimer).toMatch(/cr[ée]dito recebido diminui/i);
	});

	it("usa o teto default de 30% quando a oferta não traz maxEmbutidoPct", () => {
		const { maxEmbutidoPct: _drop, ...offerSemTeto } = offer;
		const out = coerceEmbeddedBidPayload({}, offerSemTeto);
		expect(out.maxEmbutidoPct).toBe(30);
		expect(out.embeddedBidValue).toBe(36_000);
	});
});

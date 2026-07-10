// FIX-229 (docs/02-cards-novos.md CARD 3 — two_paths): NENHUMA métrica de
// chance/probabilidade de contemplação pode vazar pro payload — mesmo se a
// LLM mandar. `monthlyPayment`/`administradora` vêm da oferta REAL ancorada
// no turno, coagidos server-side (mesmo padrão de embedded-bid-payload.ts).

import { describe, expect, it } from "vitest";
import type { RecommendedOfferSnapshot } from "./dial-payload";
import { coerceTwoPathsPayload } from "./two-paths-payload";

const offer: RecommendedOfferSnapshot = {
	administradora: "CANOPUS",
	category: "auto",
	creditValue: 90_000,
	termMonths: 72,
	monthlyPayment: 812,
};

describe("coerceTwoPathsPayload", () => {
	it("monthlyPayment/administradora vêm da oferta real, ignorando o que a LLM mandou", () => {
		const input = { monthlyPayment: 1, administradora: "banco fabricado" };
		const out = coerceTwoPathsPayload(input, offer);
		expect(out.monthlyPayment).toBe(812);
		expect(out.administradora).toBe("CANOPUS");
	});

	it("NUNCA propaga campo de probabilidade/chance mesmo se o input tiver um", () => {
		const input = {
			monthlyPayment: 1,
			administradora: "x",
			chanceDeContemplacao: 0.42,
			probability: "alta",
			likelihood: "alta",
		};
		const out = coerceTwoPathsPayload(input, offer);
		expect(Object.keys(out).sort()).toEqual(["administradora", "disclaimer", "monthlyPayment"]);
	});

	it("disclaimer é sempre o texto fixo, ignorando o que a LLM mandou", () => {
		const out = coerceTwoPathsPayload({ disclaimer: "invenção" }, offer);
		expect(typeof out.disclaimer).toBe("string");
		expect((out.disclaimer as string).length).toBeGreaterThan(0);
	});

	it("sem oferta ancorada, ainda retorna um payload seguro (sem propagar campos crus)", () => {
		const out = coerceTwoPathsPayload({ monthlyPayment: 1, administradora: "x" }, null);
		expect(Object.keys(out).sort()).toEqual(["administradora", "disclaimer", "monthlyPayment"]);
	});
});

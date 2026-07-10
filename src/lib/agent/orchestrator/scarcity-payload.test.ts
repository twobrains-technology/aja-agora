// FIX-230 (docs/02-cards-novos.md CARD 2 — scarcity; ADR
// docs/decisoes/blocos/2026-07-09-agente-vendas-consorcio.md D3): número
// placebo comercial 1-6, hash DETERMINÍSTICO do id do grupo — NUNCA
// Math.random() por render (senão "restam 3" vira "restam 5" no refresh e
// destrói a credibilidade). NUNCA exibe total de cotas nem razão N/total.

import { describe, expect, it } from "vitest";
import type { RevealGroupIndex } from "./recommendation-payload";
import { coerceScarcityPayload, stableSlotFromId } from "./scarcity-payload";

describe("stableSlotFromId", () => {
	it("mesmo id → sempre o mesmo número (determinístico, sem Math.random)", () => {
		const id = "6a0ca9ca1b2c3d4e5f607182";
		const results = Array.from({ length: 20 }, () => stableSlotFromId(id));
		expect(new Set(results).size).toBe(1);
	});

	it("número sempre no intervalo [1,6]", () => {
		const ids = [
			"a",
			"grupo-1",
			"6a0ca9ca1b2c3d4e5f607182",
			"outro-grupo-qualquer",
			"000000000000000000000000",
			"ffffffffffffffffffffffff",
		];
		for (const id of ids) {
			const slot = stableSlotFromId(id);
			expect(slot).toBeGreaterThanOrEqual(1);
			expect(slot).toBeLessThanOrEqual(6);
		}
	});

	it("ids diferentes tendem a números diferentes (não é uma constante disfarçada)", () => {
		const ids = Array.from({ length: 12 }, (_, i) => `grupo-${i}`);
		const slots = new Set(ids.map(stableSlotFromId));
		expect(slots.size).toBeGreaterThan(1);
	});
});

describe("coerceScarcityPayload", () => {
	function makeIndex(): RevealGroupIndex {
		const index: RevealGroupIndex = new Map();
		index.set("grp-real-1", {
			id: "grp-real-1",
			administradora: "CANOPUS",
			creditValue: 90_000,
			monthlyPayment: 812,
			termMonths: 72,
		});
		return index;
	}

	it("ancora availableSlots no groupId real — mesmo se a LLM mandar outro número", () => {
		const index = makeIndex();
		const out = coerceScarcityPayload({ groupId: "grp-real-1", availableSlots: 999 }, index);
		expect(out.availableSlots).toBe(stableSlotFromId("grp-real-1"));
		expect(out.administradora).toBe("CANOPUS");
	});

	it("sem groupId válido ancorado, não fabrica número (availableSlots ausente)", () => {
		const index = makeIndex();
		const out = coerceScarcityPayload({ groupId: "grupo-inexistente" }, index);
		expect(out.availableSlots).toBeUndefined();
	});

	it("NUNCA inclui total de cotas nem razão — só groupCode/administradora/availableSlots/disclaimer", () => {
		const index = makeIndex();
		const out = coerceScarcityPayload(
			{ groupId: "grp-real-1", totalSlots: 500, ratio: "3/500" },
			index,
		);
		expect(Object.keys(out).sort()).toEqual(
			["administradora", "availableSlots", "disclaimer", "groupCode"].sort(),
		);
	});
});

// FIX-287 — extractKnownCreditValue (extrator puro do creditValue REAL
// simulado por groupId, minerado dos artifacts `simulation_result` persistidos).
import { describe, expect, it } from "vitest";
import { extractKnownCreditValue } from "./known-credit-values";

describe("FIX-287 — extractKnownCreditValue", () => {
	it("simulation_result: extrai {groupId, creditValue}", () => {
		const result = extractKnownCreditValue("simulation_result", {
			groupId: "6a3e6ceb419653c0a99932d7",
			administradora: "BANCO DO BRASIL",
			creditValue: 160000,
			monthlyPayment: 2000,
		});
		expect(result).toEqual({ groupId: "6a3e6ceb419653c0a99932d7", creditValue: 160000 });
	});

	it("outro tipo (comparison_table, recommendation_card) → null, não contamina", () => {
		expect(
			extractKnownCreditValue("comparison_table", { groups: [{ id: "x", creditValue: 100 }] }),
		).toBeNull();
		expect(
			extractKnownCreditValue("recommendation_card", { id: "x", creditValue: 100 }),
		).toBeNull();
	});

	it("payload malformado (null, array, sem groupId/creditValue) → null, não quebra", () => {
		expect(extractKnownCreditValue("simulation_result", null)).toBeNull();
		expect(extractKnownCreditValue("simulation_result", [])).toBeNull();
		expect(extractKnownCreditValue("simulation_result", {})).toBeNull();
		expect(extractKnownCreditValue("simulation_result", { groupId: "x" })).toBeNull();
		expect(extractKnownCreditValue("simulation_result", { creditValue: 100 })).toBeNull();
	});

	it("creditValue <= 0 ou não-finito → null (dado inutilizável nunca sobrescreve)", () => {
		expect(
			extractKnownCreditValue("simulation_result", { groupId: "x", creditValue: 0 }),
		).toBeNull();
		expect(
			extractKnownCreditValue("simulation_result", { groupId: "x", creditValue: -100 }),
		).toBeNull();
		expect(
			extractKnownCreditValue("simulation_result", { groupId: "x", creditValue: Number.NaN }),
		).toBeNull();
	});
});

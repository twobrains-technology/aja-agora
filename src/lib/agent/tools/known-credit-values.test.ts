// FIX-287/FIX-292 — extractKnownCreditValue (extrator puro do cenário REAL
// simulado por groupId — creditValue + monthlyPayment + termMonths, quando
// disponíveis — minerado dos artifacts `simulation_result` persistidos).
import { describe, expect, it } from "vitest";
import { extractKnownCreditValue } from "./known-credit-values";

describe("FIX-287/FIX-292 — extractKnownCreditValue", () => {
	it("simulation_result: extrai {groupId, creditValue, monthlyPayment}", () => {
		const result = extractKnownCreditValue("simulation_result", {
			groupId: "6a3e6ceb419653c0a99932d7",
			administradora: "BANCO DO BRASIL",
			creditValue: 160000,
			monthlyPayment: 2000,
		});
		expect(result).toEqual({
			groupId: "6a3e6ceb419653c0a99932d7",
			creditValue: 160000,
			monthlyPayment: 2000,
		});
	});

	it("simulation_result com termMonths utilizável: extrai também termMonths", () => {
		const result = extractKnownCreditValue("simulation_result", {
			groupId: "6a3e6ceb419653c0a99932d7",
			creditValue: 160000,
			monthlyPayment: 2000,
			termMonths: 72,
		});
		expect(result).toEqual({
			groupId: "6a3e6ceb419653c0a99932d7",
			creditValue: 160000,
			monthlyPayment: 2000,
			termMonths: 72,
		});
	});

	it("creditValue presente mas monthlyPayment ausente/inválido → null (fonte única multi-campo, nunca contamina o mapa com metade do cenário)", () => {
		expect(
			extractKnownCreditValue("simulation_result", {
				groupId: "x",
				creditValue: 160000,
			}),
		).toBeNull();
		expect(
			extractKnownCreditValue("simulation_result", {
				groupId: "x",
				creditValue: 160000,
				monthlyPayment: 0,
			}),
		).toBeNull();
		expect(
			extractKnownCreditValue("simulation_result", {
				groupId: "x",
				creditValue: 160000,
				monthlyPayment: -1,
			}),
		).toBeNull();
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

// FIX-292 (rodada r9 onda 4, veredito r9pos3 §3 P1 Cálculo): o FIX-287
// corrigiu SÓ `creditValue` quando o groupId já tinha um `simulation_result`
// conhecido — `monthlyPayment` continuava vindo da estimativa antiga,
// dessincronizado do `creditValue` real recém-corrigido dentro do MESMO
// artifact. `knownCreditValueByGroupId` vira fonte única multi-campo
// (creditValue + monthlyPayment + termMonths) em vez de só creditValue.
import { describe, expect, it } from "vitest";
import { coerceRevealCota, indexRevealGroups, type RevealGroupIndex } from "./recommendation-payload";

function realGroup(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: "6a3e6cec419653c0a99937aa",
		administradora: "BANCO DO BRASIL",
		category: "auto",
		creditValue: 150000,
		monthlyPayment: 3549.75,
		termMonths: 60,
		...over,
	};
}

describe("FIX-292 — monthlyPayment consistente com o creditValue conhecido (fonte única multi-campo)", () => {
	it("groupId já simulado (dossiê probe-i3-fabricacao, turno 7): creditValue E monthlyPayment vêm do MESMO cenário conhecido, nunca uma mistura", () => {
		const group = realGroup();
		const knownCreditValueByGroupId = new Map([
			[group.id, { creditValue: 211258, monthlyPayment: 5136.66 }],
		]);

		const out = coerceRevealCota(
			{ id: group.id, creditValue: 150000, monthlyPayment: 3549.75, termMonths: 60 },
			group,
			undefined,
			knownCreditValueByGroupId,
		);

		expect(out.creditValue).toBe(211258);
		expect(out.monthlyPayment).toBe(5136.66);
		expect(out.rawCreditValue).toBe(150000);
	});

	it("known traz termMonths também → sobrescreve termMonths junto (mesmo cenário completo)", () => {
		const group = realGroup();
		const knownCreditValueByGroupId = new Map([
			[group.id, { creditValue: 211258, monthlyPayment: 5136.66, termMonths: 80 }],
		]);

		const out = coerceRevealCota(
			{ id: group.id, creditValue: 150000, monthlyPayment: 3549.75, termMonths: 60 },
			group,
			undefined,
			knownCreditValueByGroupId,
		);

		expect(out.termMonths).toBe(80);
	});

	it("groupId SEM conhecido (nunca simulado) → mantém comportamento atual, estimativa completa, sem sobrescrever nada", () => {
		const group = realGroup();
		const out = coerceRevealCota(
			{ id: group.id, creditValue: 150000, monthlyPayment: 3549.75, termMonths: 60 },
			group,
			undefined,
			new Map(),
		);

		expect(out.creditValue).toBe(150000);
		expect(out.monthlyPayment).toBe(3549.75);
		expect("rawCreditValue" in out).toBe(false);
	});

	it("known SEM divergência de creditValue (coincidência) → ainda assim aplica monthlyPayment/termMonths conhecidos, sem rawCreditValue", () => {
		const group = realGroup({ creditValue: 211258 });
		const knownCreditValueByGroupId = new Map([
			[group.id, { creditValue: 211258, monthlyPayment: 5136.66 }],
		]);

		const out = coerceRevealCota(
			{ id: group.id, creditValue: 211258, monthlyPayment: 3549.75, termMonths: 60 },
			group,
			undefined,
			knownCreditValueByGroupId,
		);

		expect(out.creditValue).toBe(211258);
		expect(out.monthlyPayment).toBe(5136.66);
		expect("rawCreditValue" in out).toBe(false);
	});

	it("index recém-populado (RevealGroupIndex) segue funcionando normalmente — smoke de compatibilidade de tipo", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });
		expect(index.size).toBe(1);
	});
});

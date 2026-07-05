import { describe, expect, it } from "vitest";
import {
	computeContemplationDial,
	contemplationDialMarks,
	paymentAfterLabel,
} from "./contemplation-dial";

const base = {
	creditValue: 100_000,
	termMonths: 80,
	historicalWinningBidPct: 40,
	monthlyPayment: 1500,
};

describe("computeContemplationDial — trade-off tempo↔lance↔crédito", () => {
	it("mais cedo exige MAIS lance que mais tarde (monotônico)", () => {
		const m3 = computeContemplationDial({ ...base, targetMonth: 3 });
		const m12 = computeContemplationDial({ ...base, targetMonth: 12 });
		const m48 = computeContemplationDial({ ...base, targetMonth: 48 });
		expect(m3.requiredLancePct).toBeGreaterThan(m12.requiredLancePct);
		expect(m12.requiredLancePct).toBeGreaterThan(m48.requiredLancePct);
	});

	it("lance embutido limitado ao teto; excedente vira lance próprio (cash)", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 3, maxEmbutidoPct: 30 });
		expect(r.embeddedBidPct).toBeLessThanOrEqual(30);
		if (r.requiredLancePct > 30) {
			expect(r.ownCashPct).toBe(r.requiredLancePct - r.embeddedBidPct);
			expect(r.ownCashValue).toBeGreaterThan(0);
		}
	});

	it("crédito líquido = carta − lance embutido (em R$)", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 6 });
		expect(r.receivedCredit).toBe(100_000 - r.embeddedBidValue);
		expect(r.receivedCredit).toBeLessThanOrEqual(100_000);
	});

	it("lance (dinheiro + embutido) abate o saldo → parcela pós-contemplação menor que a base (FIX-221 AMORTIZA)", () => {
		// Modelo antigo (parcela × (1 − lance%)) era fantasia: contava o EMBUTIDO
		// como abatimento e aplicava o desconto desde o mês 1. Auditoria 2026-06-11.
		// FIX-221 (Ata 2026-07-04): o modelo agora É que o lance TOTAL (embutido +
		// dinheiro) amortiza o saldo pós-contemplação — inverte C4/D18 antigos.
		const r = computeContemplationDial({ ...base, targetMonth: 6 });
		// targetMonth 6 num grupo de 80 meses exige lance > teto de embutido →
		// tem parte em dinheiro, que abate o saldo restante.
		expect(r.ownCashValue).toBeGreaterThan(0);
		expect(r.paymentAfterContemplation).toBeLessThan(1500);
		// e a diluição é o lance TOTAL (embutido + bolso) espalhado nos meses restantes
		const expected = (1500 * (80 - 6) - r.ownCashValue - r.embeddedBidValue) / (80 - 6);
		expect(r.paymentAfterContemplation).toBeCloseTo(expected, 1);
	});

	it("teto de 80% no lance pra metas muito agressivas", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 1, historicalWinningBidPct: 60 });
		expect(r.requiredLancePct).toBeLessThanOrEqual(80);
	});

	it("'sem pressa' (mês tardio) → modo sorteio, lance opcional/baixo", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 76 });
		expect(r.mode).toBe("sorteio");
		expect(r.requiredLancePct).toBeLessThanOrEqual(10);
	});

	it("likelihood alta quando dá pra fazer só com a carta (≤ teto embutido)", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 24 });
		if (r.requiredLancePct <= 30) expect(r.likelihood).toBe("alta");
	});

	it("clampa targetMonth fora do prazo do grupo", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 999 });
		expect(r.targetMonth).toBe(80);
	});

	it("sem sinal histórico usa default sem quebrar", () => {
		const r = computeContemplationDial({ creditValue: 50_000, termMonths: 60, targetMonth: 12 });
		expect(r.requiredLancePct).toBeGreaterThanOrEqual(0);
		expect(r.requiredLanceValue).toBeGreaterThanOrEqual(0);
	});
});

describe("contemplationDialMarks — fallback estático (WhatsApp)", () => {
	it("gera marcos só dentro do prazo, em ordem decrescente de lance", () => {
		const marks = contemplationDialMarks(base, [3, 6, 12, 24]);
		expect(marks.length).toBe(4);
		expect(marks[0].targetMonth).toBe(3);
		// 3 meses exige mais lance que 24
		expect(marks[0].requiredLancePct).toBeGreaterThan(marks[3].requiredLancePct);
	});

	it("descarta marcos além do prazo do grupo", () => {
		const marks = contemplationDialMarks({ ...base, termMonths: 10 }, [3, 6, 12, 24]);
		expect(marks.every((m) => m.targetMonth <= 10)).toBe(true);
	});
});

// BUG-DIAL-NAN (auditoria adversarial Opus 2026-06-28): input fora de contrato
// (creditValue/termMonths/targetMonth NaN, ex.: Math.max(0, NaN) === NaN a montante)
// vazava NaN em requiredLanceValue/embeddedBidValue → "R$ NaN" na tela. Sanitiza na
// fronteira: NaN/não-finito vira o degenerado seguro, NUNCA propaga NaN.
describe("computeContemplationDial — blindagem contra NaN (input fora de contrato)", () => {
	it("creditValue NaN → nenhum campo numérico vira NaN", () => {
		const r = computeContemplationDial({ creditValue: Number.NaN, termMonths: 80, targetMonth: 12 });
		for (const [k, v] of Object.entries(r)) {
			if (typeof v === "number") expect(Number.isNaN(v), `campo ${k}`).toBe(false);
		}
	});

	it("TODOS os campos numéricos NaN → degrada sem vazar NaN", () => {
		const r = computeContemplationDial({
			creditValue: Number.NaN,
			termMonths: Number.NaN,
			targetMonth: Number.NaN,
			historicalWinningBidPct: Number.NaN,
			referenceMonth: Number.NaN,
			monthlyPayment: Number.NaN,
			maxEmbutidoPct: Number.NaN,
		});
		for (const [k, v] of Object.entries(r)) {
			if (typeof v === "number") expect(Number.isNaN(v), `campo ${k}`).toBe(false);
		}
	});
});

// FIX-221 (Ata 2026-07-04, inbox 2026-07-02-dial-parcela-apos-lance-identica):
// bug real — com lance 100% embutido, a parcela "depois" saía IDÊNTICA à de
// antes mas rotulada "menor, depois do lance" (contradição visível). O rótulo
// NUNCA pode mentir — só diz "menor" quando o número de fato caiu.
describe("paymentAfterLabel — rótulo nunca mente (FIX-221)", () => {
	it("parcela depois MENOR → 'menor, depois do lance'", () => {
		expect(paymentAfterLabel(800, 6_800)).toBe("menor, depois do lance");
	});

	it("parcela depois IGUAL (sem lance a abater) → rótulo neutro, NUNCA 'menor'", () => {
		expect(paymentAfterLabel(6_800, 6_800)).not.toMatch(/menor/i);
	});

	it("sem estimativa (undefined, ex.: contemplação no último mês) → rótulo neutro", () => {
		expect(paymentAfterLabel(undefined, 6_800)).not.toMatch(/menor/i);
	});
});

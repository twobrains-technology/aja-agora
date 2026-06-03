import { describe, expect, it } from "vitest";
import { computeContemplationDial, contemplationDialMarks } from "./contemplation-dial";

const base = { creditValue: 100_000, termMonths: 80, historicalWinningBidPct: 40, monthlyPayment: 1500 };

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

	it("lance abate o saldo → parcela estimada menor que a base", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 6 });
		expect(r.estimatedMonthlyPayment).toBeLessThan(1500);
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

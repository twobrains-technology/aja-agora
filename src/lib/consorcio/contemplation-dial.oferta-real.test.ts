// Camada 1 — FIX-C1/C4 (auditoria Kairo 2026-06-11, jornada BB real):
// o dial mostrava 74% pro MESMO cenário que o card dizia 49,28% → ~6 meses.
// Causa: o motor assumia que o lance de referência vence no mês-âncora
// heurístico (25% do prazo) e EXTRAPOLAVA por cima do dado real da Bevi
// (probContemplacaoMeses). C1: `referenceMonth` calibra a curva no par real
// (lance%, mês). C4: "parcela estimada R$ 2.556" era fantasia dupla — o
// embutido não abate parcela (reduz o crédito) e o abatimento do lance em
// dinheiro só vale APÓS a contemplação.

import { describe, expect, it } from "vitest";
import { computeContemplationDial } from "./contemplation-dial";

// Oferta real da jornada auditada (BANCO DO BRASIL via Bevi)
const BB = {
	creditValue: 262_309.8,
	termMonths: 34,
	monthlyPayment: 9_828.92,
	historicalWinningBidPct: 49.28,
	referenceMonth: 6, // probContemplacaoMeses real da oferta
	maxEmbutidoPct: 49.28, // bidPercentage real da oferta
};

describe("C1 — referenceMonth calibra a curva no dado real da Bevi", () => {
	it("no mês de referência o lance necessário É o lance real da oferta (card = dial)", () => {
		const r = computeContemplationDial({ ...BB, targetMonth: 6 });
		// round(49.28) = 49 — nunca mais os 74% extrapolados
		expect(r.requiredLancePct).toBe(49);
	});

	it("monotônico: antes do mês de referência exige mais; depois, menos", () => {
		const at3 = computeContemplationDial({ ...BB, targetMonth: 3 }).requiredLancePct;
		const at6 = computeContemplationDial({ ...BB, targetMonth: 6 }).requiredLancePct;
		const at12 = computeContemplationDial({ ...BB, targetMonth: 12 }).requiredLancePct;
		const at27 = computeContemplationDial({ ...BB, targetMonth: 27 }).requiredLancePct;
		expect(at3).toBeGreaterThan(at6);
		expect(at6).toBeGreaterThan(at12);
		expect(at12).toBeGreaterThan(at27);
	});

	it("com embutido real da oferta (49.28%) o lance no mês 6 sai TODO da carta — bolso zero", () => {
		const r = computeContemplationDial({ ...BB, targetMonth: 6 });
		expect(r.ownCashValue).toBe(0);
		// BUG-LANCE-ACIMA-DO-MEDIO (defeito 2, 2026-07-21): o esperado era
		// `carta × 49/100` — o percentual REAL da oferta (49,28%) arredondado a
		// inteiro antes de virar R$, o que jogava R$ 734,47 fora. O valor agora
		// sai da fração exata, então o esperado passa a ser o bidPercentage real.
		expect(r.embeddedBidValue).toBeCloseTo((262_309.8 * 49.28) / 100, 0);
		// recebe = carta − embutido (semântica Bevi: receivedCredit)
		expect(r.receivedCredit).toBeCloseTo(262_309.8 - r.embeddedBidValue, 2);
	});

	it("sem referenceMonth → âncora heurística de 25% do prazo, curva power calibrada nela (FIX-225)", () => {
		const r = computeContemplationDial({
			creditValue: 262_309.8,
			termMonths: 34,
			targetMonth: 6,
			historicalWinningBidPct: 49.28,
		});
		// anchor = round(34×0.25) = 9 → curva power calibrada em (9, 49.28%) → 59% no mês 6
		expect(r.requiredLancePct).toBe(59);
	});

	it("no prazo declarado do usuário da jornada (27 meses) o lance despenca — mensagem correta", () => {
		const r = computeContemplationDial({ ...BB, targetMonth: 27 });
		expect(r.requiredLancePct).toBeLessThan(15);
	});
});

describe("C4/FIX-221 — parcela honesta: lance TOTAL (embutido + dinheiro) amortiza o saldo pós-contemplação", () => {
	it("estimatedMonthlyPayment (modelo antigo, fantasia) não existe mais no result", () => {
		const r = computeContemplationDial({ ...BB, targetMonth: 6 });
		expect("estimatedMonthlyPayment" in r).toBe(false);
	});

	// FIX-221 (Ata 2026-07-04) INVERTE esta regra: o C4 original ("embutido reduz
	// crédito, não dívida") foi superSEDIDO pela decisão do stakeholder — o lance
	// TOTAL (embutido + dinheiro) agora amortiza o saldo. Ex. real (jornada
	// canônica D9): BB mostrava R$ 9.828,92 fixos; a Ata pede ~R$ 5.238.
	// PENDENTE-Bernardo validar o número exato antes de prod.
	it("lance 100% embutido → parcela pós-contemplação CAI (embutido amortiza o saldo, AMORTIZA)", () => {
		const r = computeContemplationDial({ ...BB, targetMonth: 6 });
		expect(r.ownCashValue).toBe(0);
		expect(r.embeddedBidValue).toBeGreaterThan(0);
		expect(r.paymentAfterContemplation).toBeLessThan(9_828.92);
		// saldo restante = parcela × 28 − embutido; diluído nos 28 meses restantes
		const expected = (9_828.92 * 28 - r.embeddedBidValue) / 28;
		expect(r.paymentAfterContemplation).toBeCloseTo(expected, 1);
		// BUG-LANCE-ACIMA-DO-MEDIO (defeito 2): R$ 5.238,50 vinha do lance
		// arredondado (49%); com o lance fiel à oferta (49,28%) o abatimento é
		// maior e a parcela cai um pouco mais. Segue dentro do ~R$ 5.238 da Ata.
		expect(r.paymentAfterContemplation).toBeCloseTo(5_212.27, 0);
	});

	it("lance em dinheiro E embutido somam no abatimento — dilui a parcela DEPOIS da contemplação", () => {
		// embutido capado em 30% → em t=6 sobra bolso (49% − 30% = 19%)
		const r = computeContemplationDial({ ...BB, maxEmbutidoPct: 30, targetMonth: 6 });
		expect(r.ownCashValue).toBeGreaterThan(0);
		// saldo restante = parcela × (34−6) − (bolso + embutido); diluído nos 28 meses restantes
		const expected = (9_828.92 * 28 - r.ownCashValue - r.embeddedBidValue) / 28;
		expect(r.paymentAfterContemplation).toBeCloseTo(expected, 1);
		expect(r.paymentAfterContemplation ?? 0).toBeLessThan(9_828.92);
	});

	it("lance em dinheiro maior que o saldo restante → parcela vai a zero, nunca negativa", () => {
		const r = computeContemplationDial({
			creditValue: 100_000,
			termMonths: 12,
			targetMonth: 11,
			monthlyPayment: 1_000,
			historicalWinningBidPct: 80,
			referenceMonth: 2,
			maxEmbutidoPct: 0, // tudo do bolso
		});
		if ((r.paymentAfterContemplation ?? 0) !== 0) {
			expect(r.ownCashValue).toBeLessThanOrEqual(1_000 * (12 - 11));
		}
		expect(r.paymentAfterContemplation ?? 0).toBeGreaterThanOrEqual(0);
	});

	it("contemplação no último mês ou sem parcela informada → sem estimativa pós", () => {
		const lastMonth = computeContemplationDial({ ...BB, targetMonth: 34 });
		expect(lastMonth.paymentAfterContemplation).toBeUndefined();
		const noPayment = computeContemplationDial({
			creditValue: 100_000,
			termMonths: 60,
			targetMonth: 6,
		});
		expect(noPayment.paymentAfterContemplation).toBeUndefined();
	});
});

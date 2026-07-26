/**
 * Camada 1 — FIX-3: engine do "Planeje sua conquista" (passo 2, gate credit).
 * 4 indicadores interligados em modo ESTIMATIVA DE MERCADO (a Bevi não simula
 * sem CPF — D1). Mexeu num indicador → os outros se ajustam.
 */

import { describe, expect, it } from "vitest";
import { computePlanEstimate, TYPICAL_TERM_MONTHS } from "./plan-estimate";

describe("FIX-3 — computePlanEstimate (estimativa de mercado)", () => {
	it("cenário do Kairo: moto R$ 20k, 6 meses, lance R$ 4k, com embutido", () => {
		const e = computePlanEstimate({
			category: "moto",
			assetValue: 20_000,
			targetMonth: 6,
			lanceValue: 4_000,
			lanceEmbutido: true,
		});
		expect(e.termMonths).toBe(TYPICAL_TERM_MONTHS.moto);
		expect(e.monthlyPayment).toBeGreaterThan(0);
		// mês 6 de 72 é cedo → exige lance relevante
		expect(e.mode).toBe("lance");
		expect(e.requiredLanceValue).toBeGreaterThan(0);
		// embutido ligado → parte sai da carta
		expect(e.embeddedBidValue).toBeGreaterThan(0);
		expect(e.receivedCredit).toBeLessThan(20_000);
	});

	it("interligação: mês-alvo mais cedo exige lance MAIOR", () => {
		const base = { category: "moto" as const, assetValue: 20_000, lanceEmbutido: true };
		const cedo = computePlanEstimate({ ...base, targetMonth: 3 });
		const tarde = computePlanEstimate({ ...base, targetMonth: 48 });
		expect(cedo.requiredLancePct).toBeGreaterThan(tarde.requiredLancePct);
	});

	it("interligação: parcela definida ajusta o prazo estimado", () => {
		const semParcela = computePlanEstimate({
			category: "moto",
			assetValue: 20_000,
			targetMonth: 6,
		});
		const parcelaApertada = computePlanEstimate({
			category: "moto",
			assetValue: 20_000,
			targetMonth: 6,
			monthlyBudget: 250,
		});
		// parcela menor → prazo maior (clampado a 1.5× o típico)
		expect(parcelaApertada.termMonths).toBeGreaterThan(semParcela.termMonths);
		expect(parcelaApertada.termMonths).toBeLessThanOrEqual(TYPICAL_TERM_MONTHS.moto * 1.5);
		// e a parcela estimada acompanha o prazo novo
		expect(parcelaApertada.monthlyPayment).toBeLessThan(semParcela.monthlyPayment);
	});

	it("interligação: lance embutido reduz o dinheiro do bolso necessário", () => {
		const sem = computePlanEstimate({
			category: "moto",
			assetValue: 20_000,
			targetMonth: 6,
			lanceEmbutido: false,
		});
		const com = computePlanEstimate({
			category: "moto",
			assetValue: 20_000,
			targetMonth: 6,
			lanceEmbutido: true,
		});
		expect(com.ownCashNeeded).toBeLessThan(sem.ownCashNeeded);
		// sem embutido, o valor recebido é a carta cheia
		expect(sem.receivedCredit).toBe(20_000);
	});

	it("lanceCoberto: reserva declarada cobre (ou não) a parte do bolso", () => {
		const coberto = computePlanEstimate({
			category: "moto",
			assetValue: 20_000,
			targetMonth: 6,
			lanceValue: 50_000,
			lanceEmbutido: true,
		});
		expect(coberto.lanceCoberto).toBe(true);
		const descoberto = computePlanEstimate({
			category: "moto",
			assetValue: 20_000,
			targetMonth: 3,
			lanceValue: 100,
			lanceEmbutido: false,
		});
		expect(descoberto.lanceCoberto).toBe(false);
	});

	it("mês-alvo tardio → sorteio basta (sem lance necessário)", () => {
		const e = computePlanEstimate({
			category: "moto",
			assetValue: 20_000,
			targetMonth: 70,
		});
		expect(e.mode).toBe("sorteio");
		expect(e.lanceCoberto).toBe(true);
	});

	it("clamps: mês-alvo nunca passa do prazo estimado", () => {
		const e = computePlanEstimate({
			category: "imovel",
			assetValue: 300_000,
			targetMonth: 999,
		});
		expect(e.termMonths).toBe(TYPICAL_TERM_MONTHS.imovel);
	});
});

describe("handoff (re-UX por intenção) — prazo escolhido direto no slider", () => {
	it("termMonths dado define o prazo e a parcela = total / termMonths", () => {
		const e = computePlanEstimate({
			category: "auto",
			assetValue: 90_000,
			targetMonth: 12,
			termMonths: 72,
		});
		expect(e.termMonths).toBe(72);
		// total = 90.000 × (1 + 0,15) = 103.500 · parcela = 103.500 / 72 ≈ 1.437,50
		expect(e.monthlyPayment).toBeCloseTo(103_500 / 72, 1);
	});

	it("termMonths tem PRECEDÊNCIA sobre o prazo derivado da parcela legada", () => {
		const e = computePlanEstimate({
			category: "moto",
			assetValue: 20_000,
			targetMonth: 6,
			termMonths: 48,
			monthlyBudget: 250,
		});
		expect(e.termMonths).toBe(48);
	});

	it("prazo menor → parcela maior (a parcela é o resultado calmo da escolha)", () => {
		const curto = computePlanEstimate({
			category: "auto",
			assetValue: 90_000,
			targetMonth: 12,
			termMonths: 48,
		});
		const longo = computePlanEstimate({
			category: "auto",
			assetValue: 90_000,
			targetMonth: 12,
			termMonths: 96,
		});
		expect(curto.monthlyPayment).toBeGreaterThan(longo.monthlyPayment);
	});

	it("termMonths é clampado a >= 1 (nunca divide por zero)", () => {
		const e = computePlanEstimate({
			category: "moto",
			assetValue: 20_000,
			targetMonth: 1,
			termMonths: 0,
		});
		expect(e.termMonths).toBeGreaterThanOrEqual(1);
	});
});

describe("FIX-18 — viabilidade orçamento × valor do bem (confronto no picker)", () => {
	it("jornada real do Kairo: carro 250k · 1.000/mês → INVIÁVEL (parcela não fecha o bem)", () => {
		// 250k de carro a R$ 1.000/mês ≈ 24 anos — não existe grupo de auto assim
		// (típico ≤ 120m com o teto de 1.5×). O picker tem que sinalizar.
		const e = computePlanEstimate({
			category: "auto",
			assetValue: 250_000,
			targetMonth: 27,
			monthlyBudget: 1_000,
		});
		expect(e.budgetFeasible).toBe(false);
		// E orienta: com R$ 1.000/mês o bem viável fica na casa de ~R$ 100k.
		expect(e.viableAssetForBudget).toBeGreaterThan(80_000);
		expect(e.viableAssetForBudget).toBeLessThan(130_000);
		// O bem viável é MUITO menor que o declarado (confronto faz sentido).
		expect(e.viableAssetForBudget).toBeLessThan(250_000);
	});

	it("parcela que fecha o bem dentro do teto → viável", () => {
		const e = computePlanEstimate({
			category: "auto",
			assetValue: 100_000,
			targetMonth: 12,
			monthlyBudget: 2_000,
		});
		expect(e.budgetFeasible).toBe(true);
	});

	it("sem parcela declarada → não julga viabilidade (budgetFeasible=true)", () => {
		const e = computePlanEstimate({ category: "auto", assetValue: 250_000, targetMonth: 12 });
		expect(e.budgetFeasible).toBe(true);
	});

	it("viableAssetForBudget cabe na parcela declarada no prazo máximo realista", () => {
		// Sanidade: o bem viável calculado, ele PRÓPRIO, é viável com a parcela.
		const e = computePlanEstimate({
			category: "auto",
			assetValue: 250_000,
			targetMonth: 12,
			monthlyBudget: 1_000,
		});
		const reCheck = computePlanEstimate({
			category: "auto",
			assetValue: e.viableAssetForBudget,
			targetMonth: 12,
			monthlyBudget: 1_000,
		});
		expect(reCheck.budgetFeasible).toBe(true);
	});
});

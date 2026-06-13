import { describe, expect, it } from "vitest";
import { compareWithFinancing, computePMT, DEFAULT_FINANCING_RATES } from "./pmt";

describe("computePMT — fórmula Price (bug #17)", () => {
	it("PMT(100k, 24m, 12%/ano) ≈ R$ 4.707,35 (caso canônico Price)", () => {
		const pmt = computePMT(100_000, 24, 12);
		expect(pmt).toBeGreaterThan(4_700);
		expect(pmt).toBeLessThan(4_715);
	});

	it("taxa anual zero → PMT = principal / prazo (caso degenerado)", () => {
		const pmt = computePMT(120_000, 12, 0);
		expect(pmt).toBeCloseTo(10_000, 0);
	});

	it("PMT(900k, 240m, 10%/ano) ≈ R$ 8.681,75 (caso imóvel BACEN)", () => {
		const pmt = computePMT(900_000, 240, 10);
		expect(Math.abs(pmt - 8681.75)).toBeLessThan(5);
	});

	it("PMT é determinístico — mesma entrada, mesma saída", () => {
		expect(computePMT(50_000, 36, 22)).toBe(computePMT(50_000, 36, 22));
	});

	it("rejeita prazo zero", () => {
		expect(() => computePMT(100_000, 0, 12)).toThrow();
	});
});

describe("DEFAULT_FINANCING_RATES — premissas por categoria", () => {
	it("imóvel tem taxa ~10%/ano (CET BACEN típico)", () => {
		expect(DEFAULT_FINANCING_RATES.imovel).toBeGreaterThanOrEqual(8);
		expect(DEFAULT_FINANCING_RATES.imovel).toBeLessThanOrEqual(14);
	});

	it("auto tem taxa ~22%/ano", () => {
		expect(DEFAULT_FINANCING_RATES.auto).toBeGreaterThanOrEqual(18);
		expect(DEFAULT_FINANCING_RATES.auto).toBeLessThanOrEqual(28);
	});

	it("moto tem taxa ~28%/ano (mais alta que auto)", () => {
		expect(DEFAULT_FINANCING_RATES.moto).toBeGreaterThanOrEqual(DEFAULT_FINANCING_RATES.auto);
	});
});

describe("compareWithFinancing — consórcio vs financiamento (bug #17)", () => {
	it("retorna delta de parcela e total entre as 2 modalidades", () => {
		const result = compareWithFinancing({
			creditValue: 900_000,
			termMonths: 240,
			category: "imovel",
			consorcioMonthlyPayment: 5_715,
			consorcioTotalCost: 1_140_750,
		});
		expect(result.consorcio.monthlyPayment).toBe(5_715);
		expect(result.financing.monthlyPayment).toBeGreaterThan(8_000);
		expect(result.diff.monthlyDelta).toBeLessThan(0); // consórcio < financiamento mensal
		expect(result.diff.totalDelta).toBeLessThan(0); // consórcio < financiamento total
		expect(result.financing.annualRate).toBe(DEFAULT_FINANCING_RATES.imovel);
		expect(result.disclaimer).toMatch(/estimativa|sem garantia|n[ãa]o garante/i);
	});

	it("permite override da taxa anual (não usa default)", () => {
		const result = compareWithFinancing({
			creditValue: 80_000,
			termMonths: 48,
			category: "auto",
			consorcioMonthlyPayment: 2_000,
			consorcioTotalCost: 96_000,
			annualRateOverride: 30,
		});
		expect(result.financing.annualRate).toBe(30);
	});

	it("para moto usa taxa default de moto (não de auto)", () => {
		const result = compareWithFinancing({
			creditValue: 25_000,
			termMonths: 48,
			category: "moto",
			consorcioMonthlyPayment: 700,
			consorcioTotalCost: 33_600,
		});
		expect(result.financing.annualRate).toBe(DEFAULT_FINANCING_RATES.moto);
	});
});

import { describe, expect, it } from "vitest";
import { computeScenarios } from "./scenarios";

describe("computeScenarios — 3 cenários de contemplação (bug #16)", () => {
	const baseInput = { creditValue: 900_000, termMonths: 200 };

	it("retorna exatamente 3 cenários: conservador, provavel, acelerado", () => {
		const result = computeScenarios(baseInput);
		expect(result).toHaveProperty("conservador");
		expect(result).toHaveProperty("provavel");
		expect(result).toHaveProperty("acelerado");
	});

	it("conservador: 0% lance, prazo = termMonths nominal", () => {
		const { conservador } = computeScenarios(baseInput);
		expect(conservador.lancePercent).toBe(0);
		expect(conservador.expectedTermMonths).toBe(200);
		expect(conservador.strategy).toMatch(/sem lance/i);
	});

	it("provavel: 20% lance, prazo menor que conservador", () => {
		const { provavel, conservador } = computeScenarios(baseInput);
		expect(provavel.lancePercent).toBe(20);
		expect(provavel.expectedTermMonths).toBeLessThan(conservador.expectedTermMonths);
		expect(provavel.strategy).toMatch(/lance parcial|20%/i);
	});

	it("acelerado: 30% lance, prazo menor que provavel", () => {
		const { acelerado, provavel } = computeScenarios(baseInput);
		expect(acelerado.lancePercent).toBeGreaterThanOrEqual(30);
		expect(acelerado.expectedTermMonths).toBeLessThan(provavel.expectedTermMonths);
		expect(acelerado.strategy).toMatch(/embutido|recursos pr[óo]prios/i);
	});

	it("ordem: conservador (mais tempo) > provavel > acelerado (menos tempo)", () => {
		const { conservador, provavel, acelerado } = computeScenarios(baseInput);
		expect(conservador.expectedTermMonths).toBeGreaterThan(provavel.expectedTermMonths);
		expect(provavel.expectedTermMonths).toBeGreaterThan(acelerado.expectedTermMonths);
	});

	it("todos os cenários têm disclaimer obrigatório de estimativa", () => {
		const result = computeScenarios(baseInput);
		for (const key of ["conservador", "provavel", "acelerado"] as const) {
			expect(result[key].disclaimer, `cenário ${key} sem disclaimer`).toMatch(
				/estimativa|n[ãa]o garante|sem garantia/i,
			);
		}
	});

	it("respeita prazo curto (termMonths=24)", () => {
		const { acelerado } = computeScenarios({ creditValue: 50_000, termMonths: 24 });
		expect(acelerado.expectedTermMonths).toBeGreaterThanOrEqual(1);
		expect(acelerado.expectedTermMonths).toBeLessThanOrEqual(24);
	});

	it("conservador: lanceValue e ownResourcesValue zerados", () => {
		const { conservador } = computeScenarios(baseInput);
		expect(conservador.lanceValue).toBe(0);
		expect(conservador.ownResourcesValue).toBe(0);
	});

	it("provavel: lanceValue = 20% do creditValue em R$, ownResources zerado", () => {
		const { provavel } = computeScenarios(baseInput);
		expect(provavel.lanceValue).toBe(180_000); // 20% de 900k
		expect(provavel.ownResourcesValue).toBe(0);
	});

	it("acelerado: lanceValue + ownResourcesValue > 0 (R$ tangível pra Bruna)", () => {
		const { acelerado } = computeScenarios(baseInput);
		expect(acelerado.lanceValue).toBe(270_000); // 30% de 900k
		expect(acelerado.ownResourcesValue).toBe(90_000); // 10% de 900k
	});
});

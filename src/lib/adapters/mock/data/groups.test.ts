import { describe, it, expect } from "vitest";
import groupsData from "./groups.json";

interface GroupSeed {
	category: string;
	creditValue: number;
	termMonths: number;
}

const groups = groupsData as unknown as GroupSeed[];

describe("groups.json — catálogo (bug #01 — categoria moto populada)", () => {
	it("tem ≥3 grupos categoria 'moto'", () => {
		const motoGroups = groups.filter((g) => g.category === "moto");
		expect(motoGroups.length).toBeGreaterThanOrEqual(3);
	});

	it("grupos moto têm crédito dentro da faixa típica (5k-100k)", () => {
		const motoGroups = groups.filter((g) => g.category === "moto");
		for (const g of motoGroups) {
			expect(g.creditValue).toBeGreaterThanOrEqual(5000);
			expect(g.creditValue).toBeLessThanOrEqual(100000);
		}
	});

	it("grupos moto têm prazo razoável (24-84 meses)", () => {
		const motoGroups = groups.filter((g) => g.category === "moto");
		for (const g of motoGroups) {
			expect(g.termMonths).toBeGreaterThanOrEqual(24);
			expect(g.termMonths).toBeLessThanOrEqual(84);
		}
	});

	it("preserva grupos existentes de imovel/auto/servicos (sem regressão)", () => {
		const imovelCount = groups.filter((g) => g.category === "imovel").length;
		const autoCount = groups.filter((g) => g.category === "auto").length;
		const servicosCount = groups.filter((g) => g.category === "servicos").length;
		expect(imovelCount).toBeGreaterThan(0);
		expect(autoCount).toBeGreaterThan(0);
		expect(servicosCount).toBeGreaterThan(0);
	});
});

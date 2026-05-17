import { describe, it, expect } from "vitest";
import { MockBeviAdapter } from "./mock-bevi-adapter";

const adapter = new MockBeviAdapter();

describe("MockBeviAdapter — parcela consistente entre searchGroups e simulateQuota (bug #11)", () => {
	it("golden path: Rodobens imóvel R$ 900k — parcela do comparativo == parcela do detalhamento (±R$1)", async () => {
		const results = await adapter.searchGroups({
			category: "imovel",
			creditMin: 900000,
			creditMax: 900000,
		});
		const rodobens = results.find((g) => g.administradora === "Rodobens");
		expect(rodobens, "grupo Rodobens imóvel R$ 900k deve existir no mock").toBeDefined();
		if (!rodobens) return;

		const sim = await adapter.simulateQuota({
			groupId: rodobens.id,
			creditValue: 900000,
		});

		expect(Math.abs(rodobens.monthlyPayment - sim.monthlyPayment)).toBeLessThanOrEqual(1);
	});

	it("edge case 1: todos os grupos do catálogo — searchGroups.monthlyPayment == simulateQuota.monthlyPayment (±R$1)", async () => {
		const categories = ["imovel", "auto", "servicos"] as const;
		const divergences: Array<{ id: string; search: number; sim: number; diff: number }> = [];

		for (const category of categories) {
			const groups = await adapter.searchGroups({ category });
			for (const g of groups) {
				const sim = await adapter.simulateQuota({
					groupId: g.id,
					creditValue: g.creditValue,
				});
				const diff = Math.abs(g.monthlyPayment - sim.monthlyPayment);
				if (diff > 1) {
					divergences.push({ id: g.id, search: g.monthlyPayment, sim: sim.monthlyPayment, diff });
				}
			}
		}

		expect(divergences, `grupos com divergência >R$1: ${JSON.stringify(divergences, null, 2)}`).toEqual([]);
	});

	it("edge case 2: categoria auto — também consistente", async () => {
		const results = await adapter.searchGroups({ category: "auto" });
		expect(results.length).toBeGreaterThan(0);
		for (const g of results.slice(0, 3)) {
			const sim = await adapter.simulateQuota({
				groupId: g.id,
				creditValue: g.creditValue,
			});
			expect(Math.abs(g.monthlyPayment - sim.monthlyPayment)).toBeLessThanOrEqual(1);
		}
	});

	it("determinismo: mesma chamada retorna o mesmo monthlyPayment", async () => {
		const a = await adapter.searchGroups({ category: "imovel" });
		const b = await adapter.searchGroups({ category: "imovel" });
		expect(a.map((g) => g.monthlyPayment)).toEqual(b.map((g) => g.monthlyPayment));
	});
});

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
		// Bv2-08 Parte A: cobre todas as 4 categorias (imovel, auto, moto, servicos).
		// 'moto' adicionada pra fechar gap apontado no round 2 do plano v1.
		const categories = ["imovel", "auto", "moto", "servicos"] as const;
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

	// Bv2-08 — cenário literal da Bruna: comparativo de admins -> detalhamento Rodobens
	// "Recebi o comparativo das adms, mas quando pedi mais detalhes apenas da Rodobens,
	//  os valores mudaram". Reproduz determinístico todas as faixas de crédito imóvel
	// e auto da Rodobens.
	it("Bv2-08: Rodobens — parcela do comparativo (searchGroups) bate com detalhamento (simulateQuota) em todas as faixas", async () => {
		const divergences: Array<{
			id: string;
			category: string;
			credit: number;
			search: number;
			sim: number;
			diff: number;
		}> = [];

		for (const category of ["imovel", "auto"] as const) {
			const groups = await adapter.searchGroups({ category });
			const rodobens = groups.filter((g) => g.administradora === "Rodobens");
			expect(rodobens.length, `Rodobens deve ter grupos em ${category}`).toBeGreaterThan(0);

			for (const g of rodobens) {
				const sim = await adapter.simulateQuota({ groupId: g.id, creditValue: g.creditValue });
				const diff = Math.abs(g.monthlyPayment - sim.monthlyPayment);
				if (diff > 1) {
					divergences.push({
						id: g.id,
						category,
						credit: g.creditValue,
						search: g.monthlyPayment,
						sim: sim.monthlyPayment,
						diff,
					});
				}
			}
		}

		expect(
			divergences,
			`Rodobens: parcelas divergentes entre comparativo e detalhamento:\n${JSON.stringify(divergences, null, 2)}`,
		).toEqual([]);
	});

	// Bv2-08 Parte B — usuário ajusta valor do crédito no detalhamento. Sim deve usar
	// o valor ajustado consistentemente; não deve "lembrar" do valor original do grupo.
	it("Bv2-08: ajuste de crédito no detalhamento — simulateQuota usa o valor enviado, não o nominal do grupo", async () => {
		const groups = await adapter.searchGroups({ category: "imovel" });
		const rodobens = groups.find((g) => g.administradora === "Rodobens");
		expect(rodobens).toBeDefined();
		if (!rodobens) return;

		// Pedir simulação com crédito 10% menor do que o nominal
		const adjustedCredit = Math.round(rodobens.creditValue * 0.9);
		const simNominal = await adapter.simulateQuota({
			groupId: rodobens.id,
			creditValue: rodobens.creditValue,
		});
		const simAdjusted = await adapter.simulateQuota({
			groupId: rodobens.id,
			creditValue: adjustedCredit,
		});

		// Crédito menor → parcela menor (todos componentes proporcionais)
		expect(simAdjusted.creditValue).toBe(adjustedCredit);
		expect(simAdjusted.monthlyPayment).toBeLessThan(simNominal.monthlyPayment);
		// Proporção aproximada (10% menor → ~10% menos parcela)
		const ratio = simAdjusted.monthlyPayment / simNominal.monthlyPayment;
		expect(ratio).toBeGreaterThan(0.85);
		expect(ratio).toBeLessThan(0.95);
	});
});

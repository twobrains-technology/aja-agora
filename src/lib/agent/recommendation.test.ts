import { describe, expect, it } from "vitest";
import type { AdministradoraAdapter, GroupSummary, SearchGroupsParams } from "@/lib/adapters/types";
import { recommendWithFallback } from "./recommendation";

const baseGroup: GroupSummary = {
	id: "g1",
	administradora: "A",
	category: "imovel",
	creditValue: 500000,
	monthlyPayment: 3000,
	adminFeePercent: 18,
	termMonths: 200,
	totalParticipants: 100,
	availableSlots: 10,
	contemplationRate: 5,
};

const mk = (id: string, creditValue: number): GroupSummary => ({
	...baseGroup,
	id,
	creditValue,
});

class FakeAdapter implements Partial<AdministradoraAdapter> {
	constructor(private readonly catalog: GroupSummary[]) {}

	async searchGroups(params: SearchGroupsParams): Promise<GroupSummary[]> {
		return this.catalog.filter(
			(g) =>
				g.category === params.category &&
				(params.creditMin === undefined || g.creditValue >= params.creditMin) &&
				(params.creditMax === undefined || g.creditValue <= params.creditMax),
		);
	}
}

describe("recommendWithFallback — ≥3 opções (bug #09)", () => {
	it("golden path: filtro estrito retorna 5 grupos → todos alternativa=false", async () => {
		const catalog = [
			mk("g1", 480000),
			mk("g2", 490000),
			mk("g3", 500000),
			mk("g4", 510000),
			mk("g5", 520000),
		];
		const adapter = new FakeAdapter(catalog) as unknown as AdministradoraAdapter;
		const result = await recommendWithFallback(adapter, {
			category: "imovel",
			creditMin: 480000,
			creditMax: 520000,
		});
		expect(result.groups.length).toBe(5);
		expect(result.groups.every((g) => g.alternativa === false)).toBe(true);
		expect(result.insufficientOptions).toBe(false);
		expect(result.expansionUsed).toBe(null);
	});

	it("fallback ±20%: filtro estrito retorna 2 → expande até atingir 3, marca alternativos", async () => {
		const catalog = [
			mk("g1", 480000),
			mk("g2", 500000),
			// Os que vão entrar via expansion (até +20% = 600000):
			mk("g3", 530000),
			mk("g4", 580000),
		];
		const adapter = new FakeAdapter(catalog) as unknown as AdministradoraAdapter;
		const result = await recommendWithFallback(adapter, {
			category: "imovel",
			creditMin: 480000,
			creditMax: 500000,
		});
		expect(result.groups.length).toBeGreaterThanOrEqual(3);
		const originals = result.groups.filter((g) => !g.alternativa);
		const alternatives = result.groups.filter((g) => g.alternativa);
		expect(originals.length).toBe(2);
		expect(alternatives.length).toBeGreaterThanOrEqual(1);
		expect(result.expansionUsed).toBe(0.2);
		// Originais primeiro
		expect(result.groups[0].alternativa).toBe(false);
		expect(result.groups[1].alternativa).toBe(false);
	});

	it("fallback ±50%: ±20% não basta, expande até ±50%", async () => {
		const catalog = [
			mk("g1", 500000),
			// Nada entre 500-600k. Próximos só com expansão de 50% (max 750000):
			mk("g2", 700000),
			mk("g3", 740000),
		];
		const adapter = new FakeAdapter(catalog) as unknown as AdministradoraAdapter;
		const result = await recommendWithFallback(adapter, {
			category: "imovel",
			creditMin: 500000,
			creditMax: 500000,
		});
		expect(result.groups.length).toBe(3);
		expect(result.expansionUsed).toBe(0.5);
		expect(result.insufficientOptions).toBe(false);
	});

	it("insufficientOptions: mesmo ±50% não atinge 3 → flag + retorna o que tem", async () => {
		const catalog = [mk("g1", 500000), mk("g2", 600000)];
		const adapter = new FakeAdapter(catalog) as unknown as AdministradoraAdapter;
		const result = await recommendWithFallback(adapter, {
			category: "imovel",
			creditMin: 500000,
			creditMax: 500000,
		});
		expect(result.groups.length).toBeLessThan(3);
		expect(result.insufficientOptions).toBe(true);
	});

	it("não duplica grupos quando expansão pega os mesmos", async () => {
		const catalog = [mk("g1", 500000), mk("g2", 510000), mk("g3", 550000)];
		const adapter = new FakeAdapter(catalog) as unknown as AdministradoraAdapter;
		const result = await recommendWithFallback(adapter, {
			category: "imovel",
			creditMin: 500000,
			creditMax: 510000,
		});
		const ids = result.groups.map((g) => g.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("originais sempre vêm antes dos alternativos na ordem", async () => {
		const catalog = [mk("g1", 490000), mk("g2", 510000), mk("g3", 600000)];
		const adapter = new FakeAdapter(catalog) as unknown as AdministradoraAdapter;
		const result = await recommendWithFallback(adapter, {
			category: "imovel",
			creditMin: 490000,
			creditMax: 510000,
		});
		const firstAltIndex = result.groups.findIndex((g) => g.alternativa);
		const lastOriginalIndex = (() => {
			let idx = -1;
			result.groups.forEach((g, i) => {
				if (!g.alternativa) idx = i;
			});
			return idx;
		})();
		if (firstAltIndex !== -1 && lastOriginalIndex !== -1) {
			expect(firstAltIndex).toBeGreaterThan(lastOriginalIndex);
		}
	});
});

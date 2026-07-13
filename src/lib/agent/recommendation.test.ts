import { describe, expect, it } from "vitest";
import type { AdministradoraAdapter, GroupSummary, SearchGroupsParams } from "@/lib/adapters/types";
import { rankGroups, recommendWithFallback, respectsNetCreditGuardrail } from "./recommendation";

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

// FIX-226 (D6 — docs/03-regras-calculo.md): sem guardrail, uma estratégia de
// lance embutido podia recomendar uma carta cujo netCredit fica ABAIXO do
// valor do bem — o cliente contempla mais rápido mas recebe dinheiro que não
// compra o que veio comprar. Invariante duro → CÓDIGO, não prompt.
describe("respectsNetCreditGuardrail — netCredit nunca abaixo do valor do bem (D6)", () => {
	it("netCredit > valorDoBem → true", () => {
		expect(respectsNetCreditGuardrail(200_000, 0.3, 120_000)).toBe(true);
	});

	it("netCredit < valorDoBem → false", () => {
		// 123_300 * (1-0.3) = 86_310 < 120_000
		expect(respectsNetCreditGuardrail(123_300, 0.3, 120_000)).toBe(false);
	});

	it("caso de borda: netCredit === valorDoBem → true", () => {
		// creditValue tal que creditValue*(1-0.3) === 120_000 exatamente
		const creditValue = 120_000 / 0.7;
		expect(respectsNetCreditGuardrail(creditValue, 0.3, 120_000)).toBe(true);
	});
});

describe("rankGroups — guardrail de crédito líquido reordena (nunca descarta) candidatas de embutido", () => {
	const bem = 120_000;

	const violaGuardrail: GroupSummary = {
		...baseGroup,
		id: "com-viola",
		creditValue: 123_300, // netCredit 30% = 86_310 < 120_000
		embeddedVariant: "com",
	};
	const respeitaGuardrail: GroupSummary = {
		...baseGroup,
		id: "com-respeita",
		creditValue: 200_000, // netCredit 30% = 140_000 >= 120_000
		embeddedVariant: "com",
	};

	it("hasLance + embutidoGuardrail: candidata que respeita vem ANTES da que viola", () => {
		const ranked = rankGroups([violaGuardrail, respeitaGuardrail], {
			budget: 3_000,
			desiredTermMonths: 0,
			hasLance: true,
			embutidoGuardrail: { valorDoBem: bem, maxEmbutidoPct: 0.3 },
		});
		expect(ranked[0].group.id).toBe("com-respeita");
		expect(ranked[1].group.id).toBe("com-viola");
	});

	it("nunca descarta a candidata que viola — só reordena", () => {
		const ranked = rankGroups([violaGuardrail, respeitaGuardrail], {
			budget: 3_000,
			desiredTermMonths: 0,
			hasLance: true,
			embutidoGuardrail: { valorDoBem: bem, maxEmbutidoPct: 0.3 },
		});
		expect(ranked.length).toBe(2);
		expect(ranked.some((r) => r.group.id === "com-viola")).toBe(true);
	});

	it("sem hasLance → guardrail não interfere na ordem (mesmo com embutidoGuardrail configurado)", () => {
		const semGuardrail = rankGroups([violaGuardrail, respeitaGuardrail], {
			budget: 3_000,
			desiredTermMonths: 0,
			hasLance: false,
			embutidoGuardrail: { valorDoBem: bem, maxEmbutidoPct: 0.3 },
		});
		const semConfig = rankGroups([violaGuardrail, respeitaGuardrail], {
			budget: 3_000,
			desiredTermMonths: 0,
		});
		expect(semGuardrail.map((r) => r.group.id)).toEqual(semConfig.map((r) => r.group.id));
	});

	it("candidatas 'sem' embutido nunca são afetadas pelo guardrail (ordem por score, não por netCredit)", () => {
		const semEmbutido: GroupSummary = {
			...baseGroup,
			id: "sem-embutido",
			creditValue: 100_000, // netCredit 30% = 70_000 < 120_000 — violaria SE fosse avaliada
			embeddedVariant: "sem",
		};
		// Mesmo score que respeitaGuardrail (mesmos monthlyPayment/contemplationRate/
		// adminFeePercent/termMonths do baseGroup) — sem o guardrail interferindo, a
		// ordem de saída preserva a ordem de entrada (empate estável).
		const ranked = rankGroups([semEmbutido, respeitaGuardrail], {
			budget: 3_000,
			desiredTermMonths: 0,
			hasLance: true,
			embutidoGuardrail: { valorDoBem: bem, maxEmbutidoPct: 0.3 },
		});
		expect(ranked.map((r) => r.group.id)).toEqual(["sem-embutido", "com-respeita"]);
	});
});

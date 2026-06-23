import { beforeEach, describe, expect, it, vi } from "vitest";
import okEmpty from "./__fixtures__/ok-selfcontract-empty.json";
import okSimulation from "./__fixtures__/ok-selfcontract-simulation.json";
import {
	BeviSelfContractAdapter,
	deriveSweepValues,
	IdentityNotCollectedError,
} from "./bevi-self-contract-adapter";
import type { BeviOffer } from "./offer-mapper";
import type { BeviSelfContractClient } from "./self-contract-client";

// Ofertas REAIS da captura (veiculo): ITAÚ 54832 / ÂNCORA 42000 / BB 50000
const REAL_OFFERS = (okSimulation as { data: { data: { offers: Array<Record<string, unknown>> } } })
	.data.data.offers;

type ClientMock = {
	createProposal: ReturnType<typeof vi.fn>;
	setSegment: ReturnType<typeof vi.fn>;
	simulate: ReturnType<typeof vi.fn>;
	getMultiProposal: ReturnType<typeof vi.fn>;
	getSegments: ReturnType<typeof vi.fn>;
};

function makeClient(): ClientMock {
	return {
		createProposal: vi.fn(async () => ({})),
		setSegment: vi.fn(async () => undefined),
		simulate: vi.fn(async () => REAL_OFFERS),
		getMultiProposal: vi.fn(async () => []),
		getSegments: vi.fn(async () => ["AUTOS", "IMOVEL"]),
	};
}

const IDENTITY = { cpf: "12345678900", celular: "62999887766" };

function makeAdapter(
	client: ClientMock,
	opts: {
		identity?: typeof IDENTITY | null;
		prefs?: { embeddedPercentage?: "30" | "50"; objective?: "FAST_APPROVAL" | "INVESTMENT" };
	} = {},
) {
	return new BeviSelfContractAdapter(client as unknown as BeviSelfContractClient, {
		getIdentity: async () => (opts.identity === undefined ? IDENTITY : opts.identity),
		getSimulationPrefs: async () => opts.prefs ?? { embeddedPercentage: "30" },
	});
}

describe("BeviSelfContractAdapter — descoberta real via Trilho B", () => {
	let client: ClientMock;

	beforeEach(() => {
		client = makeClient();
	});

	it("searchGroups cria proposta UMA vez, grava segmento e mapeia ofertas reais", async () => {
		const adapter = makeAdapter(client);
		const groups = await adapter.searchGroups({ category: "auto", creditMax: 50000 });

		expect(client.createProposal).toHaveBeenCalledTimes(1);
		expect(client.createProposal).toHaveBeenCalledWith(
			expect.objectContaining({ cpf: IDENTITY.cpf, celular: IDENTITY.celular }),
		);
		expect(client.setSegment).toHaveBeenCalledWith("AUTOS");
		expect(client.simulate).toHaveBeenCalledWith(
			expect.objectContaining({ simulationValue: 50000, embeddedPercentage: "30" }),
		);

		expect(groups).toHaveLength(3);
		const admins = groups.map((g) => g.administradora);
		expect(admins).toEqual(expect.arrayContaining(["ITAÚ", "ÂNCORA", "BANCO DO BRASIL"]));
		// nada de dado fictício: parcela e prazo vêm da oferta real
		for (const g of groups) {
			expect(g.monthlyPayment).toBeGreaterThan(0);
			expect(g.termMonths).toBeGreaterThan(0);
			expect(g.category).toBe("auto");
		}
	});

	it("searchGroups SEM identidade coletada lança IdentityNotCollectedError (nunca cai em mock)", async () => {
		const adapter = makeAdapter(client, { identity: null });
		await expect(
			adapter.searchGroups({ category: "auto", creditMax: 50000 }),
		).rejects.toBeInstanceOf(IdentityNotCollectedError);
		expect(client.createProposal).not.toHaveBeenCalled();
	});

	it("cache por (segmento, valor): segunda busca igual não re-chama a Bevi", async () => {
		const adapter = makeAdapter(client);
		await adapter.searchGroups({ category: "auto", creditMax: 50000 });
		await adapter.searchGroups({ category: "auto", creditMax: 50000 });
		expect(client.simulate).toHaveBeenCalledTimes(1);
		expect(client.createProposal).toHaveBeenCalledTimes(1);
	});

	it("busca com valor diferente re-simula (what-if Bv2-08)", async () => {
		const adapter = makeAdapter(client);
		await adapter.searchGroups({ category: "auto", creditMax: 50000 });
		await adapter.searchGroups({ category: "auto", creditMax: 80000 });
		expect(client.simulate).toHaveBeenCalledTimes(2);
		// proposta continua sendo UMA só
		expect(client.createProposal).toHaveBeenCalledTimes(1);
	});

	it("simulateQuota devolve breakdown real da oferta buscada (por quotaId)", async () => {
		const adapter = makeAdapter(client);
		const groups = await adapter.searchGroups({ category: "auto", creditMax: 50000 });
		const itau = groups.find((g) => g.administradora === "ITAÚ");
		expect(itau).toBeDefined();

		const sim = await adapter.simulateQuota({
			groupId: itau?.id ?? "",
			creditValue: itau?.creditValue ?? 0,
		});
		// valores da captura real do ITAÚ (finalValue 54832, adminFee 0.21, term 70)
		expect(sim.creditValue).toBe(54832);
		expect(sim.termMonths).toBe(70);
		expect(sim.adminFee).toBeCloseTo(54832 * 0.21, 0);
		expect(sim.embeddedBid.embeddedBidValue).toBeGreaterThan(0);
		expect(sim.embeddedBid.receivedCredit).toBeLessThan(sim.creditValue);
		expect(sim.expectedAdjustment.index).toBe("IPCA");
	});

	it("simulateQuota de groupId desconhecido lança erro claro (sem inventar número)", async () => {
		const adapter = makeAdapter(client);
		await adapter.searchGroups({ category: "auto", creditMax: 50000 });
		await expect(
			adapter.simulateQuota({ groupId: "nao-existe", creditValue: 50000 }),
		).rejects.toThrow(/oferta|grupo/i);
	});

	it("getGroupDetails mapeia próxima assembleia e dados reais do grupo", async () => {
		const adapter = makeAdapter(client);
		const groups = await adapter.searchGroups({ category: "auto", creditMax: 50000 });
		const details = await adapter.getGroupDetails({ groupId: groups[0].id });
		expect(details.administradora).toBe(groups[0].administradora);
		expect(details.nextAssembly).toMatch(/^\d{4}-\d{2}-\d{2}/);
		expect(details.groupNumber.length).toBeGreaterThan(0);
	});

	it("piso de crédito (offers vazio) devolve [] sem lançar", async () => {
		client.simulate = vi.fn(
			async () => (okEmpty as { data: { data: { offers: unknown[] } } }).data.data.offers,
		);
		const adapter = makeAdapter(client);
		const groups = await adapter.searchGroups({ category: "moto", creditMax: 15000 });
		expect(groups).toEqual([]);
	});

	it("getRates deriva taxas reais por administradora das ofertas em cache", async () => {
		const adapter = makeAdapter(client);
		await adapter.searchGroups({ category: "auto", creditMax: 50000 });
		const rates = await adapter.getRates({ category: "auto" });
		expect(rates.length).toBeGreaterThan(0);
		const itau = rates.find((r) => r.administradora === "ITAÚ");
		expect(itau?.adminFeePercent).toBe(21);
	});
});

// ════════════════════════════════════════════════════════════════════════════
// FIX-70 — Sweep sequencial multi-faixa na descoberta
// ════════════════════════════════════════════════════════════════════════════

/** Oferta mínima válida pro mapper (productType obrigatório → categoria). */
function makeOffer(quotaId: string, bank: string, value: number): BeviOffer {
	return {
		quotaId,
		bank,
		bankLabel: bank,
		group: `G-${quotaId}`,
		term: 60,
		finalValue: value,
		importedInstallmentValue: Math.round(value / 60),
		adminFee: 0.18,
		productType: "AUTOS",
		monthlyAwardedQuotas: 2,
	};
}

describe("deriveSweepValues — política de faixas derivadas do alvo (FIX-70)", () => {
	it("alvo primeiro + vizinhas ±30% arredondadas a passo redondo", () => {
		expect(deriveSweepValues(100000)).toEqual([100000, 70000, 130000]);
	});

	it("descarta vizinha abaixo do piso de crédito (15k)", () => {
		// 16000×0.7=11200 → 10k (< piso) descartado; 16000×1.3=20800 → 20k mantém
		expect(deriveSweepValues(16000)).toEqual([16000, 20000]);
	});

	it("deduplica vizinha que arredonda pro mesmo valor do alvo", () => {
		// 95000 → 100000 (== alvo, dup) descartado; 105000 → 110000 mantém
		expect(deriveSweepValues(100000, { spread: [0.95, 1, 1.05] })).toEqual([100000, 110000]);
	});
});

describe("BeviSelfContractAdapter — sweep multi-faixa (FIX-70)", () => {
	/** Client cujo simulate devolve ofertas DISTINTAS por faixa de valor. */
	function makeBandClient(
		overrides: Partial<Record<number, () => Promise<BeviOffer[]>>> = {},
	): ClientMock {
		const byValue: Record<number, BeviOffer[]> = {
			100000: [makeOffer("q-alvo-itau", "ITAÚ", 100000)],
			70000: [makeOffer("q-baixa-bb", "BANCO DO BRASIL", 70000)],
			130000: [makeOffer("q-alta-anc", "ÂNCORA", 130000)],
		};
		return {
			createProposal: vi.fn(async () => ({})),
			setSegment: vi.fn(async () => undefined),
			simulate: vi.fn(async ({ simulationValue }: { simulationValue: number }) => {
				const o = overrides[simulationValue];
				if (o) return o();
				return byValue[simulationValue] ?? [];
			}),
			getMultiProposal: vi.fn(async () => []),
			getSegments: vi.fn(async () => ["AUTOS", "IMOVEL"]),
		};
	}

	function makeBandAdapter(client: ClientMock) {
		return new BeviSelfContractAdapter(
			client as unknown as BeviSelfContractClient,
			{
				getIdentity: async () => IDENTITY,
				getSimulationPrefs: async () => ({ embeddedPercentage: "30" }),
			},
			// gap 0 nos testes pra não esperar 400ms entre faixas.
			{ gapMs: 0 },
		);
	}

	it("sweep=true varre 3 faixas e acumula a UNIÃO das ofertas (alvo primeiro)", async () => {
		const client = makeBandClient();
		const adapter = makeBandAdapter(client);

		const groups = await adapter.searchGroups({ category: "auto", creditMax: 100000, sweep: true });

		// 3 faixas → 3 simulações; proposta/segmento uma vez só (stateful, cookbook §3)
		expect(client.simulate).toHaveBeenCalledTimes(3);
		expect(client.createProposal).toHaveBeenCalledTimes(1);
		expect(client.setSegment).toHaveBeenCalledTimes(1);

		// união das 3 faixas, faixa-alvo primeiro
		expect(groups).toHaveLength(3);
		expect(groups[0].administradora).toBe("ITAÚ"); // alvo primeiro
		expect(groups.map((g) => g.administradora)).toEqual(
			expect.arrayContaining(["ITAÚ", "BANCO DO BRASIL", "ÂNCORA"]),
		);

		// oferta de uma faixa VIZINHA ficou indexada → simulateQuota a acha (O(1))
		const sim = await adapter.simulateQuota({ groupId: "q-alta-anc", creditValue: 130000 });
		expect(sim.creditValue).toBe(130000);
	});

	it("sem sweep mantém comportamento single-faixa (1 simulação)", async () => {
		const client = makeBandClient();
		const adapter = makeBandAdapter(client);
		const groups = await adapter.searchGroups({ category: "auto", creditMax: 100000 });
		expect(client.simulate).toHaveBeenCalledTimes(1);
		expect(groups).toHaveLength(1);
		expect(groups[0].administradora).toBe("ITAÚ");
	});

	it("faixa vazia (piso) é pulada sem quebrar — demais faixas entram", async () => {
		// vizinha de baixo volta vazia (abaixo do piso real do segmento)
		const client = makeBandClient({ 70000: async () => [] });
		const adapter = makeBandAdapter(client);

		const groups = await adapter.searchGroups({ category: "auto", creditMax: 100000, sweep: true });

		expect(client.simulate).toHaveBeenCalledTimes(3); // tentou as 3
		expect(groups).toHaveLength(2); // alvo + vizinha de cima (a vazia não contribui)
		expect(groups.map((g) => g.administradora)).toEqual(expect.arrayContaining(["ITAÚ", "ÂNCORA"]));
	});

	it("circuit breaker: erro numa vizinha PARA o sweep e devolve o que já tem (sem lançar)", async () => {
		// ordem das faixas: [100000 alvo, 70000 vizinha1, 130000 vizinha2]
		// a vizinha1 (70000) falha → sweep para, vizinha2 (130000) NÃO é tentada.
		const client = makeBandClient({
			70000: async () => {
				throw Object.assign(new Error("Too Many Requests"), { code: 429 });
			},
		});
		const adapter = makeBandAdapter(client);

		const groups = await adapter.searchGroups({ category: "auto", creditMax: 100000, sweep: true });

		// alvo (100000) + vizinha1 (70000, falhou) tentadas; vizinha2 (130000) NÃO
		expect(client.simulate).toHaveBeenCalledTimes(2);
		const simulatedValues = client.simulate.mock.calls.map((c) => c[0].simulationValue);
		expect(simulatedValues).toEqual([100000, 70000]);
		// devolve só a faixa-alvo, sem lançar
		expect(groups).toHaveLength(1);
		expect(groups[0].administradora).toBe("ITAÚ");
	});

	it("falha NA FAIXA-ALVO propaga (erro real de descoberta, não é vizinha)", async () => {
		const client = makeBandClient({
			100000: async () => {
				throw new Error("Bevi indisponível");
			},
		});
		const adapter = makeBandAdapter(client);
		await expect(
			adapter.searchGroups({ category: "auto", creditMax: 100000, sweep: true }),
		).rejects.toThrow(/indispon/i);
		// faixa-alvo falhou logo de cara — não segue varrendo vizinhas
		expect(client.simulate).toHaveBeenCalledTimes(1);
	});
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import okEmpty from "./__fixtures__/ok-selfcontract-empty.json";
import okSimulation from "./__fixtures__/ok-selfcontract-simulation.json";
import { BeviSelfContractAdapter, IdentityNotCollectedError } from "./bevi-self-contract-adapter";
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

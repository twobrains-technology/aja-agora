import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import errDuplicated from "./__fixtures__/err-selfcontract-duplicated.json";
import okCreate from "./__fixtures__/ok-selfcontract-create.json";
import okEmpty from "./__fixtures__/ok-selfcontract-empty.json";
import okMulti from "./__fixtures__/ok-selfcontract-multiproposal.json";
import okSegments from "./__fixtures__/ok-selfcontract-segments.json";
import okSimulation from "./__fixtures__/ok-selfcontract-simulation.json";
import { DuplicatedProposalError } from "./bevi-errors";
import { BeviSelfContractClient, loadSelfContractConfigFromEnv } from "./self-contract-client";

const CONFIG = {
	baseUrl: "https://selfcontract.test",
	storeHash: "hash-teste-123",
};

// ── Proteção: sem hash da loja no env, falha alto (criar proposta = dado real) ──
describe("BeviSelfContractClient — proteção de config", () => {
	const prev = process.env.BEVI_SELFCONTRACT_HASH;
	beforeEach(() => {
		// biome-ignore lint/performance/noDelete: precisamos remover a chave
		delete process.env.BEVI_SELFCONTRACT_HASH;
	});
	afterEach(() => {
		if (prev === undefined) delete process.env.BEVI_SELFCONTRACT_HASH;
		else process.env.BEVI_SELFCONTRACT_HASH = prev;
	});

	it("loadSelfContractConfigFromEnv lança sem BEVI_SELFCONTRACT_HASH", () => {
		expect(() => loadSelfContractConfigFromEnv()).toThrow(/BEVI_SELFCONTRACT_HASH/);
	});

	it("constrói com config explícita", () => {
		expect(new BeviSelfContractClient(CONFIG)).toBeInstanceOf(BeviSelfContractClient);
	});
});

// ── Contract contra os shapes REAIS capturados (cookbook bevi-api-requests.md) ──
describe("BeviSelfContractClient — contract contra capturas reais", () => {
	let calls: Array<{ url: string; init: RequestInit }>;
	let client: BeviSelfContractClient;

	function mockFetchSequence(...payloads: unknown[]) {
		const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
			calls.push({ url, init });
			return { json: async () => payloads.shift() } as Response;
		});
		globalThis.fetch = fetchMock as typeof fetch;
		return fetchMock;
	}
	const lastBody = (): Record<string, unknown> => JSON.parse(calls.at(-1)?.init.body as string);

	beforeEach(() => {
		calls = [];
		client = new BeviSelfContractClient(CONFIG);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("getSegments faz GET em /segment-resource e parseia segmentResource", async () => {
		mockFetchSequence(okSegments);
		const segments = await client.getSegments();
		expect(calls[0].url).toBe(
			"https://selfcontract.test/unauth/product-self-contract/hash-teste-123/segment-resource",
		);
		expect(calls[0].init.method).toBe("GET");
		expect(segments).toContain("AUTOS");
		expect(segments).toContain("IMOVEL");
		expect(segments).toHaveLength(6);
	});

	it("getMultiProposal faz GET com CPF só-dígitos e devolve o ARRAY cru (sem envelope)", async () => {
		mockFetchSequence(okMulti);
		const proposals = await client.getMultiProposal("123.456.789-00");
		expect(calls[0].url).toBe(
			"https://selfcontract.test/unauth/product-self-contract/hash-teste-123/get-multi-proposal/12345678900",
		);
		expect(proposals).toHaveLength(1);
		expect(proposals[0].status.systemicValue).toBe("waitingForUniqueCode");
	});

	it("createProposal envia POST com cpf/celular só-dígitos, LGPD e ignoreOngoingProposals", async () => {
		mockFetchSequence(okCreate);
		await client.createProposal({ cpf: "123.456.789-00", celular: "(62) 99988-7766" });
		expect(calls[0].url).toBe(
			"https://selfcontract.test/unauth/product-self-contract/create-proposal/hash-teste-123",
		);
		expect(calls[0].init.method).toBe("POST");
		expect(lastBody()).toMatchObject({
			cpf: "12345678900",
			celular: "62999887766",
			lgpd: { aceite: true },
			consultarDados: true,
			ignoreOngoingProposals: true,
		});
	});

	it("createProposal com 400 Duplicated Hash lança DuplicatedProposalError", async () => {
		mockFetchSequence(errDuplicated);
		await expect(
			client.createProposal({ cpf: "12345678900", celular: "62999887766" }),
		).rejects.toBeInstanceOf(DuplicatedProposalError);
	});

	it("setSegment faz PATCH no step oQueVocePretendeAdquirir com productType", async () => {
		mockFetchSequence(okCreate);
		await client.setSegment("AUTOS");
		expect(calls[0].url).toBe(
			"https://selfcontract.test/unauth/product-self-contract/update-step/hash-teste-123/step/oQueVocePretendeAdquirir",
		);
		expect(calls[0].init.method).toBe("PATCH");
		expect(lastBody()).toEqual({ productType: "AUTOS" });
	});

	it("simulate faz PATCH no step simulation e devolve offers[] reais (data.data.offers)", async () => {
		mockFetchSequence(okSimulation);
		const offers = await client.simulate({
			simulationValue: 50000,
			embeddedPercentage: "30",
		});
		expect(calls[0].url).toBe(
			"https://selfcontract.test/unauth/product-self-contract/update-step/hash-teste-123/step/simulation",
		);
		expect(lastBody()).toMatchObject({
			simulationType: "TOTAL_VALUE",
			simulationValue: 50000,
			objective: "FAST_APPROVAL",
			embeddedPercentage: "30",
		});
		expect(offers).toHaveLength(3);
		// administradoras REAIS da captura — nunca "Consorcio Estrela" fictício
		expect(offers.map((o) => o.bankLabel)).toEqual(
			expect.arrayContaining(["ITAÚ", "ÂNCORA", "BANCO DO BRASIL"]),
		);
		expect(offers[0].term).toBeGreaterThan(0);
		expect(offers[0].adminFee).toBeGreaterThan(0);
	});

	it("simulate sem embeddedPercentage omite o campo (sem chutar default escondido)", async () => {
		mockFetchSequence(okSimulation);
		await client.simulate({ simulationValue: 50000 });
		expect(lastBody()).not.toHaveProperty("embeddedPercentage");
	});

	it("simulate com piso de crédito (200 + offers vazio) devolve [] sem lançar", async () => {
		mockFetchSequence(okEmpty);
		const offers = await client.simulate({ simulationValue: 15000 });
		expect(offers).toEqual([]);
	});

	it("simulate re-tenta o 404 transitório do step (cookbook §5b) e sucede", async () => {
		const transient404 = {
			status: "NOT_FOUND",
			code: 404,
			success: false,
			message: "Step não encontrado",
		};
		mockFetchSequence(transient404, okSimulation);
		const offers = await client.simulate({ simulationValue: 50000 });
		expect(offers).toHaveLength(3);
		expect(calls).toHaveLength(2);
	});
});

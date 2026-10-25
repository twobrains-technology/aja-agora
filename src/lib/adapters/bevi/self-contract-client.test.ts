import { afterEach, describe, expect, it, vi } from "vitest";
import { DuplicatedProposalError } from "./bevi-errors";
import { BeviSelfContractClient } from "./self-contract-client";

// R5.3 — a busca de cartas (trilho B) chamava POST create-proposal a cada turno e
// a Bevi respondia 400 "Duplicated Hash", custando 2–5 s por busca. O adapter
// nasce por turno (`proposalReady` não atravessa turnos), então a memória do
// "já existe proposta pra este hash" tem de viver no processo — no client.

const duplicatedFixture = {
	status: "BAD_REQUEST",
	code: 400,
	success: false,
	message: "Duplicated Hash: 6a1756d4bef180c41e909c07",
};

const storeHashUnico = (sufixo: string) => `loja-${sufixo}-${Date.now()}-${Math.random()}`;

function mockFetch(respostas: Array<{ status: number; body: unknown }>) {
	const chamadas: Array<{ url: string; method: string }> = [];
	const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
		chamadas.push({ url: String(url), method: init?.method ?? "GET" });
		const r = respostas[Math.min(chamadas.length - 1, respostas.length - 1)];
		return new Response(JSON.stringify(r.body), {
			status: r.status,
			headers: { "Content-Type": "application/json" },
		});
	});
	vi.stubGlobal("fetch", fetchMock);
	return {
		chamadas,
		criacoes: () => chamadas.filter((c) => c.url.includes("create-proposal")).length,
	};
}

const clienteDe = (storeHash: string) =>
	new BeviSelfContractClient({ baseUrl: "https://bevi.test", storeHash });

const identidade = { cpf: "123.456.789-09", celular: "(11) 99999-8888" };

describe("create-proposal no trilho B não repete o POST já duplicado", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("duas buscas iguais = no máximo UM create (a segunda nem toca a rede)", async () => {
		const storeHash = storeHashUnico("duas-buscas");
		const { criacoes } = mockFetch([{ status: 400, body: duplicatedFixture }]);

		// Cada turno monta um adapter/client novo — é o cenário real da busca.
		await expect(clienteDe(storeHash).createProposal(identidade)).rejects.toBeInstanceOf(
			DuplicatedProposalError,
		);
		await expect(clienteDe(storeHash).createProposal(identidade)).rejects.toBeInstanceOf(
			DuplicatedProposalError,
		);

		expect(criacoes()).toBe(1);
	});

	it("a resposta memorizada é o MESMO sinal tipado (o fecho depende dele), sem retry nem espera", async () => {
		const storeHash = storeHashUnico("sinal");
		const { criacoes } = mockFetch([{ status: 400, body: duplicatedFixture }]);
		const client = clienteDe(storeHash);

		await expect(client.createProposal(identidade)).rejects.toBeInstanceOf(DuplicatedProposalError);

		const inicio = Date.now();
		const erro = await client.createProposal(identidade).catch((e: unknown) => e);
		const decorrido = Date.now() - inicio;

		expect(erro).toBeInstanceOf(DuplicatedProposalError);
		expect((erro as DuplicatedProposalError).message).toContain("Duplicated Hash");
		expect((erro as DuplicatedProposalError).code).toBe(400);
		// Uma única ida à rede na primeira vez (o write-conflict retentaria 4×)…
		expect(criacoes()).toBe(1);
		// …e a segunda é memória pura, não uma espera.
		expect(decorrido).toBeLessThan(50);
	});

	it("CPF diferente no mesmo hash continua indo à rede (a memória é por identidade)", async () => {
		const storeHash = storeHashUnico("outro-cpf");
		const { criacoes } = mockFetch([
			{ status: 400, body: duplicatedFixture },
			{ status: 201, body: { status: "CREATED", code: 201, success: true, data: {} } },
		]);
		const client = clienteDe(storeHash);

		await expect(client.createProposal(identidade)).rejects.toBeInstanceOf(DuplicatedProposalError);
		await expect(
			client.createProposal({ cpf: "987.654.321-00", celular: "(11) 98888-7777" }),
		).resolves.toBeDefined();

		expect(criacoes()).toBe(2);
	});

	it("falha de verdade não é memorizada: o próximo turno tenta criar de novo", async () => {
		const storeHash = storeHashUnico("falha-real");
		const { criacoes } = mockFetch([
			{
				status: 200,
				body: { status: "INTERNAL", code: 500, success: false, message: "boom" },
			},
			{ status: 201, body: { status: "CREATED", code: 201, success: true, data: {} } },
		]);
		const client = clienteDe(storeHash);

		await expect(client.createProposal(identidade)).rejects.toThrow(/boom/);
		await expect(client.createProposal(identidade)).resolves.toBeDefined();

		expect(criacoes()).toBe(2);
	});
});

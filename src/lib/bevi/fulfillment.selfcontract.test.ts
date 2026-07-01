import { beforeEach, describe, expect, it, vi } from "vitest";
import errDuplicated from "../adapters/bevi/__fixtures__/err-selfcontract-duplicated.json";
import okChoose from "../adapters/bevi/__fixtures__/ok-selfcontract-choose.json";
import okFinalize from "../adapters/bevi/__fixtures__/ok-selfcontract-finalize.json";
import okSegments from "../adapters/bevi/__fixtures__/ok-selfcontract-segments.json";
import okSimulation from "../adapters/bevi/__fixtures__/ok-selfcontract-simulation.json";
import okSystem from "../adapters/bevi/__fixtures__/ok-selfcontract-system.json";
import { BeviSelfContractProposalGateway } from "../adapters/bevi/bevi-self-contract-proposal-gateway";
import { BeviSelfContractClient } from "../adapters/bevi/self-contract-client";

// Mock do repo (DB) — mesmo padrão de fulfillment.test.ts (guarda em memória).
const { store } = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));
vi.mock("./proposal-repo", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./proposal-repo")>();
	return {
		...actual,
		createBeviProposal: vi.fn(async (conversationId: string, snap: Record<string, unknown>) => {
			const row = { id: `row-${conversationId}`, conversationId, ...snap };
			store.set(conversationId, row);
			return row;
		}),
		getLatestBeviProposal: vi.fn(
			async (conversationId: string) => store.get(conversationId) ?? null,
		),
		updateBeviProposal: vi.fn(async (id: string, patch: Record<string, unknown>) => {
			for (const r of store.values()) if (r.id === id) Object.assign(r, patch);
		}),
	};
});

import { confirmOffer, startContract, uploadContractDocument } from "./fulfillment";

const CONFIG = { baseUrl: "https://selfcontract.test", storeHash: "hash-teste-123" };

const input = {
	cpf: "12345678909",
	celular: "11999998888",
	lgpd: true,
	segmento: "AUTOS",
	objetivo: "contemplacao_rapida" as const,
	valor: 50000,
};

beforeEach(() => store.clear());

// FIX-89 — fechamento via Trilho B de ponta a ponta: reusa a proposta de
// descoberta (Duplicated Hash tratado como retomada), finaliza e devolve
// proposalNumber. Doc: docs/correcoes/decisions/2026-06-28-bloco-c-fechamento-trilho-b.md
describe("fulfillment — passo 5 Contratar via Trilho B (self-contract)", () => {
	function mockFetchSequence(...payloads: unknown[]) {
		const fetchMock = vi.fn(async () => ({ json: async () => payloads.shift() }) as Response);
		globalThis.fetch = fetchMock as typeof fetch;
		return fetchMock;
	}

	it("startContract REUSA a proposta ativa (Duplicated Hash) — não cria proposta nova", async () => {
		mockFetchSequence(errDuplicated, okSystem, okSegments, okSimulation);
		const gw = new BeviSelfContractProposalGateway(new BeviSelfContractClient(CONFIG));
		const createSpy = vi.spyOn(gw, "createProposal");

		const r = await startContract("conv-sc-1", input, gw);
		expect(createSpy).toHaveBeenCalledTimes(1); // chamado, mas RETOMA (Duplicated Hash)
		expect(r.proposalId).toBe("6a1f9a2ecf5174e43aa4b201"); // resolvido via /system, não um id novo
		expect(r.offer).toBeTruthy();
	});

	it("confirmOffer chama finalize() e devolve proposalNumber; sem consortiumProposalLink", async () => {
		mockFetchSequence(errDuplicated, okSystem, okSegments, okSimulation, okChoose, okFinalize);
		const gw = new BeviSelfContractProposalGateway(new BeviSelfContractClient(CONFIG));

		await startContract("conv-sc-2", input, gw);
		const c = await confirmOffer("conv-sc-2", gw);

		expect(c.consortiumProposalLink).toBe(""); // D2: sentinel vazio, sem uselink.me
		expect(c.proposalNumber).toBe(24165747); // D3: finalize() opcional devolveu o nº
	});

	it("uploadContractDocument funciona mesmo com links vazios (guarda relaxada) e não bate na rede (delega ao stub)", async () => {
		const fetchMock = mockFetchSequence(
			errDuplicated,
			okSystem,
			okSegments,
			okSimulation,
			okChoose,
			okFinalize,
		);
		const gw = new BeviSelfContractProposalGateway(new BeviSelfContractClient(CONFIG));

		await startContract("conv-sc-3", input, gw);
		await confirmOffer("conv-sc-3", gw);
		fetchMock.mockClear();

		const up = await uploadContractDocument(
			"conv-sc-3",
			{
				slot: "identidade_frente",
				file: new Uint8Array([1]),
				filename: "rg.jpg",
				mimeType: "image/jpeg",
			},
			gw,
		);
		expect(up.ok).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled(); // stub do bloco-a, sem chamada de rede
	});
});

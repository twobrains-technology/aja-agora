import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import errDuplicated from "./__fixtures__/err-selfcontract-duplicated.json";
import okChoose from "./__fixtures__/ok-selfcontract-choose.json";
import okCreate from "./__fixtures__/ok-selfcontract-create.json";
import okFinalize from "./__fixtures__/ok-selfcontract-finalize.json";
import okSegments from "./__fixtures__/ok-selfcontract-segments.json";
import okSimulation from "./__fixtures__/ok-selfcontract-simulation.json";
import okSystem from "./__fixtures__/ok-selfcontract-system.json";
import { BeviSelfContractProposalGateway } from "./bevi-self-contract-proposal-gateway";
import { BeviSelfContractClient } from "./self-contract-client";

const CONFIG = { baseUrl: "https://selfcontract.test", storeHash: "hash-teste-123" };

describe("BeviSelfContractProposalGateway", () => {
	let calls: Array<{ url: string; init: RequestInit }>;
	let gateway: BeviSelfContractProposalGateway;

	function mockFetchSequence(...payloads: unknown[]) {
		const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
			calls.push({ url, init });
			return { json: async () => payloads.shift() } as Response;
		});
		globalThis.fetch = fetchMock as typeof fetch;
		return fetchMock;
	}

	beforeEach(() => {
		calls = [];
		gateway = new BeviSelfContractProposalGateway(new BeviSelfContractClient(CONFIG));
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── Camada 1 — estrutural: implementa o contrato inteiro (8 + finalize) ──
	it("implementa todos os métodos do ProposalGateway + finalize", () => {
		for (const method of [
			"createProposal",
			"listSegments",
			"simulate",
			"chooseOffer",
			"getDocumentLinks",
			"uploadDocument",
			"insertAdditionalData",
			"getStatus",
			"finalize",
		]) {
			expect(typeof (gateway as unknown as Record<string, unknown>)[method]).toBe("function");
		}
	});

	// ── Integration (contract) — fluxo completo com fixtures self-contract ──
	it("createProposal→simulate→chooseOffer→finalize roda e devolve proposalNumber", async () => {
		// ordem real de chamadas HTTP: createProposal, getSystemState (resolve
		// proposalId), getSegments, setSegment (ack — ignorado), simulate,
		// chooseOffer (finished:true), finalize (waitingForUniqueCode).
		mockFetchSequence(okCreate, okSystem, okSegments, okCreate, okSimulation, okChoose, okFinalize);

		const created = await gateway.createProposal({
			cpf: "12345678900",
			celular: "62999887766",
			termoLgpd: true,
			consultaDados: true,
		});
		expect(created.proposalId).toBe("6a1f9a2ecf5174e43aa4b201");

		const segs = await gateway.listSegments(created.proposalId);
		expect(segs.map((s) => s.segmento)).toContain("AUTOS");

		const sim = await gateway.simulate({
			proposalId: created.proposalId,
			segmento: "AUTOS",
			tipoSimulacao: "valor_total",
			valor: 50000,
			objetivo: "contemplacao_rapida",
		});
		expect(sim.offers.length).toBeGreaterThan(0);
		expect(sim.offers[0]).toHaveProperty("ofertaId");
		expect(sim.offers[0]).toHaveProperty("valorCarta");

		const chosen = sim.offers[0];
		const choose = await gateway.chooseOffer({
			proposalId: created.proposalId,
			ofertaId: chosen.ofertaId,
		});
		// D2: sentinel vazio — self-contract não produz link (fecha inline)
		expect(choose.consortiumProposalLink).toBe("");
		expect(choose.proposalId).toBe(created.proposalId);

		const finalized = await gateway.finalize?.(created.proposalId);
		expect(finalized?.proposalNumber).toBe(24165747);

		// chooseOffer reenviou os MESMOS params da simulação + finished:true + a oferta
		const chooseCallBody = calls[5].init.body ? JSON.parse(calls[5].init.body as string) : {};
		expect(chooseCallBody.finished).toBe(true);
		expect(chooseCallBody.simulationValue).toBe(50000);
		expect(chooseCallBody.offer).toBeTruthy();
	});

	it("createProposal com Duplicated Hash (proposta já ativa) RETOMA — resolve o proposalId via /system", async () => {
		mockFetchSequence(errDuplicated, okSystem);
		const created = await gateway.createProposal({
			cpf: "12345678900",
			celular: "62999887766",
			termoLgpd: true,
			consultaDados: true,
		});
		expect(created.proposalId).toBe("6a1f9a2ecf5174e43aa4b201");
		expect(calls).toHaveLength(2); // create-proposal (400) + /system (resolve)
	});

	it("chooseOffer sem simulate() prévio lança erro claro (sem oferta cacheada)", async () => {
		await expect(
			gateway.chooseOffer({ proposalId: "P1", ofertaId: "inexistente" }),
		).rejects.toThrow(/não encontrada|não simulad/i);
	});

	it("getDocumentLinks devolve links vazios (self-contract não usa uselink.me)", async () => {
		const links = await gateway.getDocumentLinks("P1");
		expect(links.linkDocumentosPessoais).toBe("");
		expect(links.linkComprovanteEndereco).toBe("");
	});

	it("uploadDocument NÃO chama a rede (delega ao stub de despacho — upload self-contract é PENDENTE-KAIRO)", async () => {
		const fetchMock = mockFetchSequence();
		await gateway.uploadDocument({
			proposalId: "P1",
			documentsLink: "",
			slot: "identidade_frente",
			file: new Uint8Array([1]),
			filename: "rg.jpg",
			mimeType: "image/jpeg",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("getStatus ignora o proposalId passado e lê o estado corrente via /system (self-contract é por hash)", async () => {
		mockFetchSequence(okSystem);
		const status = await gateway.getStatus("qualquer-id-antigo");
		expect(status.proposalId).toBe("6a1f9a2ecf5174e43aa4b201");
		expect(status.situation).toBe("pending");
	});
});

// ── STUB local do dispatch (bloco-a, FIX-84) — contrato exato ──
describe("dispatchClientDocument (STUB local — TODO(bloco-a))", () => {
	it("devolve status pending pro target bevi_b (mesmo comportamento documentado pro bloco-a real)", async () => {
		const { dispatchClientDocument } = await import("./bevi-self-contract-proposal-gateway");
		const result = await dispatchClientDocument("doc-1", "bevi_b");
		expect(result).toEqual({ documentId: "doc-1", target: "bevi_b", status: "pending" });
	});
});

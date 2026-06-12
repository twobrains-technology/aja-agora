import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import err400 from "./__fixtures__/err-400-valor.json";
import err409 from "./__fixtures__/err-409-ongoing.json";
import okChoose from "./__fixtures__/ok-choose.json";
import okDoclinks from "./__fixtures__/ok-doclinks.json";
import okInsert from "./__fixtures__/ok-insert.json";
import okSegments from "./__fixtures__/ok-segments.json";
import okSimulation from "./__fixtures__/ok-simulation.json";
import okStatus from "./__fixtures__/ok-status.json";
import { BeviApiAdapter, loadBeviConfigFromEnv } from "./bevi-api-adapter";
import { MinCreditError, OngoingProposalError } from "./bevi-errors";

const CONFIG = {
	baseUrl: "https://api.test/services",
	apiToken: "test-token",
	productId: "prod-123",
};

// ── Camada 1: proteção contra hit acidental em produção do parceiro ──
describe("BeviApiAdapter — proteção de token", () => {
	const prevToken = process.env.BEVI_API_TOKEN;
	const prevBase = process.env.BEVI_BASE_URL;
	const prevProduct = process.env.BEVI_PRODUCT_ID;
	beforeEach(() => {
		// biome-ignore lint/performance/noDelete: precisamos remover a chave
		delete process.env.BEVI_API_TOKEN;
		// biome-ignore lint/performance/noDelete: precisamos remover a chave
		delete process.env.BEVI_BASE_URL;
		// biome-ignore lint/performance/noDelete: precisamos remover a chave
		delete process.env.BEVI_PRODUCT_ID;
	});
	afterEach(() => {
		if (prevToken === undefined) delete process.env.BEVI_API_TOKEN;
		else process.env.BEVI_API_TOKEN = prevToken;
		if (prevBase === undefined) delete process.env.BEVI_BASE_URL;
		else process.env.BEVI_BASE_URL = prevBase;
		if (prevProduct === undefined) delete process.env.BEVI_PRODUCT_ID;
		else process.env.BEVI_PRODUCT_ID = prevProduct;
	});

	it("loadBeviConfigFromEnv lança sem BEVI_API_TOKEN", () => {
		expect(() => loadBeviConfigFromEnv()).toThrow(/token/i);
	});

	// BUG-BEVI-EMPTY-ENV (2026-06-04): docker-compose injeta `${BEVI_BASE_URL:-}` =
	// string vazia, e `??` não cai no default com "" — baseUrl "" quebraria o
	// fechamento (passo 5) no container com TypeError Invalid URL. Mesma classe
	// do bug do Trilho B (self-contract-client).
	it("BEVI_BASE_URL/BEVI_PRODUCT_ID vazios (compose ${VAR:-}) caem nos defaults", () => {
		process.env.BEVI_API_TOKEN = "token-teste";
		process.env.BEVI_BASE_URL = "";
		process.env.BEVI_PRODUCT_ID = "";
		const config = loadBeviConfigFromEnv();
		expect(config.baseUrl).toBe("https://api.uxvision.tech/api/v1/credithub/services");
		expect(config.productId).toBe("6986245b3518ceb00e7844da");
	});

	it("BEVI_API_TOKEN vazio ou whitespace lança (não vira token '')", () => {
		process.env.BEVI_API_TOKEN = "";
		expect(() => loadBeviConfigFromEnv()).toThrow(/token/i);
		process.env.BEVI_API_TOKEN = "   ";
		expect(() => loadBeviConfigFromEnv()).toThrow(/token/i);
	});

	it("construir sem token (env) lança — sem fallback silencioso", () => {
		expect(() => new BeviApiAdapter()).toThrow(/token/i);
	});

	it("constrói com config explícita", () => {
		expect(new BeviApiAdapter(CONFIG)).toBeInstanceOf(BeviApiAdapter);
	});
});

// ── Camada 2: contract contra CAPTURAS REAIS (loja-piloto, 2026-06-02) ──
// Mudança no parser/envelope/mapeamento quebra aqui. Zero rede.
describe("BeviApiAdapter — contract contra capturas reais", () => {
	let calls: Array<{ url: string; init: RequestInit }>;

	function mockFetchSequence(...envelopes: unknown[]) {
		const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
			calls.push({ url, init });
			return { json: async () => envelopes.shift() } as Response;
		});
		globalThis.fetch = fetchMock as typeof fetch;
		return fetchMock;
	}
	const lastBody = (): Record<string, unknown> => JSON.parse(calls.at(-1)?.init.body as string);
	const header = (name: string): string | undefined =>
		(calls.at(-1)?.init.headers as Record<string, string>)[name];

	beforeEach(() => {
		calls = [];
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("createProposal: POST service_id correto, campos UPPERCASE, CPF só dígitos", async () => {
		mockFetchSequence(okInsert);
		const out = await new BeviApiAdapter(CONFIG).createProposal({
			cpf: "123.456.789-09",
			celular: "(11) 99999-8888",
			termoLgpd: true,
			consultaDados: true,
		});
		expect(out.proposalId).toBe((okInsert as { data: { proposalId: string } }).data.proposalId);
		expect(header("service_id")).toBe("insert_proposal_bevi_consorcio");
		expect(header("Authorization")).toBe("Bearer test-token");
		const body = lastBody();
		expect(body.CPF).toBe("12345678909");
		expect(body.CELULAR).toBe("11999998888");
		expect(body.TERMO_LGPD).toBe(true);
		expect(body.CONSULTA_DE_DADOS).toBe(true);
		expect(body.ignoreOngoingProposals).toBe(false);
	});

	it("listSegments: GET com qs e retorna os 6 segmentos reais", async () => {
		mockFetchSequence(okSegments);
		const segs = await new BeviApiAdapter(CONFIG).listSegments("PID");
		expect(calls[0].init.method).toBe("GET");
		expect(calls[0].url).toContain("/segments?proposalId=PID");
		expect(segs.map((s) => s.segmento)).toContain("AUTOS");
		expect(segs.length).toBeGreaterThanOrEqual(6);
	});

	it("simulate: mapeia offers (8 campos) + expiresAt; propostaId camelCase", async () => {
		mockFetchSequence(okSimulation);
		const r = await new BeviApiAdapter(CONFIG).simulate({
			proposalId: "P1",
			segmento: "AUTOS",
			tipoSimulacao: "valor_total",
			valor: 50000,
			objetivo: "contemplacao_rapida",
		});
		expect(r.offers.length).toBe(24);
		expect(r.offers[0]).toHaveProperty("ofertaId");
		expect(r.offers[0]).toHaveProperty("valorCarta");
		expect(r.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(lastBody().propostaId).toBe("P1");
		expect(lastBody().lanceEmbutido).toBe("nenhum");
	});

	// BUG-TEM-EMBUTIDO (dev real 2026-06-12): Bevi passou a exigir `temEmbutido`
	// na simulação de contemplação rápida — sem o campo, 400 "Simulação inválida:
	// temEmbutido é obrigatório para contemplação rápida" e o passo 5 morria com
	// "Tive um problema ao falar com a administradora". O adapter enviava só
	// `lanceEmbutido` (string) e nunca o boolean.
	it("simulate: envia temEmbutido=true quando há lance embutido (%)", async () => {
		mockFetchSequence(okSimulation);
		await new BeviApiAdapter(CONFIG).simulate({
			proposalId: "P1",
			segmento: "AUTOS",
			tipoSimulacao: "valor_total",
			valor: 50000,
			objetivo: "contemplacao_rapida",
			lanceEmbutido: "30",
		});
		expect(lastBody().temEmbutido).toBe(true);
		expect(lastBody().lanceEmbutido).toBe("30");
	});

	it("simulate: envia temEmbutido=false quando lanceEmbutido='nenhum'/omitido", async () => {
		mockFetchSequence(okSimulation);
		await new BeviApiAdapter(CONFIG).simulate({
			proposalId: "P1",
			segmento: "AUTOS",
			tipoSimulacao: "valor_total",
			valor: 50000,
			objetivo: "contemplacao_rapida",
		});
		expect(lastBody().temEmbutido).toBe(false);
	});

	it("simulate: 404 transitório → retry → sucesso (spec §4.3)", async () => {
		const transient404 = {
			status: "NOT_FOUND",
			code: 404,
			success: false,
			message: "transit",
			data: {},
		};
		const fetchMock = mockFetchSequence(transient404, okSimulation);
		const r = await new BeviApiAdapter(CONFIG).simulate({
			proposalId: "P1",
			segmento: "AUTOS",
			tipoSimulacao: "valor_total",
			valor: 50000,
			objetivo: "contemplacao_rapida",
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(r.offers.length).toBe(24);
	});

	it("chooseOffer: retorna consortiumProposalLink", async () => {
		mockFetchSequence(okChoose);
		const r = await new BeviApiAdapter(CONFIG).chooseOffer({ proposalId: "P1", ofertaId: "O1" });
		expect(r.consortiumProposalLink).toContain("uselink.me");
		expect(lastBody().ofertaId).toBe("O1");
	});

	it("getDocumentLinks: retorna os 2 links de upload", async () => {
		mockFetchSequence(okDoclinks);
		const r = await new BeviApiAdapter(CONFIG).getDocumentLinks("P1");
		expect(r.linkDocumentosPessoais).toContain("uselink.me");
		expect(r.linkComprovanteEndereco).toContain("uselink.me");
	});

	it("getStatus: retorna statusName + changesHistory", async () => {
		mockFetchSequence(okStatus);
		const r = await new BeviApiAdapter(CONFIG).getStatus("P1");
		expect(r.statusName).toBeTruthy();
		expect(Array.isArray(r.changesHistory)).toBe(true);
	});

	it("409 real → OngoingProposalError com ongoingProposalIds", async () => {
		mockFetchSequence(err409);
		const err = await new BeviApiAdapter(CONFIG)
			.createProposal({
				cpf: "12345678909",
				celular: "11999998888",
				termoLgpd: true,
				consultaDados: true,
			})
			.catch((e) => e);
		expect(err).toBeInstanceOf(OngoingProposalError);
		expect((err as OngoingProposalError).ongoingProposalIds.length).toBeGreaterThan(0);
	});

	it("400 valor real → MinCreditError extraindo o mínimo (R$ 21.000)", async () => {
		mockFetchSequence(err400);
		const err = await new BeviApiAdapter(CONFIG)
			.simulate({
				proposalId: "P1",
				segmento: "AUTOS",
				tipoSimulacao: "valor_total",
				valor: 5000,
				objetivo: "contemplacao_rapida",
			})
			.catch((e) => e);
		expect(err).toBeInstanceOf(MinCreditError);
		expect((err as MinCreditError).minCredit).toBe(21000);
	});
});

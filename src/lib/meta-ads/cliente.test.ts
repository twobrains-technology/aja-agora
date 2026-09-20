// O CLIENTE da Marketing API — provado SEM rede.
//
// O `fetch` entra por parâmetro (`criarClienteMetaAds(cfg, fetchFake)`), então o
// que se prova aqui é a normalização (centavos, leads, id por nível) e a
// paginação — as duas coisas que, erradas, enchem a tabela de lixo silencioso.
// A guarda de chave desligada é provada em `resolver.integration.test.ts`, junto
// do ciclo.

import { describe, expect, it, vi } from "vitest";
import {
	CONTA_PADRAO,
	type ConfigMetaAds,
	centavosDeSpend,
	criarClienteMetaAds,
	ehErroDeCampoNaoPermitido,
	type FetchDaMeta,
	getMetaAdsConfig,
	janelaPadrao,
	leadsDeActions,
	MetaAdsError,
	motivoParaNaoSincronizar,
} from "./cliente";

const CFG: ConfigMetaAds = {
	token: "token-de-teste",
	accountId: CONTA_PADRAO,
	apiVersion: "v21.0",
};

/** Responde por URL: o teste monta um mapa de rota → corpo. */
function fetchQue(respostas: Array<{ casa: string; corpo: unknown }>): {
	fetch: FetchDaMeta;
	urls: string[];
} {
	const urls: string[] = [];
	const fetch = vi.fn(async (url: string) => {
		urls.push(url);
		const achado = respostas.find((r) => url.includes(r.casa));
		if (!achado) return { ok: false, status: 404, json: async () => ({}) };
		return { ok: true, status: 200, json: async () => achado.corpo };
	}) as unknown as FetchDaMeta;
	return { fetch, urls };
}

describe("config e guarda de chave desligada", () => {
	it("sem META_ADS_TOKEN_AJA, o motivo de não sincronizar é o token ausente", () => {
		const cfg = getMetaAdsConfig({});
		expect(cfg.token).toBeNull();
		expect(cfg.accountId).toBe(CONTA_PADRAO);
		expect(motivoParaNaoSincronizar(cfg, {})).toBe("META_ADS_TOKEN_AJA ausente");
	});

	it("com token, o ciclo está liberado", () => {
		expect(motivoParaNaoSincronizar(getMetaAdsConfig({ META_ADS_TOKEN_AJA: "x" }), {})).toBeNull();
	});

	it("META_ADS_SYNC_ATIVO=0 desliga mesmo com token presente", () => {
		const motivo = motivoParaNaoSincronizar(getMetaAdsConfig({ META_ADS_TOKEN_AJA: "x" }), {
			META_ADS_SYNC_ATIVO: "0",
		});
		expect(motivo).toBe("META_ADS_SYNC_ATIVO desligado");
	});
});

describe("normalização do insight", () => {
	it("spend vira centavos inteiros, tratando string da Meta", () => {
		expect(centavosDeSpend("123.45")).toBe(12345);
		expect(centavosDeSpend("0.099")).toBe(10);
		expect(centavosDeSpend(12.5)).toBe(1250);
		expect(centavosDeSpend(null)).toBeNull();
		expect(centavosDeSpend("")).toBeNull();
		expect(centavosDeSpend("abacaxi")).toBeNull();
	});

	it("leads escolhe por PRIORIDADE, não soma (os action_types se sobrepõem)", () => {
		expect(
			leadsDeActions([
				{ action_type: "offsite_conversion.fb_pixel_lead", value: "7" },
				{ action_type: "lead", value: "3" },
			]),
		).toBe(3);
		expect(leadsDeActions([{ action_type: "onsite_conversion.lead_grouped", value: "5" }])).toBe(5);
		expect(leadsDeActions([{ action_type: "link_click", value: "99" }])).toBeNull();
		expect(leadsDeActions(null)).toBeNull();
	});

	it("lerInsightsDiarios normaliza o dia, o id do nível e as métricas", async () => {
		const { fetch } = fetchQue([
			{
				casa: "/insights",
				corpo: {
					data: [
						{
							campaign_id: "120210000000370104",
							date_start: "2026-09-16",
							spend: "42.10",
							impressions: "1000",
							clicks: "12",
							actions: [{ action_type: "lead", value: "3" }],
						},
					],
				},
			},
		]);
		const cliente = criarClienteMetaAds(CFG, fetch);
		const lidos = await cliente.lerInsightsDiarios({
			desde: "2026-09-01",
			ate: "2026-09-16",
			nivel: "campaign",
		});
		expect(lidos).toEqual([
			{
				data: "2026-09-16",
				entityId: "120210000000370104",
				nivel: "campaign",
				spendCents: 4210,
				impressions: 1000,
				clicks: 12,
				leads: 3,
			},
		]);
	});

	it("o nível pedido decide o campo do id e a query", async () => {
		const { fetch, urls } = fetchQue([
			{
				casa: "/insights",
				corpo: { data: [{ ad_id: "456", date_start: "2026-09-16", spend: "1" }] },
			},
		]);
		const cliente = criarClienteMetaAds(CFG, fetch);
		const lidos = await cliente.lerInsightsDiarios({
			desde: "2026-09-01",
			ate: "2026-09-16",
			nivel: "ad",
		});
		expect(lidos[0]?.entityId).toBe("456");
		expect(lidos[0]?.nivel).toBe("ad");
		expect(decodeURIComponent(urls[0] ?? "")).toContain("level=ad");
		expect(decodeURIComponent(urls[0] ?? "")).toContain("ad_id");
	});

	it("linha sem id da entidade ou sem data é descartada (não vira órfã)", async () => {
		const { fetch } = fetchQue([
			{
				casa: "/insights",
				corpo: {
					data: [
						{ campaign_id: "1", date_start: "2026-09-16" },
						{ date_start: "2026-09-16" },
						{ campaign_id: "2" },
					],
				},
			},
		]);
		const cliente = criarClienteMetaAds(CFG, fetch);
		const lidos = await cliente.lerInsightsDiarios({
			desde: "2026-09-01",
			ate: "2026-09-16",
			nivel: "campaign",
		});
		expect(lidos.map((l) => l.entityId)).toEqual(["1"]);
	});
});

describe("entidades e paginação", () => {
	it("campanha vira entidade com status, conta e sem pai", async () => {
		const { fetch } = fetchQue([
			{
				casa: "/campaigns",
				corpo: {
					data: [
						{
							id: "120210000000370104",
							name: "META | EXP | LEAD | BR | PLACEMENTS",
							status: "ACTIVE",
							account_id: "act_1594922312055163",
						},
					],
				},
			},
		]);
		const cliente = criarClienteMetaAds(CFG, fetch);
		expect(await cliente.lerCampanhas()).toEqual([
			{
				entityId: "120210000000370104",
				nivel: "campaign",
				nome: "META | EXP | LEAD | BR | PLACEMENTS",
				status: "ACTIVE",
				accountId: "act_1594922312055163",
				parentEntityId: null,
			},
		]);
	});

	it("conjunto aponta para a campanha; anúncio, para o conjunto", async () => {
		const { fetch } = fetchQue([
			{
				casa: "/adsets",
				corpo: {
					data: [{ id: "77", name: "CONJ", status: "PAUSED", campaign_id: "55" }],
				},
			},
			{
				casa: "/ads",
				corpo: {
					data: [
						{ id: "99", name: "ANUNCIO", status: "ACTIVE", adset_id: "77", campaign_id: "55" },
					],
				},
			},
		]);
		const cliente = criarClienteMetaAds(CFG, fetch);
		expect((await cliente.lerConjuntos())[0]?.parentEntityId).toBe("55");
		expect((await cliente.lerAnuncios())[0]?.parentEntityId).toBe("77");
	});

	it("segue paging.next até a última página", async () => {
		const { fetch, urls } = fetchQue([
			{
				casa: "after=pagina2",
				corpo: { data: [{ id: "2", name: "B", status: "ACTIVE" }] },
			},
			{
				casa: "/campaigns",
				corpo: {
					data: [{ id: "1", name: "A", status: "ACTIVE" }],
					paging: {
						next: "https://graph.facebook.com/v21.0/act_x/campaigns?after=pagina2",
					},
				},
			},
		]);
		const cliente = criarClienteMetaAds(CFG, fetch);
		const lidas = await cliente.lerCampanhas();
		expect(lidas.map((e) => e.entityId)).toEqual(["1", "2"]);
		expect(urls).toHaveLength(2);
	});

	it("erro da Meta vira exceção com a mensagem dela (não silêncio)", async () => {
		const fetch = vi.fn(async () => ({
			ok: false,
			status: 400,
			json: async () => ({ error: { message: "Invalid OAuth access token" } }),
		})) as unknown as FetchDaMeta;
		const cliente = criarClienteMetaAds(CFG, fetch);
		await expect(cliente.lerCampanhas()).rejects.toThrow(/Invalid OAuth access token/);
	});

	it("o anúncio traz o criativo (id, nome e miniatura) da Graph API", async () => {
		const { fetch, urls } = fetchQue([
			{
				casa: "/ads",
				corpo: {
					data: [
						{
							id: "99",
							name: "ANUNCIO | CARRO | V1",
							creative: {
								id: "cri-1",
								name: "IMG | GERAL | RMKT | V1",
								thumbnail_url: "https://scontent.example/t.jpg",
								effective_object_story_id: "pagina_1",
							},
						},
					],
				},
			},
		]);
		const cliente = criarClienteMetaAds(CFG, fetch);
		const [ad] = await cliente.lerAnuncios();
		expect(ad?.creativeId).toBe("cri-1");
		expect(ad?.creativeName).toBe("IMG | GERAL | RMKT | V1");
		expect(ad?.thumbnailUrl).toBe("https://scontent.example/t.jpg");
		// O campo precisa estar na query; sem ele a Meta não devolve o criativo.
		expect(decodeURIComponent(urls[0] ?? "")).toContain("creative{id,name,thumbnail_url");
	});

	it("anúncio SEM criativo não inventa valor: campos nulos", async () => {
		const { fetch } = fetchQue([
			{ casa: "/ads", corpo: { data: [{ id: "99", name: "ANUNCIO" }] } },
		]);
		const cliente = criarClienteMetaAds(CFG, fetch);
		const [ad] = await cliente.lerAnuncios();
		expect(ad?.creativeId).toBeNull();
		expect(ad?.creativeName).toBeNull();
		expect(ad?.thumbnailUrl).toBeNull();
	});

	it("com semCriativo, a query não pede creative (degradação por permissão)", async () => {
		const { fetch, urls } = fetchQue([{ casa: "/ads", corpo: { data: [{ id: "99" }] } }]);
		const cliente = criarClienteMetaAds(CFG, fetch);
		await cliente.lerAnuncios({ semCriativo: true });
		expect(decodeURIComponent(urls[0] ?? "")).not.toContain("creative");
	});

	it("código #100/#200 é reconhecido como campo não permitido; o resto não", async () => {
		const fetch = vi.fn(async () => ({
			ok: false,
			status: 400,
			json: async () => ({ error: { message: "(#100) nonexisting field", code: 100 } }),
		})) as unknown as FetchDaMeta;
		const cliente = criarClienteMetaAds(CFG, fetch);
		let capturado: unknown;
		try {
			await cliente.lerAnuncios();
		} catch (e) {
			capturado = e;
		}
		expect(capturado).toBeInstanceOf(MetaAdsError);
		expect((capturado as MetaAdsError).codigo).toBe(100);
		expect(ehErroDeCampoNaoPermitido(capturado)).toBe(true);
		expect(ehErroDeCampoNaoPermitido(new MetaAdsError(500, 2, "caiu"))).toBe(false);
		expect(ehErroDeCampoNaoPermitido(new Error("qualquer"))).toBe(false);
	});

	it("janela padrão é fechada nas duas pontas, no fuso do negócio", () => {
		const agora = new Date("2026-09-17T12:00:00Z"); // 09h em Brasília
		expect(janelaPadrao(90, agora)).toEqual({ desde: "2026-06-19", ate: "2026-09-17" });
	});
});

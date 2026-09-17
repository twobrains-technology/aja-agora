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
	type FetchDaMeta,
	getMetaAdsConfig,
	janelaPadrao,
	leadsDeActions,
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

	it("janela padrão é fechada nas duas pontas, no fuso do negócio", () => {
		const agora = new Date("2026-09-17T12:00:00Z"); // 09h em Brasília
		expect(janelaPadrao(90, agora)).toEqual({ desde: "2026-06-19", ate: "2026-09-17" });
	});
});

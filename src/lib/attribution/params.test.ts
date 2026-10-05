import { describe, expect, it } from "vitest";
import { hasCampaignSignal, parseCampaignParams } from "./params";

describe("parseCampaignParams", () => {
	it("extrai os cinco UTM padrão", () => {
		const params = parseCampaignParams(
			new URLSearchParams(
				"utm_source=facebook&utm_medium=cpc&utm_campaign=consorcio-carro&utm_content=criativo-3&utm_term=consorcio+barato",
			),
		);

		expect(params).toEqual({
			utmSource: "facebook",
			utmMedium: "cpc",
			utmCampaign: "consorcio-carro",
			utmContent: "criativo-3",
			utmTerm: "consorcio barato",
			gclid: null,
			fbclid: null,
			campaignId: null,
			adsetId: null,
			adId: null,
		});
	});

	it("extrai click IDs do Google e da Meta", () => {
		const params = parseCampaignParams(
			new URLSearchParams("gclid=Cj0KCQiA__abc123&fbclid=IwAR0xyz789"),
		);

		expect(params.gclid).toBe("Cj0KCQiA__abc123");
		expect(params.fbclid).toBe("IwAR0xyz789");
	});

	it("aceita o formato de searchParams do server component", () => {
		const params = parseCampaignParams({
			utm_source: "google",
			utm_campaign: ["primeira", "segunda"],
			outro: "ignorado",
		});

		expect(params.utmSource).toBe("google");
		// Query duplicada (?utm_campaign=a&utm_campaign=b) fica com o primeiro valor —
		// mesma escolha do URLSearchParams.get, pra não divergir entre os dois caminhos.
		expect(params.utmCampaign).toBe("primeira");
	});

	it("trata parâmetro ausente e vazio como nulo, não como string vazia", () => {
		const params = parseCampaignParams(new URLSearchParams("utm_source=&utm_medium=%20%20"));

		expect(params.utmSource).toBeNull();
		expect(params.utmMedium).toBeNull();
	});

	it("apara espaço em volta do valor", () => {
		const params = parseCampaignParams(new URLSearchParams("utm_campaign=  black-friday  "));

		expect(params.utmCampaign).toBe("black-friday");
	});

	it("trunca valor absurdamente longo — a URL é entrada de terceiro", () => {
		const params = parseCampaignParams(new URLSearchParams(`utm_content=${"x".repeat(900)}`));

		expect(params.utmContent).toHaveLength(255);
	});
});

describe("hasCampaignSignal", () => {
	it("reconhece sinal quando qualquer UTM está presente", () => {
		expect(
			hasCampaignSignal(parseCampaignParams(new URLSearchParams("utm_source=instagram"))),
		).toBe(true);
	});

	it("reconhece sinal quando só o click ID veio (anunciante esqueceu a UTM)", () => {
		expect(hasCampaignSignal(parseCampaignParams(new URLSearchParams("fbclid=IwAR0abc")))).toBe(
			true,
		);
	});

	it("não reconhece sinal em acesso direto", () => {
		expect(hasCampaignSignal(parseCampaignParams(new URLSearchParams("")))).toBe(false);
	});

	it("não reconhece sinal em parâmetro não relacionado a campanha", () => {
		expect(hasCampaignSignal(parseCampaignParams(new URLSearchParams("ref=blog&page=2")))).toBe(
			false,
		);
	});
});

// FIX-442 (hotfix de 05/10/2026): os IDs de campanha/conjunto/anúncio chegavam
// DENTRO das UTMs e não eram lidos — as colunas campaign_id/adset_id/ad_id
// ficaram vazias em toda a base (9.455 de 9.658 visitas tinham o id na UTM e
// nenhuma tinha na coluna). Estes casos travam o fallback.
describe("parseCampaignParams — id da Meta dentro da UTM (hotfix 05/10/2026)", () => {
	it("deriva campanha, anúncio e conjunto das UTMs que a Meta usa", () => {
		const p = parseCampaignParams(
			new URLSearchParams(
				"utm_source=fb&utm_campaign=120251784723480104&utm_content=120251242916450104&utm_term=120251242855400104",
			),
		);
		expect(p.campaignId).toBe("120251784723480104");
		expect(p.adId).toBe("120251242916450104");
		expect(p.adsetId).toBe("120251242855400104");
	});

	it("o parâmetro explícito ganha do fallback", () => {
		const p = parseCampaignParams(
			new URLSearchParams("utm_campaign=120251784723480104&campaign_id=999999999999999999"),
		);
		expect(p.campaignId).toBe("999999999999999999");
	});

	it("UTM que não é id não vira id (não grava lixo na atribuição)", () => {
		const p = parseCampaignParams(new URLSearchParams("utm_campaign=black-friday&utm_content=carrossel"));
		expect(p.campaignId).toBeNull();
		expect(p.adId).toBeNull();
		expect(p.utmCampaign).toBe("black-friday");
	});

	it("sem UTM de mídia, nada é inferido", () => {
		const p = parseCampaignParams(new URLSearchParams(""));
		expect(p.campaignId == null && p.adId == null && p.adsetId == null).toBe(true);
	});
});

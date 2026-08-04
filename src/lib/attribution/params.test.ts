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

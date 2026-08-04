import { describe, expect, it } from "vitest";
import { type OrigemBruta, rotularOrigem } from "./origem-label";

const VAZIA: OrigemBruta = {
	utmSource: null,
	utmMedium: null,
	utmCampaign: null,
	utmContent: null,
	ctwaSourceId: null,
	ctwaHeadline: null,
	referrerHost: null,
};

describe("rotularOrigem", () => {
	it("nomeia campanha de mídia paga pela UTM", () => {
		expect(
			rotularOrigem({
				...VAZIA,
				utmSource: "facebook",
				utmMedium: "cpc",
				utmCampaign: "consorcio-carro",
				utmContent: "criativo-7",
			}),
		).toEqual({
			tipo: "campanha",
			fonte: "facebook",
			campanha: "consorcio-carro",
			criativo: "criativo-7",
			label: "facebook · consorcio-carro · criativo-7",
		});
	});

	it("aceita campanha sem criativo declarado", () => {
		expect(
			rotularOrigem({ ...VAZIA, utmSource: "google", utmCampaign: "search-consorcio" }),
		).toMatchObject({
			tipo: "campanha",
			criativo: null,
			label: "google · search-consorcio",
		});
	});

	it("nomeia UTM sem campanha só pela fonte", () => {
		expect(rotularOrigem({ ...VAZIA, utmSource: "newsletter" })).toMatchObject({
			tipo: "campanha",
			campanha: null,
			label: "newsletter",
		});
	});

	it("nomeia anúncio de Click-to-WhatsApp pela headline, que é o que o time reconhece", () => {
		// O id do anúncio não diz nada pra quem opera; a headline é o criativo.
		expect(
			rotularOrigem({
				...VAZIA,
				ctwaSourceId: "120210999888777666",
				ctwaHeadline: "Compare consórcios em 2 minutos",
			}),
		).toEqual({
			tipo: "click-to-whatsapp",
			fonte: "meta",
			campanha: null,
			criativo: "Compare consórcios em 2 minutos",
			label: "Click-to-WhatsApp · Compare consórcios em 2 minutos",
		});
	});

	it("cai no id do anúncio quando a Meta não mandou headline", () => {
		expect(rotularOrigem({ ...VAZIA, ctwaSourceId: "120210999888777666" })).toMatchObject({
			tipo: "click-to-whatsapp",
			label: "Click-to-WhatsApp · anúncio 120210999888777666",
		});
	});

	it("prefere a UTM ao Click-to-WhatsApp quando os dois vêm juntos", () => {
		// UTM é declaração explícita de quem montou a campanha; o referral é inferência.
		expect(
			rotularOrigem({
				...VAZIA,
				utmSource: "facebook",
				utmCampaign: "campanha-x",
				ctwaSourceId: "12345",
			}),
		).toMatchObject({ tipo: "campanha", label: "facebook · campanha-x" });
	});

	it("nomeia chegada orgânica pelo site de origem", () => {
		expect(rotularOrigem({ ...VAZIA, referrerHost: "www.google.com" })).toEqual({
			tipo: "referencia",
			fonte: "www.google.com",
			campanha: null,
			criativo: null,
			label: "www.google.com",
		});
	});

	it("chama de direto quem chegou sem nenhuma pista", () => {
		expect(rotularOrigem(VAZIA)).toEqual({
			tipo: "direto",
			fonte: null,
			campanha: null,
			criativo: null,
			label: "Direto",
		});
	});

	it("chama de direto quem não tem visita nenhuma", () => {
		// Conversa criada antes da instrumentação, ou pelo simulador.
		expect(rotularOrigem(null)).toMatchObject({ tipo: "direto", label: "Direto" });
	});

	it("ignora string vazia como se fosse ausente", () => {
		expect(rotularOrigem({ ...VAZIA, utmSource: "  ", referrerHost: "" })).toMatchObject({
			tipo: "direto",
		});
	});
});

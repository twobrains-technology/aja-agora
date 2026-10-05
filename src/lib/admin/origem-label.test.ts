import { describe, expect, it } from "vitest";
import { ehNavegacaoInterna, type OrigemBruta, rotularOrigem } from "./origem-label";

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
			// Sem `campaignId`, o resolvedor não conhece esta campanha — os dois
			// campos nascem nulos e quem renderiza cai no rótulo cru. É o caminho
			// de quem só tem UTM (comportamento de antes, preservado).
			nomeDaCampanha: null,
			entityId: null,
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

// FIX-443 (05/10/2026): medido em produção — 155 de 312 visitas do período
// entravam como "Referência · ajaagora.com.br". Era navegação interna.
describe("ehNavegacaoInterna (o nosso domínio não é referência)", () => {
	it("reconhece o nosso domínio em todas as formas que o navegador manda", () => {
		for (const h of [
			"ajaagora.com.br",
			"www.ajaagora.com.br",
			"ajagora.com.br",
			"www.ajagora.com.br",
			"ajaagora.com.br:2086",
			"ajaagora.com.br:8080",
			"ajaagora.com.br:8880",
			"tb-aja-agora.twobrainstechnology.com",
			"https://ajaagora.com.br",
			"AJAAGORA.COM.BR",
		]) {
			expect(ehNavegacaoInterna(h)).toBe(true);
		}
	});

	it("não engole referência de terceiro", () => {
		for (const h of ["www.google.com", "google.com", "instagram.com", "l.instagram.com", "blog.com.br"]) {
			expect(ehNavegacaoInterna(h)).toBe(false);
		}
	});

	it("a visita que veio do nosso próprio site vira Direto, não Referência", () => {
		const semReferrer = rotularOrigem({
			utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
			ctwaSourceId: null, ctwaHeadline: null, referrerHost: null, campaignId: null,
		});
		for (const h of ["ajaagora.com.br", "www.ajaagora.com.br", "ajagora.com.br", "ajaagora.com.br:2086"]) {
			const comReferrerInterno = rotularOrigem({
				utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
				ctwaSourceId: null, ctwaHeadline: null, referrerHost: h, campaignId: null,
			});
			expect(comReferrerInterno.tipo).toBe("direto");
			expect(comReferrerInterno.label).toBe(semReferrer.label);
		}
	});

	it("referência de terceiro continua referência", () => {
		const o = rotularOrigem({
			utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
			ctwaSourceId: null, ctwaHeadline: null, referrerHost: "www.google.com", campaignId: null,
		});
		expect(o.tipo).toBe("referencia");
		expect(o.label).toBe("www.google.com");
	});
});

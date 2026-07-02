import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type BeviOffer,
	beviOfferToGroupSummary,
	beviOfferToQuotaSimulation,
	beviSegmentToCategory,
} from "./offer-mapper";

// Camada 1 (estrutural) — mapeamento Bevi → domínio contra as fixtures REAIS
// capturadas via Playwright (docs/integracoes/assets/segmentos/*/offers.json).
// Prova que o shape da API do parceiro está entendido e pronto pra plugar.

function loadFixture(segment: string): { offers: BeviOffer[] } {
	const path = resolve(process.cwd(), `docs/integracoes/assets/segmentos/${segment}/offers.json`);
	return JSON.parse(readFileSync(path, "utf-8"));
}

describe("beviSegmentToCategory", () => {
	it("mapeia os 6 segmentos Bevi pras 4 categorias do domínio", () => {
		expect(beviSegmentToCategory("IMOVEL")).toBe("imovel");
		expect(beviSegmentToCategory("AUTOS")).toBe("auto");
		expect(beviSegmentToCategory("MOTOS")).toBe("moto");
		expect(beviSegmentToCategory("SERVICOS")).toBe("servicos");
		expect(beviSegmentToCategory("PESADOS")).toBe("auto");
		expect(beviSegmentToCategory("OUTROS BENS")).toBe("servicos");
	});

	it("lança em segmento desconhecido", () => {
		expect(() => beviSegmentToCategory("XPTO")).toThrow(/desconhecido/i);
	});
});

describe("beviOfferToGroupSummary — fixture real imóvel (RODOBENS grupo 2119)", () => {
	const offer = loadFixture("imovel").offers[0];

	it("mapeia os campos centrais da oferta real", () => {
		const g = beviOfferToGroupSummary(offer);
		expect(g.id).toBe("6a0ca9ca3e68cce9b61d3fb8"); // quotaId
		expect(g.administradora).toBe("RODOBENS");
		expect(g.category).toBe("imovel");
		expect(g.creditValue).toBe(80000); // finalValue
		expect(g.termMonths).toBe(216);
		expect(g.adminFeePercent).toBe(29); // 0.29 → 29%
		expect(g.monthlyPayment).toBe(366.51); // importedInstallmentValue
		expect(g.contemplationRate).toBe(2); // monthlyAwardedQuotas
	});
});

describe("beviOfferToQuotaSimulation — fixture real imóvel", () => {
	const offer = loadFixture("imovel").offers[0];

	it("breakdown de custos bate com a oferta real", () => {
		const s = beviOfferToQuotaSimulation(offer);
		expect(s.creditValue).toBe(80000);
		expect(s.totalCost).toBe(110333.18); // totalPaid
		expect(s.adminFee).toBe(23200); // 80000 * 0.29
		expect(s.reserveFund).toBe(0); // reserveFundFee 0
		expect(s.insurance).toBe(7133.18); // insuranceTotalAmount
		expect(s.termMonths).toBe(216);
	});

	it("correção do imóvel é INCC (Bevi adjustmentType)", () => {
		const s = beviOfferToQuotaSimulation(offer);
		expect(s.expectedAdjustment.index).toBe("INCC");
	});

	it("cenário de lance reflete o bidPercentage da oferta (30%)", () => {
		const s = beviOfferToQuotaSimulation(offer);
		expect(s.lanceScenario.lancePercent).toBe(30); // bidPercentage 0.3
		expect(s.lanceScenario.expectedTermMonths).toBe(6); // probContemplacaoMeses "6"
	});

	it("lance embutido vem dos campos reais da oferta (embeddedBid/receivedCredit)", () => {
		const s = beviOfferToQuotaSimulation(offer);
		expect(s.embeddedBid.percent).toBe(30); // bidPercentage 0.3
		expect(s.embeddedBid.embeddedBidValue).toBe(24000); // offer.embeddedBid
		expect(s.embeddedBid.receivedCredit).toBe(56000); // offer.receivedCredit
		expect(s.embeddedBid.necessaryBidToContemplate).toBe(34520); // offer.necessaryBidToContemplate
		// Coerência: crédito líquido < carta.
		expect(s.embeddedBid.receivedCredit).toBeLessThan(s.creditValue);
	});
});

describe("auto (IPCA) — fixture real", () => {
	it("mapeia índice de correção não-INCC pra IPCA", () => {
		const fixture = loadFixture("veiculo");
		const offer = fixture.offers[0];
		const s = beviOfferToQuotaSimulation(offer);
		expect(s.category).toBe("auto");
		expect(s.expectedAdjustment.index).toBe("IPCA");
	});
});

// FIX-8 (teste manual Kairo 2026-06-05): "Lance estimado p/ contemplar"
// aparecia como R$ 0,00 — o fallback `finalValue * 0.43` era heurística
// INVENTADA (fere a regra anti-mock) e `??` deixava o 0 explícito da Bevi
// vazar pra UI. Regra de produto: número exibido vem de dado REAL ou o campo
// é OMITIDO — jamais informação errada/enganosa.
describe("FIX-8 — necessaryBidToContemplate: dado real ou null (nunca 43% inventado, nunca 0)", () => {
	const base = loadFixture("imovel").offers[0];

	it("oferta SEM o campo → null (sem heurística de 43%)", () => {
		const offer = { ...base, necessaryBidToContemplate: undefined };
		const s = beviOfferToQuotaSimulation(offer);
		expect(s.embeddedBid.necessaryBidToContemplate).toBeNull();
	});

	it("oferta com 0 explícito → null (0 seco na UI é enganoso)", () => {
		const offer = { ...base, necessaryBidToContemplate: 0 };
		const s = beviOfferToQuotaSimulation(offer);
		expect(s.embeddedBid.necessaryBidToContemplate).toBeNull();
	});
});

// FIX-30 (teste manual Kairo 2026-06-11, ofertas ao vivo de jun): a ÂNCORA veio
// com bidPercentage 0,7443 (= lance TOTAL necessário ÷ carta = 59.544/80.000),
// receivedCredit 80.000 (carta CHEIA). O mapper reusava lancePercent como
// embeddedPercent → "COM LANCE EMBUTIDO (74,43%)" + "recebe R$ 80.000" na mesma
// tela. Três contradições. O embutido REAL é embeddedBidAcceptancePercentage.
describe("FIX-30 — lance total (bidPercentage) NUNCA vira % embutido", () => {
	const base = loadFixture("imovel").offers[0];
	const ancoraJun: BeviOffer = {
		...base,
		bidPercentage: 0.7443, // lance TOTAL necessário (não embutido)
		necessaryBidToContemplate: 59544,
		receivedCredit: 80000, // carta CHEIA (contradição com embutido)
		finalValue: 80000,
		embeddedBidAcceptancePercentage: "30,00", // teto REAL de embutido
	};

	it("embeddedBid.percent usa o teto REAL de embutido (30), não o lance total (74,43)", () => {
		const s = beviOfferToQuotaSimulation(ancoraJun);
		expect(s.embeddedBid.percent).toBe(30);
		expect(s.embeddedBid.percent).not.toBe(74.43);
	});

	it("o lance total (74,43%) fica no lanceScenario, separado do embutido", () => {
		const s = beviOfferToQuotaSimulation(ancoraJun);
		expect(s.lanceScenario.lancePercent).toBe(74.43); // lance total necessário
		expect(s.embeddedBid.percent).not.toBe(s.lanceScenario.lancePercent); // semânticas separadas
	});

	it("sem teto real de embutido → percent NÃO herda o lance total (cai no default 30)", () => {
		const semTeto: BeviOffer = { ...ancoraJun, embeddedBidAcceptancePercentage: undefined };
		const s = beviOfferToQuotaSimulation(semTeto);
		expect(s.embeddedBid.percent).not.toBe(74.43);
		expect(s.embeddedBid.percent).toBe(30);
	});

	it("oferta com dado real (> 0) → valor literal preservado", () => {
		const s = beviOfferToQuotaSimulation(base);
		expect(s.embeddedBid.necessaryBidToContemplate).toBe(34520);
	});
});

// FIX-192 (refino tela recomendação, 2026-07-01): a contemplação exibida só pode
// vir de dado REAL ancorado. O availableSlots (contagem de contemplados/mês) =
// monthlyAwardedQuotas coagido (0 quando ausente — o retorno enxuto de 2026-07-01
// NÃO traz o campo, spec §1.1). A `taxaContemplacao` (fração 0..1, semântica TBD
// com a AGX) NÃO é contagem e NUNCA vira availableSlots/contemplationRate nem %.
// Converge com a coerção server-side do runner (FIX-191): o hero usa o availableSlots
// real, nunca o número da LLM.
describe("FIX-192 — availableSlots é o monthlyAwardedQuotas real (0 quando ausente); nunca taxaContemplacao", () => {
	const base = loadFixture("imovel").offers[0];

	it("§7.1 — oferta SEM monthlyAwardedQuotas → availableSlots=0 e contemplationRate=0", () => {
		const offer = { ...base, monthlyAwardedQuotas: undefined };
		const g = beviOfferToGroupSummary(offer);
		expect(g.availableSlots).toBe(0);
		expect(g.contemplationRate).toBe(0);
	});

	it("§7.3 — oferta com monthlyAwardedQuotas:2 → availableSlots=2 (dado real preservado)", () => {
		const offer = { ...base, monthlyAwardedQuotas: 2 };
		const g = beviOfferToGroupSummary(offer);
		expect(g.availableSlots).toBe(2);
	});

	it("taxaContemplacao (fração 0,605) NÃO vira availableSlots/contemplationRate (nem 0,605 nem 60,5)", () => {
		// Retorno enxuto real: taxaContemplacao presente, monthlyAwardedQuotas ausente.
		const offer = {
			...base,
			monthlyAwardedQuotas: undefined,
			taxaContemplacao: 0.605,
		} as unknown as BeviOffer;
		const g = beviOfferToGroupSummary(offer);
		expect(g.availableSlots).toBe(0);
		expect(g.contemplationRate).toBe(0);
		expect(g.availableSlots).not.toBe(0.605);
		expect(g.contemplationRate).not.toBe(60.5);
	});
});

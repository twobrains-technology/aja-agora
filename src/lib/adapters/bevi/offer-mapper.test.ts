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

// FIX-15 — Camada 1 (structural): a fixture de descoberta de IMOVEL existe, é
// uma captura REAL da Bevi (regra de produto: zero mock fictício em runtime;
// fixtures = capturas reais) e tem >=3 ofertas de imóvel. Tripwire contra
// fixture órfã — o cenário de eval Bruna/Monique depende dela pra não cair em
// handoff honesto por "0 grupos de imóvel".
//
// Roda em TODO PR (<1s) — não precisa de Anthropic nem DB.

import { describe, expect, it } from "vitest";
import okSimulation from "./__fixtures__/ok-selfcontract-simulation.json";
import okSimulationImovel from "./__fixtures__/ok-selfcontract-simulation-imovel.json";
import type { BeviOffer } from "./offer-mapper";

const imovelOffers = (okSimulationImovel as unknown as { data: { data: { offers: BeviOffer[] } } })
	.data.data.offers;
const autoOffers = (okSimulation as unknown as { data: { data: { offers: BeviOffer[] } } }).data
	.data.offers;

describe("FIX-15 — fixture real de IMOVEL pra descoberta", () => {
	it("tem >=3 ofertas (docx: 'Encontramos 3 boas opções')", () => {
		expect(imovelOffers.length).toBeGreaterThanOrEqual(3);
	});

	it("toda oferta é do segmento IMOVEL (não vazou AUTOS pra dentro da fixture)", () => {
		for (const o of imovelOffers) {
			expect(o.productType, `oferta ${o.group} deveria ser IMOVEL`).toBe("IMOVEL");
		}
	});

	it("é captura real: campos numéricos coerentes (crédito/parcela/prazo > 0)", () => {
		for (const o of imovelOffers) {
			expect(o.finalValue, `crédito da oferta ${o.group}`).toBeGreaterThan(0);
			expect(o.term, `prazo da oferta ${o.group}`).toBeGreaterThan(0);
			expect(
				o.importedInstallmentValue ?? o.installmentValue,
				`parcela da oferta ${o.group}`,
			).toBeGreaterThan(0);
		}
	});

	it("o shape bate com a fixture AUTOS (mesmas chaves — não quebra o offer-mapper)", () => {
		const autoKeys = Object.keys(autoOffers[0]).sort();
		const imovelKeys = Object.keys(imovelOffers[0]).sort();
		expect(imovelKeys).toEqual(autoKeys);
	});

	it("tem mais de uma administradora (comparação honesta exige diversidade)", () => {
		const admins = new Set(imovelOffers.map((o) => o.bankLabel ?? o.bank));
		expect(admins.size).toBeGreaterThanOrEqual(2);
	});
});

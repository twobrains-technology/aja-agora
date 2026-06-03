import { describe, expect, it } from "vitest";
import type { PartnerOffer } from "../proposal-gateway";
import { partnerOfferToRealOffer, pickClosestOffer } from "./partner-offer-mapper";
import okSimulation from "./__fixtures__/ok-simulation.json";

const offers = (okSimulation as { data: { offers: PartnerOffer[] } }).data.offers;

describe("partnerOfferToRealOffer — oferta real (8 campos) → confirmação", () => {
	it("mapeia os campos disponíveis + categoria do segmento", () => {
		const real = partnerOfferToRealOffer(offers[0], "AUTOS");
		expect(real.ofertaId).toBe(offers[0].ofertaId);
		expect(real.administradora).toBe(offers[0].administradora);
		expect(real.grupo).toBe(offers[0].grupo);
		expect(real.category).toBe("auto");
		expect(real.creditValue).toBe(offers[0].valorCarta);
		expect(real.monthlyPayment).toBe(Math.round(offers[0].parcela * 100) / 100);
	});

	it("GAPs §11 ficam undefined — nunca chuta prazo/taxa", () => {
		const real = partnerOfferToRealOffer(offers[0], "AUTOS");
		expect(real.termMonths).toBeUndefined();
		expect(real.adminFeePercent).toBeUndefined();
	});

	it("taxaContemplacao NÃO vira 'taxa' exposta — só score interno", () => {
		const real = partnerOfferToRealOffer(offers[0], "AUTOS");
		expect(real.rawContemplationScore).toBe(offers[0].taxaContemplacao);
		// não existe um campo de taxa de adm derivado do score
		expect(real.adminFeePercent).toBeUndefined();
	});

	it("segmentos pesados/outros caem nas categorias de domínio (4)", () => {
		expect(partnerOfferToRealOffer(offers[0], "IMOVEL").category).toBe("imovel");
		expect(partnerOfferToRealOffer(offers[0], "MOTOS").category).toBe("moto");
		expect(partnerOfferToRealOffer(offers[0], "PESADOS").category).toBe("auto");
		expect(partnerOfferToRealOffer(offers[0], "OUTROS BENS").category).toBe("servicos");
	});
});

describe("pickClosestOffer — costura indicativo→real", () => {
	it("escolhe a oferta de valorCarta mais próxima do alvo", () => {
		const target = 50000;
		const chosen = pickClosestOffer(offers, target);
		const minDist = Math.min(...offers.map((o) => Math.abs(o.valorCarta - target)));
		expect(Math.abs((chosen as PartnerOffer).valorCarta - target)).toBe(minDist);
	});

	it("lista vazia → undefined", () => {
		expect(pickClosestOffer([], 50000)).toBeUndefined();
	});
});

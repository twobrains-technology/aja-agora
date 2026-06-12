import { describe, expect, it } from "vitest";
import type { PartnerOffer } from "../proposal-gateway";
import okSimulation from "./__fixtures__/ok-simulation.json";
import { partnerOfferToRealOffer, pickClosestOffer } from "./partner-offer-mapper";

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

	// BUG-ADMIN-TROCADA-NO-FECHAMENTO (2026-06-04, E2E real, achado 2): o usuário
	// decidiu sobre RODOBENS e o fechamento entregou ANCORA — o pick ignorava a
	// administradora recomendada na Descoberta. Com a preferida presente nas
	// ofertas do parceiro, escolhe a mais próxima DELA; ausente → closest geral.
	describe("preferência pela administradora recomendada (consistência fintech)", () => {
		const mk = (administradora: string, valorCarta: number): PartnerOffer =>
			({
				ofertaId: `of-${administradora}-${valorCarta}`,
				administradora,
				tipoOferta: "FREE_BID",
				grupo: "500",
				valorCarta,
				parcela: valorCarta / 80,
				taxaContemplacao: 0.5,
				quotaId: `q-${valorCarta}`,
			}) as PartnerOffer;

		it("prefere a administradora recomendada mesmo se outra está mais próxima do alvo", () => {
			const list = [mk("ANCORA", 60_000), mk("RODOBENS", 64_000)];
			const chosen = pickClosestOffer(list, 60_000, "RODOBENS");
			expect(chosen?.administradora).toBe("RODOBENS");
		});

		it("entre ofertas da preferida, escolhe a mais próxima do alvo", () => {
			const list = [mk("RODOBENS", 80_000), mk("RODOBENS", 62_000), mk("ANCORA", 60_000)];
			const chosen = pickClosestOffer(list, 60_000, "RODOBENS");
			expect(chosen?.valorCarta).toBe(62_000);
		});

		it("preferida ausente nas ofertas do parceiro → closest geral (sem travar o fechamento)", () => {
			const list = [mk("ANCORA", 60_000), mk("TRADICAO", 70_000)];
			const chosen = pickClosestOffer(list, 60_000, "RODOBENS");
			expect(chosen?.administradora).toBe("ANCORA");
		});

		it("comparação tolera acento/caixa (Descoberta 'ÂNCORA' × Parceiro 'ANCORA')", () => {
			const list = [mk("RODOBENS", 60_000), mk("ANCORA", 64_000)];
			const chosen = pickClosestOffer(list, 60_000, "Âncora");
			expect(chosen?.administradora).toBe("ANCORA");
		});
	});
});

// BUG-PARCELA-STRING (dev real 2026-06-12): a Bevi mudou a API do parceiro —
// `parcela` virou STRING pt-BR ("2.075,34") e a resposta ganhou prazo/lanceMedio.
// round2("2.075,34") = NaN → JSON null → RealOffer chamava null.toLocaleString
// e derrubava o front INTEIRO ("This page couldn't load"). Capturado live:
// re-simulação na proposta 6a2be7b1 devolveu o shape novo.
describe("partnerOfferToRealOffer — parcela string pt-BR (API nova 2026-06)", () => {
	const base = {
		ofertaId: "0dbcb774-5ae2-41d3-bf93-0d7c63b59af5",
		administradora: "BANCO DO BRASIL",
		tipoOferta: "SPECIAL_OFFER" as const,
		grupo: "1690",
		valorCarta: 114760.54,
		taxaContemplacao: 0.6044,
		quotaId: "6a2b004df9ec5c948e8bfdfd",
	};

	it("parcela '2.075,34' (string pt-BR) → 2075.34", () => {
		const real = partnerOfferToRealOffer({ ...base, parcela: "2.075,34" }, "AUTOS");
		expect(real.monthlyPayment).toBe(2075.34);
	});

	it("parcela '469,95' (sem milhar) → 469.95", () => {
		const real = partnerOfferToRealOffer({ ...base, parcela: "469,95" }, "AUTOS");
		expect(real.monthlyPayment).toBe(469.95);
	});

	it("parcela number (shape antigo) continua funcionando", () => {
		const real = partnerOfferToRealOffer({ ...base, parcela: 469.95 }, "AUTOS");
		expect(real.monthlyPayment).toBe(469.95);
	});

	it("parcela ausente/ilegível → undefined, NUNCA NaN (NaN vira null no JSON e mata o front)", () => {
		const semParcela = partnerOfferToRealOffer(
			{ ...base, parcela: undefined as unknown as number },
			"AUTOS",
		);
		expect(semParcela.monthlyPayment).toBeUndefined();
		const ilegivel = partnerOfferToRealOffer(
			{ ...base, parcela: "abc" as unknown as number },
			"AUTOS",
		);
		expect(ilegivel.monthlyPayment).toBeUndefined();
	});
});

// FIX-39 (API nova Bevi 2026-06-12): a mesma leva que mudou a `parcela` trouxe o
// campo `prazo` (meses) na oferta de parceiro. O GAP do FIX-13 (prazo ausente)
// deixou de existir — o mapper passa o prazo REAL pra termMonths, defensivo
// (Number.isFinite e > 0); ausente/ilegível → undefined (NUNCA chuta, regra D11;
// NUNCA NaN, lição BUG-PARCELA-STRING). Captura live: proposta 6a2be7b1 → prazo: 72.
describe("partnerOfferToRealOffer — prazo real (API nova 2026-06): termMonths COM fonte", () => {
	const base = {
		ofertaId: "0dbcb774-5ae2-41d3-bf93-0d7c63b59af5",
		administradora: "BANCO DO BRASIL",
		tipoOferta: "SPECIAL_OFFER" as const,
		grupo: "1690",
		valorCarta: 114760.54,
		parcela: "2.075,34",
		taxaContemplacao: 0.6044,
		quotaId: "6a2b004df9ec5c948e8bfdfd",
	};

	it("prazo: 72 (number) → termMonths 72 (gap do FIX-13 acabou)", () => {
		const real = partnerOfferToRealOffer({ ...base, prazo: 72 }, "AUTOS");
		expect(real.termMonths).toBe(72);
	});

	it("prazo ausente (shape antigo / API volta atrás) → termMonths undefined (mantém o fallback do card)", () => {
		const real = partnerOfferToRealOffer({ ...base, parcela: 469.95 }, "AUTOS");
		expect(real.termMonths).toBeUndefined();
	});

	it("prazo não-finito/inválido (NaN/0/negativo/string) → termMonths undefined, NUNCA chuta", () => {
		expect(
			partnerOfferToRealOffer({ ...base, prazo: Number.NaN as unknown as number }, "AUTOS")
				.termMonths,
		).toBeUndefined();
		expect(partnerOfferToRealOffer({ ...base, prazo: 0 }, "AUTOS").termMonths).toBeUndefined();
		expect(partnerOfferToRealOffer({ ...base, prazo: -12 }, "AUTOS").termMonths).toBeUndefined();
		expect(
			partnerOfferToRealOffer({ ...base, prazo: "72" as unknown as number }, "AUTOS").termMonths,
		).toBeUndefined();
	});

	it("adminFeePercent SEGUE GAP (a API nova não trouxe taxa) — só o prazo deixou de ser gap", () => {
		const real = partnerOfferToRealOffer({ ...base, prazo: 72 }, "AUTOS");
		expect(real.adminFeePercent).toBeUndefined();
	});
});

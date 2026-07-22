import { describe, expect, it } from "vitest";
import type { PartnerOffer } from "../proposal-gateway";
import okSimulation from "./__fixtures__/ok-simulation.json";
import { partnerOfferToRealOffer, pickClosestOffer } from "./partner-offer-mapper";

const offers = (okSimulation as { data: { offers: PartnerOffer[] } }).data.offers;

describe("partnerOfferToRealOffer — oferta real (8 campos) → confirmação", () => {
	it("mapeia os campos disponíveis + categoria do segmento", () => {
		const real = partnerOfferToRealOffer(offers[0], "AUTOS");
		expect(real.ofertaId).toBe(offers[0].ofertaId);
		// FIX-265 (menor #1, veredito Fable r5, N5): a fixture traz "ANCORA" (cru,
		// sem acento, código da Bevi) — o mapper normaliza pro nome exibível.
		expect(real.administradora).toBe("ÂNCORA");
		expect(real.grupo).toBe(offers[0].grupo);
		expect(real.category).toBe("auto");
		expect(real.creditValue).toBe(offers[0].valorCarta);
		expect(real.monthlyPayment).toBe(Math.round(Number(offers[0].parcela) * 100) / 100);
	});

	// FIX-265 (menor #1, veredito Fable r5, N5): "ITAU" saía sem acento 3× na
	// copy do fecho (intro/reforço/Parabéns) — a API de parceiro devolve o
	// código cru da Bevi, sem acento. O trilho de DESCOBERTA (offer-mapper.ts,
	// FIX-255) já normalizava; o trilho de FECHAMENTO (este mapper) não.
	it("FIX-265: normaliza acento dos códigos conhecidos da Bevi (ITAU→ITAÚ, ANCORA→ÂNCORA, TRADICAO→TRADIÇÃO)", () => {
		const base = offers[0];
		expect(
			partnerOfferToRealOffer({ ...base, administradora: "ITAU" }, "AUTOS").administradora,
		).toBe("ITAÚ");
		expect(
			partnerOfferToRealOffer({ ...base, administradora: "ANCORA" }, "AUTOS").administradora,
		).toBe("ÂNCORA");
		expect(
			partnerOfferToRealOffer({ ...base, administradora: "TRADICAO" }, "AUTOS").administradora,
		).toBe("TRADIÇÃO");
	});

	it("FIX-265: nome não mapeado passa intacto (nunca inventa/mangla — nem maiúscula/minúscula muda)", () => {
		const base = offers[0];
		expect(
			partnerOfferToRealOffer({ ...base, administradora: "BANCO DO BRASIL" }, "AUTOS")
				.administradora,
		).toBe("BANCO DO BRASIL");
		expect(
			partnerOfferToRealOffer({ ...base, administradora: "RODOBENS" }, "AUTOS").administradora,
		).toBe("RODOBENS");
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

	it("segmentos pesados/outros caem nas categorias de domínio (3, FIX-363: servicos extinta)", () => {
		expect(partnerOfferToRealOffer(offers[0], "IMOVEL").category).toBe("imovel");
		expect(partnerOfferToRealOffer(offers[0], "MOTOS").category).toBe("moto");
		expect(partnerOfferToRealOffer(offers[0], "PESADOS").category).toBe("auto");
		expect(partnerOfferToRealOffer(offers[0], "OUTROS BENS").category).toBe("auto");
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

	// FIX-240 (rodada 2, Fable r1, D5.1): pedido 120k → recomendada ITAÚ 150k →
	// no contract-submit a real_offer veio 211.258 (41% acima), SEM aviso —
	// oferta vinculante fora da faixa pedida (CDC art. 30). Decisão do Kairo:
	// clamp — não escolhe carta >20% acima do pedido quando existe opção mais
	// próxima (mesmo que quebre a fidelidade de marca do
	// BUG-ADMIN-TROCADA-NO-FECHAMENTO; compliance > continuidade de marca).
	describe("clamp de faixa (FIX-240 — CDC art. 30)", () => {
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

		it("admin preferida >20% acima do pedido + opção mais próxima disponível → prefere a mais próxima", () => {
			const list = [mk("ITAU", 211_258), mk("SUNMARK", 150_000)];
			const chosen = pickClosestOffer(list, 150_000, "ITAU");
			expect(chosen?.administradora).toBe("SUNMARK");
			expect(chosen?.valorCarta).toBe(150_000);
		});

		it("admin preferida >20% acima do pedido mas SEM opção mais próxima em nenhuma marca → mantém (aviso cobre)", () => {
			const list = [mk("ITAU", 211_258)];
			const chosen = pickClosestOffer(list, 150_000, "ITAU");
			expect(chosen?.administradora).toBe("ITAU");
		});

		it("admin preferida dentro de 20% do pedido → mantém fidelidade de marca (não clampa à toa)", () => {
			const list = [mk("ITAU", 175_000), mk("SUNMARK", 150_000)];
			const chosen = pickClosestOffer(list, 150_000, "ITAU");
			expect(chosen?.administradora).toBe("ITAU");
		});

		it("sem admin preferida, closest geral já é o mais próximo — clamp não altera nada", () => {
			const list = [mk("ITAU", 211_258), mk("SUNMARK", 150_000)];
			const chosen = pickClosestOffer(list, 150_000);
			expect(chosen?.administradora).toBe("SUNMARK");
		});
	});

	// Matching preparatório (2026-06-28) — fidelidade B→A: dentro da admin preferida,
	// desempata pela proximidade de PRAZO além do valor, pra o fechamento não trocar
	// a oferta por outra de prazo bem diferente do que o usuário viu na Descoberta.
	// preferTermMonths vem de meta.recommendedOffer.termMonths (contract-input.ts).
	// ⚠️ GATED: só validável E2E quando a Bevi destravar o productId (o A não simula
	// hoje). Aqui garantimos a lógica pura, testável com fixtures.
	describe("desempate por prazo (matching preparatório)", () => {
		const mkT = (administradora: string, valorCarta: number, prazo: number): PartnerOffer =>
			({
				ofertaId: `of-${administradora}-${valorCarta}-${prazo}`,
				administradora,
				tipoOferta: "FREE_BID",
				grupo: "500",
				valorCarta,
				parcela: valorCarta / prazo,
				taxaContemplacao: 0.5,
				quotaId: `q-${valorCarta}-${prazo}`,
				prazo,
			}) as PartnerOffer;

		it("dentro da admin preferida, escolhe o prazo mais próximo do que o usuário viu", () => {
			// mesmo valor (empate por crédito) → o prazo decide; usuário viu ~80 meses
			const list = [mkT("RODOBENS", 60_000, 120), mkT("RODOBENS", 60_000, 84)];
			const chosen = pickClosestOffer(list, 60_000, "RODOBENS", 80);
			expect(chosen?.prazo).toBe(84);
		});

		it("sem preferTermMonths → desempate só por valor (retrocompatível)", () => {
			const list = [mkT("RODOBENS", 58_000, 120), mkT("RODOBENS", 60_000, 84)];
			const chosen = pickClosestOffer(list, 60_000, "RODOBENS");
			expect(chosen?.valorCarta).toBe(60_000);
		});

		it("oferta sem prazo não quebra — decide por valor", () => {
			const noTerm = mkT("RODOBENS", 60_000, 0);
			delete (noTerm as { prazo?: number }).prazo;
			const list = [noTerm, mkT("RODOBENS", 70_000, 84)];
			const chosen = pickClosestOffer(list, 60_000, "RODOBENS", 80);
			expect(chosen?.valorCarta).toBe(60_000);
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

	// BUG-PARCELA-VAZIA (auditoria adversarial Opus 2026-06-28): a pegadinha
	// `Number("") === 0` (e `Number("   ") === 0`) fazia a string VAZIA/whitespace
	// — uma forma de "ausente/ilegível" — virar parcela 0, NÃO undefined. Como
	// `monthlyPayment: parseMoney(offer.parcela)` não tem guarda `> 0` a jusante,
	// uma `parcela: ""` da API vazava "R$ 0,00" no card "Essa é a sua carta real"
	// (closing-presentation) e no resumo WhatsApp — número FALSO sem fonte, que o
	// próprio contrato da função ("ausente/ilegível → undefined, NUNCA") proíbe (D11/FIX-8).
	it("parcela '' (vazia) ou whitespace → undefined, NUNCA 0 (Number('')===0)", () => {
		const vazia = partnerOfferToRealOffer({ ...base, parcela: "" as unknown as number }, "AUTOS");
		expect(vazia.monthlyPayment).toBeUndefined();
		const branca = partnerOfferToRealOffer(
			{ ...base, parcela: "   " as unknown as number },
			"AUTOS",
		);
		expect(branca.monthlyPayment).toBeUndefined();
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

// FIX-40 (API nova Bevi 2026-06-12): a oferta de parceiro ganhou `lanceMedio` (R$
// do grupo). Era a fonte que faltava pra falar de lance com número (o FIX-8 matou o
// "lance estimado" por não existir fonte). O mapper o coloca em avgBidValue,
// defensivo (Number.isFinite e > 0); ausente/0/ilegível → undefined (NUNCA chuta).
// Captura live: proposta 6a2be7b1 → lanceMedio: 69361.27.
describe("partnerOfferToRealOffer — lance médio do grupo (API nova): avgBidValue COM fonte (FIX-40)", () => {
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

	it("lanceMedio: 69361.27 (number) → avgBidValue 69361.27", () => {
		const real = partnerOfferToRealOffer({ ...base, lanceMedio: 69361.27 }, "AUTOS");
		expect(real.avgBidValue).toBe(69361.27);
	});

	it("lanceMedio string pt-BR '69.361,27' → 69361.27 (defensivo, igual à parcela)", () => {
		const real = partnerOfferToRealOffer(
			{ ...base, lanceMedio: "69.361,27" as unknown as number },
			"AUTOS",
		);
		expect(real.avgBidValue).toBe(69361.27);
	});

	it("lanceMedio ausente (shape antigo) → avgBidValue undefined (card omite a linha)", () => {
		const real = partnerOfferToRealOffer({ ...base }, "AUTOS");
		expect(real.avgBidValue).toBeUndefined();
	});

	it("lanceMedio 0/negativo/ilegível → avgBidValue undefined, NUNCA chuta (D11)", () => {
		expect(
			partnerOfferToRealOffer({ ...base, lanceMedio: 0 }, "AUTOS").avgBidValue,
		).toBeUndefined();
		expect(
			partnerOfferToRealOffer({ ...base, lanceMedio: -1 }, "AUTOS").avgBidValue,
		).toBeUndefined();
		expect(
			partnerOfferToRealOffer({ ...base, lanceMedio: "abc" as unknown as number }, "AUTOS")
				.avgBidValue,
		).toBeUndefined();
	});
});

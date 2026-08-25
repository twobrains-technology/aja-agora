/**
 * Recarregar a página do anúncio não é chegar de novo.
 *
 * A regra anterior era "chegou com campanha na URL → visita nova, sempre".
 * A intenção estava certa (o criativo que traz a pessoa de volta precisa de
 * crédito) e o efeito, não: qualquer requisição repetida carregando os mesmos
 * UTMs virava uma chegada nova, porque a comparação era com um booleano — havia
 * campanha, sim ou não — e não com QUAL campanha.
 *
 * Medido em produção em 24/08/2026, já descontada a rajada de prefetch que
 * `proxy.prefetch-nao-e-chegada.test.ts` cobre: de 830 chegadas desde sábado,
 * 181 (21,8%) eram o mesmo visitante com a MESMA campanha dentro de 30 minutos.
 * Um em cada cinco "visitantes" do relatório de mídia era alguém dando refresh.
 *
 * A correção troca o booleano por uma ASSINATURA do criativo, guardada no
 * cookie. Mesmo criativo dentro da janela continua a mesma visita; criativo
 * diferente abre visita nova, que é o que a intenção original queria.
 */

import { describe, expect, it } from "vitest";
import { assinaturaDaCampanha, parseCampaignParams } from "./params";
import { decideVisit, encodeVisitCookie, parseVisitCookie, VISIT_WINDOW_MS } from "./visit-cookie";

const AGORA = 1_770_000_000_000;
const VISITA_ANTERIOR = "8f1c9c7e-4a2b-4d33-9f10-0f7d2a6b1c55";
const VISITA_NOVA = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

/** O anúncio que está no ar hoje, com o criativo que mais recebeu verba. */
const CRIATIVO_A = assinaturaDaCampanha(
	parseCampaignParams(
		new URLSearchParams("utm_source=ig&utm_medium=paid&utm_content=120250998207800104"),
	),
);

/** Outro criativo da MESMA campanha — o caso que precisa continuar separando. */
const CRIATIVO_B = assinaturaDaCampanha(
	parseCampaignParams(
		new URLSearchParams("utm_source=ig&utm_medium=paid&utm_content=120250998207770104"),
	),
);

function decidir(rawCookie: string | null, assinatura: string | null, nowMs = AGORA) {
	return decideVisit({
		rawCookie,
		assinaturaDaCampanha: assinatura,
		nowMs,
		newId: () => VISITA_NOVA,
	});
}

describe("a assinatura do criativo", () => {
	it("é nula quando não há mídia nenhuma na URL", () => {
		expect(assinaturaDaCampanha(parseCampaignParams(new URLSearchParams("")))).toBeNull();
	});

	it("separa criativos diferentes da mesma campanha", () => {
		expect(CRIATIVO_A).not.toBe(CRIATIVO_B);
	});

	it("é a mesma para a mesma URL — senão todo refresh abriria visita", () => {
		const outraLeitura = assinaturaDaCampanha(
			parseCampaignParams(
				new URLSearchParams("utm_source=ig&utm_medium=paid&utm_content=120250998207800104"),
			),
		);

		expect(outraLeitura).toBe(CRIATIVO_A);
	});

	it("cabe no cookie sem ponto — o ponto é o separador do formato", () => {
		expect(CRIATIVO_A).not.toContain(".");
		expect(CRIATIVO_A?.length).toBeLessThanOrEqual(8);
	});
});

describe("decideVisit com o mesmo criativo", () => {
	it("NÃO abre visita nova num refresh da página do anúncio", () => {
		// Este é o caso dos 181: mesma pessoa, mesmo criativo, minutos depois.
		const cookie = encodeVisitCookie(VISITA_ANTERIOR, AGORA - 60 * 1000, CRIATIVO_A);

		expect(decidir(cookie, CRIATIVO_A)).toMatchObject({
			visitId: VISITA_ANTERIOR,
			isNew: false,
		});
	});

	it("guarda a assinatura no cookie para a próxima passagem poder comparar", () => {
		const { cookieValue } = decidir(null, CRIATIVO_A);

		expect(parseVisitCookie(cookieValue)).toMatchObject({ assinatura: CRIATIVO_A });
	});

	it("preserva a assinatura quando a pessoa navega SEM os UTMs na URL", () => {
		// Segunda página da sessão: a query já não traz UTM. Se a assinatura se
		// perdesse aqui, o próximo carregamento com UTM pareceria criativo novo e
		// abriria visita — que é o defeito voltando pela porta dos fundos.
		const cookie = encodeVisitCookie(VISITA_ANTERIOR, AGORA - 60 * 1000, CRIATIVO_A);

		const { cookieValue } = decidir(cookie, null);

		expect(parseVisitCookie(cookieValue)).toMatchObject({
			visitId: VISITA_ANTERIOR,
			assinatura: CRIATIVO_A,
		});
	});
});

describe("decideVisit com criativo diferente — o crédito da mídia continua de pé", () => {
	it("abre visita nova quando a pessoa volta por OUTRO criativo, dentro da janela", () => {
		const cookie = encodeVisitCookie(VISITA_ANTERIOR, AGORA - 60 * 1000, CRIATIVO_A);

		expect(decidir(cookie, CRIATIVO_B)).toMatchObject({ visitId: VISITA_NOVA, isNew: true });
	});

	it("abre visita nova quando a chegada direta anterior vira chegada por anúncio", () => {
		const cookie = encodeVisitCookie(VISITA_ANTERIOR, AGORA - 60 * 1000);

		expect(decidir(cookie, CRIATIVO_A)).toMatchObject({ visitId: VISITA_NOVA, isNew: true });
	});

	it("abre visita nova passada a janela, mesmo com o criativo igual", () => {
		const cookie = encodeVisitCookie(VISITA_ANTERIOR, AGORA - VISIT_WINDOW_MS - 1, CRIATIVO_A);

		expect(decidir(cookie, CRIATIVO_A)).toMatchObject({ visitId: VISITA_NOVA, isNew: true });
	});
});

describe("o cookie antigo, de antes desta mudança", () => {
	it("continua sendo lido — ninguém perde a visita corrente no deploy", () => {
		const antigo = encodeVisitCookie(VISITA_ANTERIOR, AGORA - 60 * 1000);

		expect(parseVisitCookie(antigo)).toEqual({
			visitId: VISITA_ANTERIOR,
			atMs: AGORA - 60 * 1000,
			assinatura: null,
		});
	});

	it("segue a navegação sem UTM normalmente", () => {
		const antigo = encodeVisitCookie(VISITA_ANTERIOR, AGORA - 60 * 1000);

		expect(decidir(antigo, null)).toMatchObject({ visitId: VISITA_ANTERIOR, isNew: false });
	});

	it("recusa cookie com partes demais em vez de adivinhar", () => {
		expect(parseVisitCookie(`${VISITA_ANTERIOR}.${AGORA}.abc.extra`)).toBeNull();
	});
});

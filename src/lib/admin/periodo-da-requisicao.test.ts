// O período da requisição: URL > cookie > hoje.
//
// Cada caso aqui é uma das três fontes e o degrau que ela ocupa. O teste NÃO
// sobe servidor: a entrada de usuário (querystring + cabeçalho Cookie) chega
// como valor, e `agora` é injetado — que é justamente o ponto de a função ser
// pura e o cookie entrar como dado, não como `await`.

import { describe, expect, it } from "vitest";
import { diaDoNegocio } from "./periodo";
import {
	cookieDoCabecalho,
	periodoDaRequisicao,
	resolverPeriodoDaRequisicao,
} from "./periodo-da-requisicao";

/** Uma quarta-feira comum, 15h em Brasília (18h UTC). */
const AGORA = new Date("2026-08-19T18:00:00Z");

/** O par de dias do cookie no formato que o filtro grava. */
const COOKIE = "2026-08-01_2026-08-10";

describe("a precedência URL > cookie > hoje", () => {
	it("sem querystring e sem cookie, cai em HOJE", () => {
		const periodo = resolverPeriodoDaRequisicao({ agora: AGORA });

		expect(diaDoNegocio(periodo.de)).toBe("2026-08-19");
		expect(diaDoNegocio(periodo.ate)).toBe("2026-08-19");
	});

	it("o cookie vence o padrão (quem escolheu antes não volta para hoje)", () => {
		const periodo = resolverPeriodoDaRequisicao({ cookie: COOKIE, agora: AGORA });

		expect(diaDoNegocio(periodo.de)).toBe("2026-08-01");
		expect(diaDoNegocio(periodo.ate)).toBe("2026-08-10");
	});

	it("a querystring vence o cookie (link compartilhado manda o período junto)", () => {
		const periodo = resolverPeriodoDaRequisicao({
			from: "2026-07-01",
			to: "2026-07-10",
			cookie: COOKIE,
			agora: AGORA,
		});

		expect(diaDoNegocio(periodo.de)).toBe("2026-07-01");
		expect(diaDoNegocio(periodo.ate)).toBe("2026-07-10");
	});

	it("resolve campo a campo: um `from` da URL convive com o `ate` do cookie", () => {
		const periodo = resolverPeriodoDaRequisicao({
			from: "2026-07-01",
			cookie: COOKIE,
			agora: AGORA,
		});

		expect(diaDoNegocio(periodo.de)).toBe("2026-07-01");
		expect(diaDoNegocio(periodo.ate)).toBe("2026-08-10");
	});

	it("estica os dois extremos para dias inteiros, no fuso do negócio", () => {
		const periodo = resolverPeriodoDaRequisicao({
			from: "2026-08-01",
			to: "2026-08-10",
			agora: AGORA,
		});

		expect(periodo.de.toISOString()).toBe("2026-08-01T03:00:00.000Z");
		expect(periodo.ate.toISOString()).toBe("2026-08-11T02:59:59.999Z");
	});
});

describe("entrada de usuário não derruba a tela", () => {
	it("data inválida na querystring cai no cookie, não em erro", () => {
		const periodo = resolverPeriodoDaRequisicao({
			from: "ontem",
			to: "31/02/2026",
			cookie: COOKIE,
			agora: AGORA,
		});

		expect(diaDoNegocio(periodo.de)).toBe("2026-08-01");
		expect(diaDoNegocio(periodo.ate)).toBe("2026-08-10");
	});

	it("data inválida na querystring, sem cookie, cai em hoje", () => {
		const periodo = resolverPeriodoDaRequisicao({ from: "qualquer coisa", agora: AGORA });

		expect(diaDoNegocio(periodo.de)).toBe("2026-08-19");
		expect(diaDoNegocio(periodo.ate)).toBe("2026-08-19");
	});

	it("cookie malformado é tratado como ausente", () => {
		for (const lixo of ["", "abc", "2026-08-01", "2026-08-01_", "2026-13-45_2026-08-10"]) {
			const periodo = resolverPeriodoDaRequisicao({ cookie: lixo, agora: AGORA });
			expect(diaDoNegocio(periodo.de), `cookie ${JSON.stringify(lixo)}`).toBe("2026-08-19");
		}
	});

	it("aceita o ISO completo que o funil da Performance manda", () => {
		const periodo = resolverPeriodoDaRequisicao({
			from: "2026-08-01T12:00:00.000Z",
			agora: AGORA,
		});

		expect(diaDoNegocio(periodo.de)).toBe("2026-08-01");
	});
});

describe("a leitura do cabeçalho Cookie", () => {
	it("acha o cookie do período no meio de outros", () => {
		expect(cookieDoCabecalho("outro=1; aja_periodo=2026-08-01_2026-08-10; x=2")).toBe(COOKIE);
	});

	it("devolve null quando não há cookie ou não há cabeçalho", () => {
		expect(cookieDoCabecalho("outro=1")).toBeNull();
		expect(cookieDoCabecalho(null)).toBeNull();
		expect(cookieDoCabecalho("")).toBeNull();
	});

	it("não confunde um cookie cujo nome só começa igual", () => {
		expect(cookieDoCabecalho("aja_periodo_x=2026-08-01_2026-08-10")).toBeNull();
	});
});

describe("periodoDaRequisicao — a linha que as quatro rotas chamam", () => {
	function requisicao(querystring: string, cookie?: string): Request {
		return new Request(`http://localhost/api/admin/performance${querystring}`, {
			headers: cookie ? { cookie: `aja_periodo=${cookie}` } : {},
		});
	}

	it("lê a querystring da URL e o cookie do cabeçalho", () => {
		const comUrl = periodoDaRequisicao(requisicao("?from=2026-07-01&to=2026-07-10", COOKIE));
		expect(diaDoNegocio(comUrl.de)).toBe("2026-07-01");
		expect(diaDoNegocio(comUrl.ate)).toBe("2026-07-10");

		const soComCookie = periodoDaRequisicao(requisicao("", COOKIE));
		expect(diaDoNegocio(soComCookie.de)).toBe("2026-08-01");
		expect(diaDoNegocio(soComCookie.ate)).toBe("2026-08-10");
	});

	it("ignora os outros parâmetros da rota (path, device, desfecho)", () => {
		const periodo = periodoDaRequisicao(
			requisicao("?path=%2Fautos&device=mobile&desfecho=lead&from=2026-07-01&to=2026-07-02"),
		);

		expect(diaDoNegocio(periodo.de)).toBe("2026-07-01");
		expect(diaDoNegocio(periodo.ate)).toBe("2026-07-02");
	});
});

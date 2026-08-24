// O período do painel, no fuso do negócio.
//
// Cada caso aqui é uma armadilha que já estava no código e que só ficaria
// visível depois de o painel passar a abrir em HOJE — com trinta dias de janela
// nenhuma delas aparecia, e é isso que as torna caras: elas esperam a janela
// encolher para estragar o número.

import { describe, expect, it } from "vitest";
import {
	diaDoNegocio,
	fimDoDia,
	inicioDoDia,
	instanteDoParametro,
	periodoPadrao,
	resolverPeriodo,
} from "./periodo";

/** Uma quarta-feira comum, 15h em Brasília (18h UTC). */
const TARDE = new Date("2026-08-19T18:00:00Z");

/** 22h em Brasília — já é o dia SEGUINTE em UTC. */
const NOITE = new Date("2026-08-20T01:00:00Z");

describe("o dia do negócio", () => {
	it("não vira amanhã às 22h de Brasília, que é quando alguém fecha o dia", () => {
		// `toISOString().slice(0, 10)` diria 20/08 aqui, e o painel mostraria o
		// movimento de "hoje" numa tela rotulada com a data de amanhã.
		expect(diaDoNegocio(NOITE)).toBe("2026-08-19");
		expect(diaDoNegocio(TARDE)).toBe("2026-08-19");
	});
});

describe("as bordas do dia", () => {
	it("começa à meia-noite local, que são 3h em UTC", () => {
		expect(inicioDoDia(TARDE).toISOString()).toBe("2026-08-19T03:00:00.000Z");
	});

	it("termina no ÚLTIMO milissegundo do dia, não na meia-noite dele", () => {
		// Esta é a armadilha 2: `ate` colava na meia-noite do último dia, então
		// quem pedia "01/08 a 19/08" recebia até 18/08 às 21h. Um dia e três horas
		// sumiam calados — e numa janela de um dia sumiria o dia inteiro.
		expect(fimDoDia(TARDE).toISOString()).toBe("2026-08-20T02:59:59.999Z");
	});

	it("cobre o dia inteiro sem buraco nem sobreposição com o dia seguinte", () => {
		const seguinte = inicioDoDia(new Date("2026-08-20T18:00:00Z"));
		expect(fimDoDia(TARDE).getTime() + 1).toBe(seguinte.getTime());
	});
});

describe("dia solto vindo da querystring", () => {
	it("não escorrega para o dia anterior", () => {
		// `new Date("2026-08-19")` é meia-noite UTC — 18/08 às 21h no Brasil. Sem a
		// âncora ao meio-dia, todo dia escolhido no calendário voltava um dia na
		// releitura, na tela e na consulta.
		expect(diaDoNegocio(instanteDoParametro("2026-08-19") as Date)).toBe("2026-08-19");
		expect(diaDoNegocio(new Date("2026-08-19"))).toBe("2026-08-18");
	});

	it("aceita também o ISO completo que o funil da Performance manda para o Percurso", () => {
		const instante = instanteDoParametro("2026-08-19T18:00:00.000Z");
		expect(diaDoNegocio(instante as Date)).toBe("2026-08-19");
	});

	it("devolve null para o que não é data, em vez de inventar uma", () => {
		expect(instanteDoParametro("ontem")).toBeNull();
	});
});

describe("o período padrão", () => {
	it("é HOJE inteiro — do primeiro ao último milissegundo do dia", () => {
		const { de, ate } = periodoPadrao(TARDE);

		expect(de.toISOString()).toBe("2026-08-19T03:00:00.000Z");
		expect(ate.toISOString()).toBe("2026-08-20T02:59:59.999Z");
	});

	it("continua sendo o dia CORRENTE às 22h, e não o de amanhã", () => {
		const { de } = periodoPadrao(NOITE);
		expect(diaDoNegocio(de)).toBe("2026-08-19");
	});
});

describe("resolver o que veio na URL", () => {
	it("estica os dois extremos para dias inteiros", () => {
		const periodo = resolverPeriodo("2026-08-01", "2026-08-19", TARDE);

		expect(periodo?.de.toISOString()).toBe("2026-08-01T03:00:00.000Z");
		expect(periodo?.ate.toISOString()).toBe("2026-08-20T02:59:59.999Z");
	});

	it("um dia só é uma janela de um dia, não um instante", () => {
		// Sem isto, "hoje" seria `de === ate` e a tela abriria vazia — o defeito
		// pareceria ser da métrica recém-corrigida.
		const periodo = resolverPeriodo("2026-08-19", "2026-08-19", TARDE);

		expect(periodo?.ate.getTime()).toBeGreaterThan(periodo?.de.getTime() as number);
		expect((periodo?.ate.getTime() as number) - (periodo?.de.getTime() as number)).toBe(
			24 * 60 * 60 * 1000 - 1,
		);
	});

	it("sem parâmetro nenhum, cai no padrão — hoje", () => {
		expect(resolverPeriodo(null, null, TARDE)).toEqual(periodoPadrao(TARDE));
	});

	it("recusa data inválida em vez de silenciosamente mostrar outro período", () => {
		expect(resolverPeriodo("qualquer coisa", null, TARDE)).toBeNull();
		expect(resolverPeriodo(null, "31/02/2026", TARDE)).toBeNull();
	});
});

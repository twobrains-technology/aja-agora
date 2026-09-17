// O período do painel, no fuso do negócio.
//
// Cada caso aqui é uma armadilha que já estava no código e que só ficaria
// visível depois de o painel passar a abrir em HOJE — com trinta dias de janela
// nenhuma delas aparecia, e é isso que as torna caras: elas esperam a janela
// encolher para estragar o número.

import { describe, expect, it } from "vitest";
import {
	diaComoData,
	diaDeHoje,
	diaDoNegocio,
	diaDoParametro,
	diasDoCookie,
	diasDoPeriodo,
	fimDoDia,
	inicioDoDia,
	instanteDoParametro,
	type Periodo,
	periodoPadrao,
	resolverPeriodo,
	serializarPeriodoDoCookie,
	TZ_NEGOCIO,
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

describe("o padrão deixou de ser sempre hoje e virou ARGUMENTO", () => {
	// É por aqui que o cookie entra na resolução sem quebrar a pureza da função:
	// ele chega como VALOR pronto, nunca como `await` lá dentro.
	const doCookie: Periodo = {
		de: inicioDoDia(diaComoData("2026-08-01")),
		ate: fimDoDia(diaComoData("2026-08-10")),
	};

	it("usa o padrão passado quando a URL não traz nada", () => {
		expect(resolverPeriodo(null, null, TARDE, doCookie)).toEqual(doCookie);
	});

	it("a URL presente vence o padrão do cookie", () => {
		const periodo = resolverPeriodo("2026-07-01", "2026-07-02", TARDE, doCookie);

		expect(diaDoNegocio(periodo?.de as Date)).toBe("2026-07-01");
		expect(diaDoNegocio(periodo?.ate as Date)).toBe("2026-07-02");
	});

	it("sem o argumento, continua em hoje — nenhum chamador antigo muda", () => {
		expect(resolverPeriodo(null, null, TARDE)).toEqual(periodoPadrao(TARDE));
	});
});

describe("o cookie do período", () => {
	it("guarda e devolve o mesmo par de DIAS", () => {
		const valor = serializarPeriodoDoCookie(diaComoData("2026-08-01"), diaComoData("2026-08-10"));

		expect(valor).toBe("2026-08-01_2026-08-10");
		expect(diasDoCookie(valor)).toEqual({ de: "2026-08-01", ate: "2026-08-10" });
	});

	it("não deixa o dia escorregar, porque guarda o DIA e não o instante", () => {
		const periodo = periodoPadrao(TARDE);
		const valor = serializarPeriodoDoCookie(periodo.de, periodo.ate);

		// O `ate` é 2026-08-20T02:59Z — se o cookie guardasse o instante, a ida e
		// volta o traria como 20/08. O dia do negócio é que importa.
		expect(diasDoCookie(valor)).toEqual({ de: "2026-08-19", ate: "2026-08-19" });
	});

	it("devolve null para o que não é par de dias válido", () => {
		expect(diasDoCookie(null)).toBeNull();
		expect(diasDoCookie("")).toBeNull();
		expect(diasDoCookie("2026-08-01")).toBeNull();
		expect(diasDoCookie("2026-02-31_2026-08-10")).toBeNull();
	});
});

describe("o dia que um parâmetro representa", () => {
	it("aceita o dia puro e o ISO completo, e devolve o dia do negócio", () => {
		expect(diaDoParametro("2026-08-19")).toBe("2026-08-19");
		expect(diaDoParametro("2026-08-19T23:00:00.000Z")).toBe("2026-08-19");
	});

	it("devolve null para vazio e para o que não é data", () => {
		expect(diaDoParametro(null)).toBeNull();
		expect(diaDoParametro(undefined)).toBeNull();
		expect(diaDoParametro("ontem")).toBeNull();
		expect(diaDoParametro("2026-02-31")).toBeNull();
	});

	it("`diasDoPeriodo` é o par de dias de um período de instantes", () => {
		expect(diasDoPeriodo(diaComoData("2026-08-01"), diaComoData("2026-08-10"))).toEqual({
			de: "2026-08-01",
			ate: "2026-08-10",
		});
	});
});

describe("o valor que o FILTRO mostra", () => {
	// Esta seção nasceu de um defeito visto na tela, em produção, com typecheck e
	// 3.445 testes verdes: o campo "Até" saía do servidor escrito 25/08 e o
	// navegador o reescrevia como 24/08 na hidratação. A causa foi usar o
	// INSTANTE de fim de dia como valor do campo — 23:59:59.999 em Brasília é
	// 02:59 UTC do dia seguinte, e o Next renderiza a página num processo UTC.
	it("é o mesmo dia lido em UTC e em Brasília — servidor e navegador concordam", () => {
		const hoje = diaDeHoje(NOITE);

		expect(hoje.toLocaleDateString("en-CA", { timeZone: "UTC" })).toBe("2026-08-19");
		expect(hoje.toLocaleDateString("en-CA", { timeZone: TZ_NEGOCIO })).toBe("2026-08-19");
	});

	it("o FIM do dia não serve como valor de campo, e é por isso que existem os dois", () => {
		// Deixado explícito para que ninguém "simplifique" o filtro de volta para
		// `periodoPadrao().ate`: o instante está certo para CONSULTAR e errado para
		// MOSTRAR.
		const fim = periodoPadrao(TARDE).ate;

		expect(fim.toLocaleDateString("en-CA", { timeZone: TZ_NEGOCIO })).toBe("2026-08-19");
		expect(fim.toLocaleDateString("en-CA", { timeZone: "UTC" })).toBe("2026-08-20");
	});
});

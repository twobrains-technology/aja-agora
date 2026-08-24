// O contrato do dia na querystring.
//
// O caso do meio é o que importa e o que o parser anterior errava sem avisar:
// `parseAsIsoDate` PASSA no teste de bijeção — a string entra e sai igual —
// enquanto devolve uma data que, no fuso do Brasil, é o dia anterior. Bijeção
// prova que o link sobrevive à ida e volta; ela não prova que o dia está certo.
// Por isso os dois testes convivem aqui.

import { testParseThenSerialize } from "nuqs/testing";
import { describe, expect, it } from "vitest";
import { diaDoNegocio } from "./periodo";
import { parseAsDiaDoNegocio } from "./periodo-querystring";

describe("o dia na querystring", () => {
	it("sobrevive à ida e volta — link compartilhado abre no mesmo dia", () => {
		expect(testParseThenSerialize(parseAsDiaDoNegocio, "2026-08-19")).toBe(true);
		expect(testParseThenSerialize(parseAsDiaDoNegocio, "2026-01-01")).toBe(true);
		expect(testParseThenSerialize(parseAsDiaDoNegocio, "2026-12-31")).toBe(true);
	});

	it("devolve uma data que É aquele dia no fuso do negócio", () => {
		// O defeito antigo: `new Date("2026-08-19")` é meia-noite UTC, ou seja,
		// 18/08 às 21h em Brasília. A tela lia 18, a consulta lia 18, e a URL
		// continuava dizendo 19.
		const data = parseAsDiaDoNegocio.parse("2026-08-19");
		expect(data).not.toBeNull();
		expect(diaDoNegocio(data as Date)).toBe("2026-08-19");
	});

	it("escreve o dia do negócio, e não o dia em UTC", () => {
		// 22h de Brasília já é o dia seguinte em UTC. Serializar com
		// `toISOString().slice(0, 10)` mandaria o operador para amanhã justamente
		// na hora em que ele fecha o dia.
		expect(parseAsDiaDoNegocio.serialize(new Date("2026-08-20T01:00:00Z"))).toBe("2026-08-19");
	});

	it("não aceita lixo como data", () => {
		expect(parseAsDiaDoNegocio.parse("ontem")).toBeNull();
	});
});

// O contrato de `?campanha=a,b,c` — a entrada crua virando lista limpa.
//
// O caso que este arquivo protege é o da LISTA VAZIA. Ela parece "filtro vazio"
// e é, na verdade, "sem filtro": o `inArray` do Drizzle traduz lista vazia para
// `false`, então deixá-la passar até o SQL esconderia todas as conversas. O
// lugar de barrar isso é aqui, antes do predicado.

import { describe, expect, it } from "vitest";
import { campanhasParaParametro, normalizarCampanhas, semCampanhas } from "./campanhas";

describe("normalizarCampanhas", () => {
	it("aceita a lista da querystring separada por vírgula", () => {
		expect(normalizarCampanhas("camp-1,camp-2")).toEqual(["camp-1", "camp-2"]);
	});

	it("aceita uma campanha só — o formato de antes continua valendo", () => {
		expect(normalizarCampanhas("camp-1")).toEqual(["camp-1"]);
	});

	it("aceita o array que o nuqs já separou", () => {
		expect(normalizarCampanhas(["camp-1", "camp-2"])).toEqual(["camp-1", "camp-2"]);
	});

	it("tira espaço, vazio e repetição", () => {
		expect(normalizarCampanhas(" camp-1 , , camp-2 ,camp-1")).toEqual(["camp-1", "camp-2"]);
	});

	it("lista vazia (null, undefined, '' ou []) vira array vazio", () => {
		expect(normalizarCampanhas(null)).toEqual([]);
		expect(normalizarCampanhas(undefined)).toEqual([]);
		expect(normalizarCampanhas("")).toEqual([]);
		expect(normalizarCampanhas([])).toEqual([]);
	});
});

describe("semCampanhas", () => {
	it("diz que a lista vazia é 'sem filtro'", () => {
		expect(semCampanhas(null)).toBe(true);
		expect(semCampanhas([])).toBe(true);
		expect(semCampanhas(" , ")).toBe(true);
	});

	it("diz que uma campanha escolhida é filtro", () => {
		expect(semCampanhas(["camp-1"])).toBe(false);
		expect(semCampanhas("camp-1,camp-2")).toBe(false);
	});
});

describe("campanhasParaParametro", () => {
	it("junta a lista num parâmetro só", () => {
		expect(campanhasParaParametro(["camp-1", "camp-2"])).toBe("camp-1,camp-2");
	});

	it("devolve null — e não string vazia — quando não há campanha", () => {
		// `null` é o que REMOVE o parâmetro da URL; `""` escreveria `?campanha=`.
		expect(campanhasParaParametro([])).toBeNull();
		expect(campanhasParaParametro(null)).toBeNull();
	});
});

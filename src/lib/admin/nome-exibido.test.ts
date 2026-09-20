// F2 / AJA-02 — vocabulário único de "quem é esta pessoa" (unit, puro).
//
// O que este arquivo protege: as três telas do admin não podem responder à mesma
// pergunta com três textos diferentes ("Sem nome ainda" / "—" / "Anônimo d1c7"),
// e nenhum deles pode esconder que o dado não existe.

import { describe, expect, it } from "vitest";
import { nomeExibido } from "./nome-exibido";

const ID = "d1c7e2a4-9f31-4b6e-8a2c-77f0c1e5b9d3";

describe("nomeExibido — principal", () => {
	it("usa o nome quando existe", () => {
		expect(nomeExibido({ nome: "Maria Graciete", telefone: "83998769307" }).principal).toBe(
			"Maria Graciete",
		);
	});

	it("cai em 'Sem nome' quando não há nome — nunca em '—' nem 'Anônimo'", () => {
		const r = nomeExibido({ nome: null, telefone: "83998769307" });
		expect(r.principal).toBe("Sem nome");
		expect(r.principal).not.toBe("—");
		expect(r.principal.toLowerCase()).not.toContain("anônimo");
		expect(r.principal.toLowerCase()).not.toContain("anonimo");
	});

	it("nome só de espaços em branco é ausência de nome", () => {
		expect(nomeExibido({ nome: "   " }).principal).toBe("Sem nome");
	});
});

describe("nomeExibido — secundário", () => {
	it("mascara o telefone como a Régua: DDD e os últimos quatro dígitos", () => {
		expect(nomeExibido({ nome: null, telefone: "83998769307" }).secundario).toBe("(83) 9...-9307");
	});

	it("corta o código de país (55) antes de mascarar — o DDD não vira '55'", () => {
		expect(nomeExibido({ nome: "Ana", telefone: "5583998769307" }).secundario).toBe(
			"(83) 9...-9307",
		);
	});

	it("telefone inválido/curto não vira máscara mentirosa: cai no id curto", () => {
		expect(nomeExibido({ nome: null, telefone: "1234", id: ID }).secundario).toBe("d1c7");
	});

	it("sem telefone, mostra o começo do id", () => {
		expect(nomeExibido({ nome: "Helena", telefone: null, id: ID }).secundario).toBe("d1c7");
	});

	it("nem telefone nem id → vazio (e não um travessão)", () => {
		const r = nomeExibido({ nome: null, telefone: null, id: null });
		expect(r.secundario).toBe("");
		expect(r).toEqual({ principal: "Sem nome", secundario: "" });
	});

	it("telefone tem precedência sobre o id quando os dois existem", () => {
		expect(nomeExibido({ nome: "Ana", telefone: "83998769307", id: ID }).secundario).toBe(
			"(83) 9...-9307",
		);
	});
});

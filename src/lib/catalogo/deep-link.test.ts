import { describe, expect, it } from "vitest";

import { CREDITO_MINIMO_PADRAO } from "@/lib/consorcio/credito-minimo";

import { lerValorDoBem } from "./deep-link";

describe("lerValorDoBem", () => {
	const params = (qs: string) => new URLSearchParams(qs);

	it("lê o valor que o item do catálogo mandou", () => {
		expect(lerValorDoBem(params("bem=50000"))).toBe(50_000);
	});

	it("aceita o valor formatado que alguém cola da barra de endereço", () => {
		expect(lerValorDoBem(params("bem=50.000"))).toBe(50_000);
		expect(lerValorDoBem(params("bem=R%24%2050.000"))).toBe(50_000);
	});

	it("também lê do formato que o server component entrega", () => {
		expect(lerValorDoBem({ bem: "80000" })).toBe(80_000);
		expect(lerValorDoBem({ bem: ["80000", "1"] })).toBe(80_000);
	});

	it("ignora link sem o parâmetro — a landing abre normal", () => {
		expect(lerValorDoBem(params(""))).toBeNull();
		expect(lerValorDoBem(params("utm_source=meta"))).toBeNull();
		expect(lerValorDoBem({})).toBeNull();
	});

	it("recusa lixo em vez de semear a conversa com número errado", () => {
		expect(lerValorDoBem(params("bem=abacaxi"))).toBeNull();
		expect(lerValorDoBem(params("bem="))).toBeNull();
		expect(lerValorDoBem(params("bem=-500"))).toBeNull();
	});

	it("recusa valor abaixo do piso que a Bevi busca", () => {
		expect(lerValorDoBem(params(`bem=${CREDITO_MINIMO_PADRAO - 1}`))).toBeNull();
		expect(lerValorDoBem(params(`bem=${CREDITO_MINIMO_PADRAO}`))).toBe(CREDITO_MINIMO_PADRAO);
	});

	it("recusa número absurdo — entrada de terceiro não vira fala do cliente", () => {
		expect(lerValorDoBem(params("bem=999999999999"))).toBeNull();
	});
});

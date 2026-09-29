// O cadastro dos custos — o que vale provar sem banco.
//
// A lei: valor ausente ou corrompido é `null` ("não calculável"), NUNCA zero.

import { describe, expect, it } from "vitest";
import {
	CHAVE_DA_COTACAO,
	CHAVE_DO_PRECO_DA_MENSAGEM,
	cotacaoDoCadastro,
	montarCustosDoCadastro,
	precoEmCentavosDoCadastro,
} from "./custos-do-cadastro";

describe("cotação do dólar no cadastro", () => {
	it("aceita decimal com ponto ou vírgula", () => {
		expect(cotacaoDoCadastro("5.45")).toBe(5.45);
		expect(cotacaoDoCadastro(" 5,45 ")).toBe(5.45);
	});

	it("ausente, texto ou zero é null — nunca zero", () => {
		expect(cotacaoDoCadastro(null)).toBeNull();
		expect(cotacaoDoCadastro(undefined)).toBeNull();
		expect(cotacaoDoCadastro("")).toBeNull();
		expect(cotacaoDoCadastro("cinco")).toBeNull();
		expect(cotacaoDoCadastro("0")).toBeNull();
		expect(cotacaoDoCadastro("-5")).toBeNull();
	});
});

describe("preço da mensagem no cadastro", () => {
	it("aceita inteiro em centavos", () => {
		expect(precoEmCentavosDoCadastro("12")).toBe(12);
		expect(precoEmCentavosDoCadastro(" 8 ")).toBe(8);
	});

	it("decimal, texto ou negativo é null — o preço é em centavos inteiros", () => {
		expect(precoEmCentavosDoCadastro("0.12")).toBeNull();
		expect(precoEmCentavosDoCadastro("grátis")).toBeNull();
		expect(precoEmCentavosDoCadastro("-1")).toBeNull();
		expect(precoEmCentavosDoCadastro(null)).toBeNull();
	});
});

describe("montarCustosDoCadastro", () => {
	it("lê as duas chaves quando existem", () => {
		expect(
			montarCustosDoCadastro([
				{ chave: CHAVE_DA_COTACAO, valor: "5.45" },
				{ chave: CHAVE_DO_PRECO_DA_MENSAGEM, valor: "12" },
			]),
		).toEqual({ cotacaoUsdBrl: 5.45, precoMensagemCents: 12 });
	});

	it("banco sem as chaves ⇒ os dois null (não calculável, não zero)", () => {
		expect(montarCustosDoCadastro([])).toEqual({
			cotacaoUsdBrl: null,
			precoMensagemCents: null,
		});
	});

	it("chave desconhecida é ignorada, não explode", () => {
		expect(montarCustosDoCadastro([{ chave: "outra_coisa", valor: "1" }])).toEqual({
			cotacaoUsdBrl: null,
			precoMensagemCents: null,
		});
	});
});

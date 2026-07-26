// FIX-378 — o número que o cliente disse não pode virar outro número.
//
// Visto ao vivo (Kairo, 2026-07-26): o cliente escreveu "100 reais". O agente
// respondeu "você deve ter querido dizer R$ 100.000,00, certo?"; o cliente
// corrigiu ("foi 100 reais mesmo") — e o estado guardou R$ 1.000,00. Dez vezes
// o que ele falou, sem que ninguém tivesse dito aquele número.
//
// Esse valor virou `creditMax` e disparou a corrente do FIX-377 (busca abaixo
// do piso → vazio → loop). Ou seja: não é só cosmético, é o gatilho.
//
// A checagem é ANCORAGEM, não adivinhação de intenção: o valor extraído tem que
// ser derivável dos números que estão no texto. Não cabe ao guard decidir se o
// cliente quis dizer outra coisa — cabe recusar o que ele NÃO disse.
import { describe, expect, it } from "vitest";
import { valorAncoradoNoTexto } from "./valor-declarado";

describe("FIX-378 — valor extraído tem que estar ancorado na fala do cliente", () => {
	it("recusa o valor inflado que ninguém disse (o bug real)", () => {
		expect(valorAncoradoNoTexto("100 reais", 1_000)).toBe(false);
		expect(valorAncoradoNoTexto("uai, falei que só podia pagar 100 reais por mês", 1_000)).toBe(
			false,
		);
		// A inflação clássica: transformar reais em milhares por conta própria.
		expect(valorAncoradoNoTexto("100 reais", 100_000)).toBe(false);
	});

	it("aceita o valor exatamente como foi dito", () => {
		expect(valorAncoradoNoTexto("100 reais", 100)).toBe(true);
		expect(valorAncoradoNoTexto("quero um carro de uns 180 mil", 180_000)).toBe(true);
		expect(valorAncoradoNoTexto("uns 90 mil", 90_000)).toBe(true);
		expect(valorAncoradoNoTexto("200k", 200_000)).toBe(true);
		expect(valorAncoradoNoTexto("R$ 1.200,50 por mês", 1200.5)).toBe(true);
		expect(valorAncoradoNoTexto("entre 100 e 200 mil", 200_000)).toBe(true);
	});

	it("é permissivo quando o texto não traz número", () => {
		// O valor pode ter vindo do slider (`value_picker`), de um card ou de um
		// turno anterior. Bloquear aqui quebraria o fluxo legítimo — o guard só
		// existe pra pegar CONTRADIÇÃO entre o que foi dito e o que foi gravado.
		expect(valorAncoradoNoTexto("pode ser esse mesmo", 180_000)).toBe(true);
		expect(valorAncoradoNoTexto("", 50_000)).toBe(true);
		expect(valorAncoradoNoTexto("quero um carro novo", 90_000)).toBe(true);
	});

	it("tolera a escrita de dinheiro do dia a dia", () => {
		expect(valorAncoradoNoTexto("R$ 180.339", 180_339)).toBe(true);
		expect(valorAncoradoNoTexto("180.000,00", 180_000)).toBe(true);
		expect(valorAncoradoNoTexto("uns 250 milhões", 250_000_000)).toBe(true);
		// "mil" grudado no número, sem espaço.
		expect(valorAncoradoNoTexto("90mil", 90_000)).toBe(true);
	});
});

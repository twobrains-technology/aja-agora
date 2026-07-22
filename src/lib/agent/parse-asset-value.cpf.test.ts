// Um CPF escrito no formato brasileiro é indistinguível de um valor monetário:
// "529.982.247-25" casa com a regra de separador de milhar (o "-25" do dígito
// verificador conta como fronteira de palavra) e vira R$ 529.982.247.
//
// Aconteceu ao vivo: a cliente mandou nome + CPF + celular numa frase só, a
// busca rodou com meio bilhão de crédito, e ela recebeu na tela 15 grupos com
// cartas de R$ 530 MILHÕES. Nenhum teste pegava — não havia teste nenhum sobre
// este parser, que é justamente quem decide o alvo da busca a partir de texto
// livre do cliente.

import { describe, expect, it } from "vitest";
import { parseAssetValue } from "./parse-asset-value";

describe("parseAssetValue — CPF nunca é dinheiro", () => {
	it.each([
		"Patrícia Almeida, CPF 529.982.247-25, celular 62 99188-4422",
		"meu cpf e 529.982.247-25",
		"529.982.247-25",
		"52998224725",
		"segue: 529982247-25",
	])("não extrai valor de %j", (texto) => {
		expect(parseAssetValue(texto)).toBeNull();
	});

	// A blindagem não pode custar os valores de verdade — é o mesmo texto livre
	// que carrega o que o cliente quer gastar.
	it.each([
		["quero um apartamento de 350.000", 350_000],
		["uns 250 mil", 250_000],
		["R$ 120.000", 120_000],
		["1,5 milhao", 1_500_000],
		["um carro de 80 mil", 80_000],
	] as const)("continua lendo %j como %i", (texto, esperado) => {
		expect(parseAssetValue(texto)).toBe(esperado);
	});

	it("lê o valor mesmo quando o CPF vem na MESMA frase", () => {
		// O cliente costuma mandar tudo junto; sumir com o CPF não pode sumir com
		// o que ele pediu.
		expect(parseAssetValue("CPF 529.982.247-25, quero uma carta de 350.000")).toBe(350_000);
	});
});

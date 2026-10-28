// DOIS CASOS REAIS MANDAM NESTE TESTE.
//
// 1. Print 13 (27/10 22:35): *"Ela tem prazo mais curto que a de 94 meses da ÂNCORA"* sobre a
//    carta de 96 meses. 96 > 94, então a fala estava errada. Ordem do líder: "comparação de
//    prazo/parcela tem de bater com os números das cartas na mesa".
// 2. Conversa de teste (28/10, depois do `9f5ccecf`): *"a da CANOPUS com parcela de R$ 1.176,39 …
//    com maior prazo que a da ÂNCORA de 114 meses"*. A CANOPUS dessa parcela tem 96 meses, a
//    ÂNCORA tem 114 — "maior" é falso. A primeira versão tomava a primeira carta da tela como
//    sujeito e deixou passar; o sujeito é a carta que a PRÓPRIA FALA cita.
//
// As cartas abaixo são as quatro que a ferramenta devolveu naquela conversa (lidas do banco).

import { describe, expect, it } from "vitest";
import {
	corrigirComparacaoDeParcela,
	corrigirComparacaoDePrazo,
	corrigirComparacoes,
	semPrazoInventado,
} from "./comparacao-de-prazo";

const MESA = {
	cartasDaMesa: [
		{ administradora: "ÂNCORA", parcela: 1099.62, prazoMeses: 114 },
		{ administradora: "ÂNCORA", parcela: 1454.51, prazoMeses: 94 },
		{ administradora: "CANOPUS", parcela: 1176.39, prazoMeses: 96 },
		{ administradora: "CANOPUS", parcela: 1181.33, prazoMeses: 116 },
	],
};

describe("comparação de prazo com o número da mesa", () => {
	it("o caso medido hoje: CANOPUS de 96 não tem MAIOR prazo que a ÂNCORA de 114", () => {
		const dito =
			"A minha recomendação para você é a da CANOPUS com parcela de R$ 1.176,39: é um meio-termo bom, com maior prazo que a da ÂNCORA de 114 meses e uma parcela bem acessível.";
		const saida = corrigirComparacaoDePrazo(dito, MESA);
		expect(saida).not.toMatch(/maior\s+prazo\s+que/i);
		expect(saida).toMatch(/menor\s+prazo\s+que\s+a\s+da\s+ÂNCORA\s+de\s+114\s+meses/i);
		// o resto da fala não muda
		expect(saida).toContain("parcela de R$ 1.176,39");
		expect(saida).toContain("uma parcela bem acessível");
	});

	it("a frase do print 13 vira a verdade: 96 é MAIS LONGO que 94", () => {
		const dito =
			"A da CANOPUS com parcela de R$ 1.176,39 é a que eu recomendo. Ela tem prazo mais curto que a de 94 meses da ÂNCORA.";
		const saida = corrigirComparacaoDePrazo(dito, MESA);
		expect(saida).toContain("mais longo");
		expect(saida).not.toContain("mais curto");
		expect(saida).toContain("94 meses");
	});

	it("a direção certa passa intacta", () => {
		for (const dito of [
			"A da CANOPUS com parcela de R$ 1.176,39 tem prazo mais curto que a de 114 meses.",
			"A de 116 tem prazo mais longo que a de 94 meses.",
			"A de R$ 1.454,51 tem prazo menor que a de R$ 1.099,62.",
		]) {
			expect(corrigirComparacaoDePrazo(dito, MESA), dito).toBe(dito);
		}
	});

	it("duas cartas citadas só pela parcela também são conferidas", () => {
		const errado = "A de R$ 1.454,51 tem prazo maior que a de R$ 1.099,62.";
		const saida = corrigirComparacaoDePrazo(errado, MESA);
		expect(saida).toMatch(/menor\s+prazo/i);
		expect(saida).not.toMatch(/prazo\s+maior|maior\s+prazo/i);
	});

	it("prazo que não é de carta nenhuma da mesa não sustenta comparação", () => {
		const dito = "A da CANOPUS com parcela de R$ 1.176,39 tem prazo mais curto que a de 84 meses.";
		const saida = corrigirComparacaoDePrazo(dito, MESA);
		expect(saida).not.toMatch(/mais\s+curto/i);
		expect(saida).not.toContain("84 meses");
	});

	it("sem saber de quem se fala, não afirma direção nenhuma", () => {
		// "Ela" sem nenhuma carta citada antes: não há sujeito para conferir.
		const dito = "Ela tem prazo mais curto que a de 94 meses.";
		const saida = corrigirComparacaoDePrazo(dito, MESA);
		expect(saida).not.toMatch(/mais\s+curto/i);
	});

	it("frase sem comparativo de prazo não é tocada", () => {
		const dito = "A carta é de R$ 90 mil, parcela de R$ 1.176,39 em 96 meses.";
		expect(corrigirComparacaoDePrazo(dito, MESA)).toBe(dito);
	});

	it("'menor prazo' segue a mesma régua", () => {
		const dito = "A da CANOPUS com parcela de R$ 1.176,39 tem menor prazo que a de 94 meses.";
		const saida = corrigirComparacaoDePrazo(dito, MESA);
		expect(saida).toContain("maior prazo");
	});
});

describe("o turno aplica a régua — o balão que vai à tela", () => {
	it("montarTrechoDeSaida corrige a comparação com as cartas da mesa", async () => {
		const { montarTrechoDeSaida } = await import("./turno-livre");
		const saida = montarTrechoDeSaida({
			texto:
				"É a da CANOPUS com parcela de R$ 1.176,39: um meio-termo bom, com maior prazo que a da ÂNCORA de 114 meses.",
			cardsDoTurno: [],
			temCartaNaTela: true,
			...MESA,
		});
		expect(saida.texto).not.toMatch(/maior\s+prazo\s+que/i);
		expect(saida.texto).toMatch(/menor\s+prazo\s+que\s+a\s+da\s+ÂNCORA/i);
	});
});

describe("comparação de PARCELA com o número da mesa", () => {
	it("o caso medido: a ÂNCORA de 94 meses NÃO tem parcela menor que a outra da ÂNCORA", () => {
		// Fala real da conversa de teste de 28/10 (a segunda frase herda a carta da primeira).
		const dito =
			"A de menor prazo é a da ÂNCORA, com 94 meses. Ela é a minha recomendação para você também, pois tem o menor prazo e parcela menor que a outra da ÂNCORA.";
		const saida = corrigirComparacaoDeParcela(dito, MESA);
		expect(saida).not.toMatch(/parcela\s+menor/i);
		// A afirmação verdadeira da mesma frase fica.
		expect(saida).toContain("pois tem o menor prazo");
		expect(saida).toContain("com 94 meses");
	});

	it("parcela maior dita sobre a carta de parcela maior passa intacta", () => {
		const dito =
			"A da ÂNCORA com 94 meses tem parcela maior que a outra da ÂNCORA.";
		expect(corrigirComparacaoDeParcela(dito, MESA)).toBe(dito);
	});

	it("direção verificável e trocada vira a verdade", () => {
		const dito = "A de R$ 1.099,62 tem parcela maior que a de R$ 1.454,51.";
		expect(corrigirComparacaoDeParcela(dito, MESA)).toBe(
			"A de R$ 1.099,62 tem parcela menor que a de R$ 1.454,51.",
		);
		const barata = "A de R$ 1.454,51 é a parcela mais barata que a de R$ 1.099,62.";
		expect(corrigirComparacaoDeParcela(barata, MESA)).toMatch(/parcela\s+maior/i);
	});

	it("referência que não está na mesa: a oração comparativa sai", () => {
		const dito = "A de R$ 1.176,39 tem parcela menor que a da Rodobens.";
		const saida = corrigirComparacaoDeParcela(dito, MESA);
		expect(saida).not.toMatch(/parcela\s+menor/i);
		expect(saida).toContain("R$ 1.176,39");
	});

	it("frase sem comparativo de parcela não é tocada", () => {
		const dito = "A parcela é de R$ 1.176,39 em 96 meses.";
		expect(corrigirComparacaoDeParcela(dito, MESA)).toBe(dito);
	});

	it("a fala medida inteira, pelas duas réguas e pelo balão do turno", async () => {
		const { montarTrechoDeSaida } = await import("./turno-livre");
		const medida =
			"A de menor prazo é a da ÂNCORA, id 6abfaec94c0ff2a8453a73a0, com 94 meses. Ela é a minha recomendação para você também, pois tem o menor prazo e parcela menor que a outra da ÂNCORA.";
		const saida = montarTrechoDeSaida({
			texto: medida,
			cardsDoTurno: [],
			temCartaNaTela: true,
			...MESA,
		}).texto;
		expect(saida).not.toMatch(/6abfaec9/);
		expect(saida).not.toMatch(/\bid\b/);
		expect(saida).not.toMatch(/parcela\s+menor/i);
		expect(saida).toContain("com 94 meses");
		expect(corrigirComparacoes(medida, MESA)).not.toMatch(/parcela\s+menor/i);
	});
});

describe("prazo inventado: não existe carta com esse número na mesa", () => {
	it("a fala medida: 'a menor parcela é da ÂNCORA, mas o prazo é de 100 meses'", () => {
		const dito = "Então, olha: a menor parcela é da ÂNCORA, mas o prazo é de 100 meses.";
		const saida = semPrazoInventado(dito, MESA);
		expect(saida).not.toContain("100");
		expect(saida).toContain("a menor parcela é da ÂNCORA");
		expect(saida.endsWith(".")).toBe(true);
	});

	it("prazo de carta da mesa passa intacto", () => {
		const dito = "A menor parcela é da ÂNCORA, mas o prazo é de 114 meses.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
	});

	it("a frase que era só o prazo inventado sai; as outras ficam", () => {
		const saida = semPrazoInventado("Olha só. O prazo é de 100 meses. Quer ver o lance?", MESA);
		expect(saida).toBe("Olha só. Quer ver o lance?");
	});

	it("sem carta na mesa não há o que conferir: a fala fica", () => {
		const dito = "O prazo é de 100 meses.";
		expect(semPrazoInventado(dito, { cartasDaMesa: [] })).toBe(dito);
	});

	it("prazo que NÃO é atributo da oferta ('em 12 meses') não é tocado", () => {
		const dito = "Você pode ser contemplado em 12 meses se der lance alto.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
	});
});

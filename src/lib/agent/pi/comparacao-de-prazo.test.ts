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
import { corrigirComparacaoDePrazo } from "./comparacao-de-prazo";

const MESA = {
	cartasDaMesa: [
		{ parcela: 1099.62, prazoMeses: 114 }, // ÂNCORA
		{ parcela: 1454.51, prazoMeses: 94 }, // ÂNCORA
		{ parcela: 1176.39, prazoMeses: 96 }, // CANOPUS
		{ parcela: 1181.33, prazoMeses: 116 }, // CANOPUS
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

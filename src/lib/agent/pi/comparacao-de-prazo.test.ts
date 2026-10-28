// O PRINT 13 MANDA NESTE TESTE: *"Ela tem prazo mais curto que a de 94 meses da ÂNCORA"* sobre a
// carta de 96 meses. 96 > 94, então a fala está errada — e o cliente que confia nela contrata o
// prazo errado. Ordem do líder (27/10 22:35): "comparação de prazo/parcela tem de bater com os
// números das cartas na mesa".

import { describe, expect, it } from "vitest";
import { corrigirComparacaoDePrazo } from "./comparacao-de-prazo";

const MESA = { prazosDaMesa: [94, 96, 120] };

describe("comparação de prazo com o número da mesa", () => {
	it("a frase do print 13 vira a verdade: 96 é MAIS LONGO que 94", () => {
		const dito = "Ela tem prazo mais curto que a de 94 meses da ÂNCORA.";
		const saida = corrigirComparacaoDePrazo(dito, { ...MESA, prazoDaRecomendada: 96 });
		expect(saida).toContain("mais longo");
		expect(saida).not.toContain("mais curto");
		expect(saida).toContain("94 meses");
	});

	it("a direção certa passa intacta", () => {
		const dito = "A de 94 tem prazo mais curto que a de 120 meses.";
		expect(corrigirComparacaoDePrazo(dito, MESA)).toBe(dito);
		// e o inverso também é verdade, então também passa
		const outro = "A de 120 tem prazo mais longo que a de 94 meses.";
		expect(corrigirComparacaoDePrazo(outro, MESA)).toBe(outro);
	});

	it("prazo que não é de carta nenhuma da mesa não sustenta comparação", () => {
		const dito = "Ela tem prazo mais curto que a de 84 meses da ÂNCORA.";
		const saida = corrigirComparacaoDePrazo(dito, { ...MESA, prazoDaRecomendada: 96 });
		expect(saida).not.toMatch(/mais\s+curto/i);
		expect(saida).not.toContain("84 meses");
	});

	it("sem saber o prazo do sujeito, não afirma direção nenhuma", () => {
		const dito = "Ela é mais curta que a de 94 meses.";
		const saida = corrigirComparacaoDePrazo(dito, MESA);
		expect(saida).not.toMatch(/mais\s+curto/i);
	});

	it("frase sem comparativo de prazo não é tocada", () => {
		const dito = "A carta é de R$ 90 mil, parcela de R$ 1.176,39 em 94 meses.";
		expect(corrigirComparacaoDePrazo(dito, MESA)).toBe(dito);
	});

	it("'menor prazo' segue a mesma régua", () => {
		const dito = "Essa tem menor prazo que a de 94 meses.";
		const saida = corrigirComparacaoDePrazo(dito, { ...MESA, prazoDaRecomendada: 96 });
		expect(saida).toContain("maior prazo");
	});
});

describe("o turno aplica a régua — o balão que vai à tela", () => {
	it("montarTrechoDeSaida corrige a comparação com os prazos das cartas na mesa", async () => {
		const { montarTrechoDeSaida } = await import("./turno-livre");
		const saida = montarTrechoDeSaida({
			texto: "A de 96 é a que eu recomendo. Ela tem prazo mais curto que a de 94 meses da ÂNCORA.",
			cardsDoTurno: [],
			temCartaNaTela: true,
			prazosDaMesa: [94, 96, 120],
			prazoDaRecomendada: 96,
		});
		expect(saida.texto).not.toMatch(/mais\s+curto\s+que\s+a\s+de\s+94/i);
		expect(saida.texto).toMatch(/mais\s+longo\s+que\s+a\s+de\s+94/i);
	});
});

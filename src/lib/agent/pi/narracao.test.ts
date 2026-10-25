// A NARRAÇÃO DA FERRAMENTA (R5.1) — o card fala por si.
//
// As frases de "cai" são as do print do dev (25/10/2026, `/tmp/aja-dono/ui/item0-04.png`);
// as de "fica" são as falas legítimas que a guarda NÃO pode comer.
import { describe, expect, it } from "vitest";
import { criarNarracaoDoTurno, ehNarracaoDeFerramenta } from "./narracao";

describe("guarda da narração de ferramenta", () => {
	it("reconhece o balão que só anuncia a ferramenta", () => {
		const anuncios = [
			"Deixa eu mostrar os detalhes dela para você:",
			"Deixa eu buscar as cartas pra você.",
			"Deixa eu ver os números",
			"Vou conferir os valores.",
			"Vou buscar as opções pra você.",
			"Um segundo, por favor.",
			"Só um instante.",
			"Só um momento, já te mostro as opções.",
			"Pronto!",
			"Pronto! Aí estão todos os números.",
			"Aqui estão as opções.",
			"Aí estão os detalhes das cartas.",
		];
		for (const anuncio of anuncios) {
			expect(ehNarracaoDeFerramenta(anuncio), anuncio).toBe(true);
		}
	});

	it("informação no balão mantém o balão INTEIRO", () => {
		const falas = [
			// o balão real do print: nome da administradora + pergunta
			"Ótima escolha! A carta da Canopus é sólida também.\nDeixa eu mostrar os detalhes dela para você:\nPronto! Aí estão todos os números da carta da Canopus. Você quer seguir com essa, Marcos?",
			"Pronto! Aí estão todos os números da carta da Canopus.",
			"Deixa eu te explicar como funciona o lance: no consórcio você dá um lance e concorre à contemplação.",
			"Deixa eu mostrar como funciona o lance.",
			"Pronto, Marcos! Sua proposta está gerada, confere o link.",
			"Pronto, Marcos! Sua proposta está gerada.",
			"Você quer seguir com essa, Marcos?",
			"Deixa eu mostrar as cartas de 80 mil.",
			"Vou buscar a carta da Canopus.",
			"Um segundo, que eu já volto com o valor da parcela.",
			"Deixa eu buscar uma opção que caiba em 850 por mês.",
			"Achei essas opções pra você. Alguma te interessa?",
			"Pronto?",
		];
		for (const fala of falas) {
			expect(ehNarracaoDeFerramenta(fala), fala).toBe(false);
		}
	});

	it("anúncio comprido demais não é balão de anúncio", () => {
		const longo = `Deixa eu buscar as cartas ${"e os detalhes ".repeat(10)}pra você.`;
		expect(longo.length).toBeGreaterThan(120);
		expect(ehNarracaoDeFerramenta(longo)).toBe(false);
	});
});

describe("turno com card — o anúncio em volta dele cai", () => {
	it("[anúncio, card, anúncio] → só o card", () => {
		const turno = criarNarracaoDoTurno();
		expect(turno.aoTexto("Deixa eu mostrar os detalhes dela para você:")).toEqual([]);
		expect(turno.mostrouCard()).toBe(true);
		// o anúncio depois do card já está na tela como card: não repete
		expect(turno.aoTexto("Pronto! Aí estão todos os números.")).toEqual([]);
		expect(turno.fimDoTurno()).toEqual([]);
	});

	it("fala útil antes do card sai, e o anúncio colado ao card cai", () => {
		const turno = criarNarracaoDoTurno();
		const fala = "Ótima escolha! A carta da Canopus é sólida também.";
		expect(turno.aoTexto(fala)).toEqual([fala]);
		expect(turno.aoTexto("Deixa eu mostrar os detalhes dela para você:")).toEqual([]);
		expect(turno.mostrouCard()).toBe(true);
		expect(turno.fimDoTurno()).toEqual([]);
	});

	it("fala útil depois do card não é tocada", () => {
		const turno = criarNarracaoDoTurno();
		expect(turno.aoTexto("Deixa eu buscar as cartas pra você.")).toEqual([]);
		expect(turno.mostrouCard()).toBe(true);
		const fala = "Essas são as que sobram no seu orçamento.";
		expect(turno.aoTexto(fala)).toEqual([fala]);
		expect(turno.fimDoTurno()).toEqual([]);
	});

	it("sem card no turno, o anúncio é a fala da vez e sai", () => {
		const turno = criarNarracaoDoTurno();
		expect(turno.aoTexto("Só um instante.")).toEqual([]);
		expect(turno.fimDoTurno()).toEqual(["Só um instante."]);
	});

	it("dois anúncios seguidos: o mais velho não estava colado ao card e sai", () => {
		const turno = criarNarracaoDoTurno();
		expect(turno.aoTexto("Deixa eu buscar as cartas pra você.")).toEqual([]);
		expect(turno.aoTexto("Pronto! Aí estão os números.")).toEqual([
			"Deixa eu buscar as cartas pra você.",
		]);
		expect(turno.mostrouCard()).toBe(true);
		expect(turno.fimDoTurno()).toEqual([]);
	});
});

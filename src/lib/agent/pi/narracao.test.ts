// A NARRAÇÃO DA FERRAMENTA — medida, não corte (P11).
//
// Desde a P11 nada é cortado: `aoTexto` devolve o balão inteiro sempre, e o
// detector (`ehNarracaoDeFerramenta`) só alimenta o sinal `narracao_de_ferramenta`.
// As frases abaixo continuam as do print do dev (25/10/2026,
// `/tmp/aja-dono/ui/item0-04.png`) e as falas legítimas que o detector distingue.
import { describe, expect, it, vi } from "vitest";
import { criarNarracaoDoTurno, ehNarracaoDeFerramenta } from "./narracao";

vi.mock("@/lib/observability/sinais/publicar", () => ({
	publicarScores: vi.fn(),
}));

import { publicarScores } from "@/lib/observability/sinais/publicar";

describe("detector da narração de ferramenta", () => {
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

	it("informação no balão não casa com o vocabulário fechado", () => {
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

describe("turno com narração — o balão sai INTEIRO, sempre (P11)", () => {
	it("anúncio sai inteiro e emite o sinal narracao_de_ferramenta", () => {
		vi.mocked(publicarScores).mockClear();
		const turno = criarNarracaoDoTurno();
		const anuncio = "Deixa eu mostrar os detalhes dela para você:";
		expect(turno.aoTexto(anuncio)).toEqual([anuncio]);
		expect(publicarScores).toHaveBeenCalledWith(
			[{ name: "narracao_de_ferramenta", value: 1, dataType: "BOOLEAN" }],
			"remendos-fala",
		);
	});

	it("fala com informação sai inteira e não emite sinal", () => {
		vi.mocked(publicarScores).mockClear();
		const turno = criarNarracaoDoTurno();
		const fala = "Ótima escolha! A carta da Canopus é sólida também.";
		expect(turno.aoTexto(fala)).toEqual([fala]);
		expect(publicarScores).not.toHaveBeenCalled();
	});

	it("mostrouCard é no-op e nunca silencia fala", () => {
		vi.mocked(publicarScores).mockClear();
		const turno = criarNarracaoDoTurno();
		const anuncio = "Deixa eu buscar as cartas pra você.";
		expect(turno.aoTexto(anuncio)).toEqual([anuncio]);
		expect(turno.mostrouCard()).toBe(false);
		const depois = "Essas são as que sobram no seu orçamento.";
		expect(turno.aoTexto(depois)).toEqual([depois]);
	});

	it("fimDoTurno devolve [] — nada fica suspenso", () => {
		const turno = criarNarracaoDoTurno();
		expect(turno.aoTexto("Só um instante.")).toEqual(["Só um instante."]);
		expect(turno.fimDoTurno()).toEqual([]);
	});

	it("balão vazio não sai e não emite sinal", () => {
		vi.mocked(publicarScores).mockClear();
		const turno = criarNarracaoDoTurno();
		expect(turno.aoTexto("   ")).toEqual([]);
		expect(publicarScores).not.toHaveBeenCalled();
	});
});

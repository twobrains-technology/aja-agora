/**
 * A seção alta que o mapa de calor nunca contava.
 *
 * Cada caso aqui é uma medida de tela real. O primeiro bloco é o defeito: uma
 * seção de três telas de altura, ocupando a tela INTEIRA, reprovava no limiar de
 * 50% da seção — e o painel a mostrava com zero visitante.
 */

import { describe, expect, it } from "vitest";
import { secaoFoiVista } from "./secao-vista";

/** iPhone 14/15 em pé, que é o aparelho da maioria do tráfego. */
const TELA = 844;

describe("a seção ALTA, que era o defeito", () => {
	it("conta como vista quando enche a tela, mesmo sendo 3x maior que ela", () => {
		// 2.532px de seção, 844 visíveis: 33% da seção, 100% da tela. A regra
		// antiga (metade da seção) era matematicamente inalcançável aqui — nenhuma
		// rolagem, por mais lenta, chegaria a 50%.
		expect(
			secaoFoiVista({ fracaoDaSecao: 844 / 2532, alturaVisivelPx: 844, alturaDaJanelaPx: TELA }),
		).toBe(true);
	});

	it("conta como vista com metade da tela ocupada", () => {
		expect(
			secaoFoiVista({ fracaoDaSecao: 422 / 2532, alturaVisivelPx: 422, alturaDaJanelaPx: TELA }),
		).toBe(true);
	});

	it("NÃO conta o raspão — a preocupação que criou o limiar original", () => {
		// 80px de uma seção alta assomando na borda: 3% da seção, 9% da tela.
		expect(
			secaoFoiVista({ fracaoDaSecao: 80 / 2532, alturaVisivelPx: 80, alturaDaJanelaPx: TELA }),
		).toBe(false);
	});
});

describe("a seção CURTA, que já funcionava e não pode regredir", () => {
	it("conta quando metade dela está na tela", () => {
		// Seção de 400px com 200 visíveis: 50% da seção, 24% da tela.
		expect(
			secaoFoiVista({ fracaoDaSecao: 0.5, alturaVisivelPx: 200, alturaDaJanelaPx: TELA }),
		).toBe(true);
	});

	it("não conta quando só a borda aparece", () => {
		expect(secaoFoiVista({ fracaoDaSecao: 0.2, alturaVisivelPx: 80, alturaDaJanelaPx: TELA })).toBe(
			false,
		);
	});
});

describe("as bordas que não podem derrubar a coleta", () => {
	it("com altura de janela zero, não inventa visualização", () => {
		// Acontece em aba de fundo e durante a primeira pintura. Dividir por zero
		// aqui daria `Infinity`, e TODA seção passaria a contar de uma vez.
		expect(secaoFoiVista({ fracaoDaSecao: 0.1, alturaVisivelPx: 0, alturaDaJanelaPx: 0 })).toBe(
			false,
		);
	});

	it("seção fora da tela não conta", () => {
		expect(secaoFoiVista({ fracaoDaSecao: 0, alturaVisivelPx: 0, alturaDaJanelaPx: TELA })).toBe(
			false,
		);
	});
});

describe("a ordem física da página, que foi o que denunciou o defeito", () => {
	it("uma seção alta atravessada conta, e é isso que impede o funil de inverter", () => {
		// Em produção (22-24/08/2026) `kv-contemplacao` tinha 8 pessoas e
		// `kv-journey`, que vem ANTES dela na página, tinha zero. Como ninguém
		// alcança a quinta seção sem atravessar a terceira, o zero só podia ser do
		// instrumento. Com a regra nova, atravessar passa a contar.
		const journeyAtravessada = {
			fracaoDaSecao: 844 / 1800,
			alturaVisivelPx: 844,
			alturaDaJanelaPx: TELA,
		};
		const contemplacaoNaTela = { fracaoDaSecao: 0.6, alturaVisivelPx: 600, alturaDaJanelaPx: TELA };

		expect(secaoFoiVista(journeyAtravessada)).toBe(true);
		expect(secaoFoiVista(contemplacaoNaTela)).toBe(true);
	});
});

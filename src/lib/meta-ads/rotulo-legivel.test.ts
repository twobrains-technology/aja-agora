// O rótulo legível — função pura, prova sem banco e sem rede.
//
// A chave do teste é a do print `07-campanhas.png`, gravada na call de 18/09: é
// o caso real que estava ilegível na tela. Os demais cobrem as bordas que fazem a
// função não poder quebrar a página: `%` solto, `%2B` literal e id numérico.

import { describe, expect, it } from "vitest";
import { decodificarChaveDeCampanha, ehIdNumerico } from "./rotulo-legivel";

describe("decodificarChaveDeCampanha", () => {
	it("decodifica a chave URL-encoded real do print, com acento e travessão", () => {
		expect(
			decodificarChaveDeCampanha(
				"BOFU+-+AJA+%7C+CPM+FOCO+CONVERS%C3%83O+%2B+BASE+GERAL+%E2%80%94+C%C3%B3pia",
			),
		).toBe("BOFU - AJA | CPM FOCO CONVERSÃO + BASE GERAL — Cópia");
	});

	it("`+` vira espaço ANTES do decode, para não engolir o `+` literal (%2B)", () => {
		// Se decodificasse primeiro, o %2B viraria "+" e depois viraria espaço.
		expect(decodificarChaveDeCampanha("BASE+GERAL+%2B+C%C3%B3pia")).toBe("BASE GERAL + Cópia");
	});

	it("tolera percent-encoding inválido em vez de lançar URIError", () => {
		expect(decodificarChaveDeCampanha("PROMO 100% NOVA")).toBe("PROMO 100% NOVA");
		expect(decodificarChaveDeCampanha("CAMPANHA+100%+OFF")).toBe("CAMPANHA 100% OFF");
	});

	it("colapsa espaços repetidos que a decodificação cria", () => {
		expect(decodificarChaveDeCampanha("A+++B")).toBe("A B");
		expect(decodificarChaveDeCampanha("  A   B  ")).toBe("A B");
	});

	it("chave já legível volta igual", () => {
		expect(decodificarChaveDeCampanha("consorcio-agosto")).toBe("consorcio-agosto");
	});
});

describe("ehIdNumerico", () => {
	it("reconhece o id puro da Meta, com ou sem espaço em volta", () => {
		expect(ehIdNumerico("120250956902860104")).toBe(true);
		expect(ehIdNumerico(" 120250956902860104 ")).toBe(true);
	});

	it("nome de campanha digitado não é id numérico", () => {
		expect(ehIdNumerico("consorcio-agosto")).toBe(false);
		expect(ehIdNumerico("1202509569-agosto")).toBe(false);
		expect(ehIdNumerico("")).toBe(false);
	});
});

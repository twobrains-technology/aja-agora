/**
 * A régua da leitura do A/B do telefone, sem tela: o que cada número DIZ.
 *
 * O caso que este arquivo existe para travar é a ausência de dado: uma variante
 * sem visita tem que sair como "não calculável", e não como "0" (que afirmaria
 * "ninguém converteu") nem "0%" nem "NaN". A meta também é rótulo, não cor.
 */

import { describe, expect, it } from "vitest";
import type { ResultadoPorVariante } from "@/lib/chat/resultado-do-teste-do-telefone";
import {
	lerTotalDoTeste,
	lerVarianteDoTeste,
	META_DE_VISITAS_POR_VARIANTE,
	rotuloDaMeta,
} from "./teste-do-telefone-leitura";

const b = (over: Partial<ResultadoPorVariante> = {}): ResultadoPorVariante => ({
	variante: "A",
	visitas: 31,
	telefones: 8,
	naComparacao: 3,
	taxaDeTelefone: 8 / 31,
	...over,
});

describe("lerVarianteDoTeste", () => {
	it("sem visita na variante, tudo sai como 'não calculável' — nunca 0", () => {
		const leitura = lerVarianteDoTeste(
			b({ visitas: null, telefones: null, naComparacao: null, taxaDeTelefone: null }),
		);

		expect(leitura.visitas).toBe("não calculável");
		expect(leitura.telefones).toBe("não calculável");
		expect(leitura.naComparacao).toBe("não calculável");
		expect(leitura.taxa).toBe("não calculável");
		expect(leitura.meta).toBe("não calculável");
		expect(Object.values(leitura)).not.toContain("0");
	});

	it("a meta é rótulo: atingida quando bate 30, 'faltam N' quando não bate", () => {
		expect(lerVarianteDoTeste(b({ visitas: META_DE_VISITAS_POR_VARIANTE })).meta).toBe(
			"meta atingida",
		);
		expect(lerVarianteDoTeste(b({ visitas: 31 })).meta).toBe("meta atingida");
		expect(lerVarianteDoTeste(b({ variante: "B", visitas: 12 })).meta).toBe("faltam 18");
	});

	it("a taxa sai em % no padrão brasileiro, com vírgula decimal", () => {
		expect(lerVarianteDoTeste(b({ visitas: 4, taxaDeTelefone: 0.25 })).taxa).toBe("25%");
		expect(lerVarianteDoTeste(b({ visitas: 1000, taxaDeTelefone: 0.256 })).taxa).toBe("25,6%");
	});

	it("visita presente com zero telefone é um ZERO de verdade, não ausência", () => {
		const leitura = lerVarianteDoTeste(b({ visitas: 40, telefones: 0, taxaDeTelefone: 0 }));

		expect(leitura.telefones).toBe("0");
		expect(leitura.taxa).toBe("0%");
		expect(leitura.visitas).toBe("40");
	});
});

describe("rotuloDaMeta", () => {
	it("formata a distância em pt-BR", () => {
		expect(rotuloDaMeta(30)).toBe("meta atingida");
		expect(rotuloDaMeta(1)).toBe("faltam 29");
		expect(rotuloDaMeta(12)).toBe("faltam 18");
	});
});

describe("lerTotalDoTeste", () => {
	it("total null (nenhuma visita no teste) também é 'não calculável'", () => {
		expect(lerTotalDoTeste(null)).toEqual({
			visitas: "não calculável",
			telefones: "não calculável",
			naComparacao: "não calculável",
		});
	});

	it("com visitas, formata os três números", () => {
		expect(lerTotalDoTeste({ visitas: 43, telefones: 8, naComparacao: 3 })).toEqual({
			visitas: "43",
			telefones: "8",
			naComparacao: "3",
		});
	});
});

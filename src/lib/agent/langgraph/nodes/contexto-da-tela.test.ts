// O contexto tem que carregar o que o cliente VÊ e o que a busca respondeu.
//
// Julgamento da conversa pós-correção (14/08, nota 4/10): o estado estava
// curado e o agente continuou anunciando oferta que não existe. Três frases,
// todas contra o que o servidor tinha:
//
//   "as parcelas variam entre R$ 250 e R$ 400"   → card na tela: R$ 484,16
//   "apareceram as opções com parcela de R$ 200" → turn-trace do turno: cards []
//   "as opções na tela têm parcelas nessa faixa"  → única na tela: R$ 484,16
//
// A proibição já existia no contexto e não segurou nada. O que faltava era o
// DADO — e é ele que estes blocos entregam.
import { describe, expect, it } from "vitest";
import { blocoDeBuscaVazia, blocoDoQueEstaNaTela, faixaDeParcelas } from "./contexto-da-tela";

/** Os grupos reais que a Bevi devolveu para moto de R$ 20 mil. */
const NA_TELA = [
	{
		groupId: "g1",
		administradora: "TRADIÇÃO",
		creditValue: 22_077.3,
		monthlyPayment: 484.16,
		termMonths: 61,
	},
	{
		groupId: "g2",
		administradora: "BANCO DO BRASIL",
		creditValue: 22_377,
		monthlyPayment: 696.72,
		termMonths: 44,
	},
];

describe("faixaDeParcelas", () => {
	it("acha a menor e a maior", () => {
		const f = faixaDeParcelas(NA_TELA);
		expect(f?.min).toBe(484.16);
		expect(f?.max).toBe(696.72);
		expect(f?.menor.administradora).toBe("TRADIÇÃO");
	});

	it("sem parcela em nenhuma, não inventa faixa", () => {
		expect(faixaDeParcelas([{ groupId: "x" }])).toBeNull();
	});
});

describe("blocoDoQueEstaNaTela", () => {
	it("diz os números REAIS que o cliente está vendo", () => {
		const bloco = blocoDoQueEstaNaTela(NA_TELA) ?? "";
		expect(bloco).toContain("484,16");
		expect(bloco).toContain("696,72");
		// O número que o modelo inventou não pode ter respaldo nenhum aqui.
		expect(bloco).not.toContain("250");
	});

	it("com uma opção só, diz que é única", () => {
		const bloco = blocoDoQueEstaNaTela([NA_TELA[0]]) ?? "";
		expect(bloco).toContain("ÚNICA");
		expect(bloco).toContain("484,16");
	});

	it("sem oferta na tela, não há bloco (nada a afirmar)", () => {
		expect(blocoDoQueEstaNaTela([])).toBeNull();
	});
});

describe("blocoDeBuscaVazia", () => {
	it("diz o que foi buscado e que não voltou nada", () => {
		const bloco =
			blocoDeBuscaVazia({ alvo: "parcela", parcelaAlvo: 200, ofertasNaTela: NA_TELA }) ?? "";
		expect(bloco).toContain("200");
		expect(bloco).toMatch(/NÃO devolveu|não existe oferta/i);
	});

	it("oferece a alternativa REAL mais próxima, com números do catálogo", () => {
		const bloco =
			blocoDeBuscaVazia({ alvo: "parcela", parcelaAlvo: 200, ofertasNaTela: NA_TELA }) ?? "";
		expect(bloco).toContain("TRADIÇÃO");
		expect(bloco).toContain("484,16");
		expect(bloco).toContain("22.077");
	});

	it("sem nada na tela, ainda diz que a busca voltou vazia", () => {
		const bloco = blocoDeBuscaVazia({ alvo: "parcela", parcelaAlvo: 200, ofertasNaTela: [] }) ?? "";
		expect(bloco).toContain("200");
		expect(bloco).not.toContain("mais próxima");
	});

	it("busca por valor também é coberta", () => {
		const bloco = blocoDeBuscaVazia({ alvo: "valor", creditMax: 9_120, ofertasNaTela: [] }) ?? "";
		expect(bloco).toContain("9.120");
	});

	it("sem alvo nenhum, não há fato a declarar", () => {
		expect(blocoDeBuscaVazia({ alvo: "valor", ofertasNaTela: [] })).toBeNull();
	});
});

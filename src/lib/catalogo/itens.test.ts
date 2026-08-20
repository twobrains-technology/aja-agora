import { describe, expect, it } from "vitest";

import { CREDIT_BOUNDS } from "@/lib/agent/qualify-config";
import { CREDITO_MINIMO_PADRAO } from "@/lib/consorcio/credito-minimo";
import { computePlanEstimate } from "@/lib/consorcio/plan-estimate";
import { SITE_URL } from "@/lib/seo/site";

import { CATEGORIAS_DO_CATALOGO, faixasDeCredito, itensDoCatalogo } from "./itens";

describe("faixasDeCredito", () => {
	it("fica dentro da faixa que o funil aceita para a categoria", () => {
		for (const categoria of CATEGORIAS_DO_CATALOGO) {
			const { min, max } = CREDIT_BOUNDS[categoria];
			for (const valor of faixasDeCredito(categoria)) {
				expect(valor, `${categoria}: ${valor}`).toBeGreaterThanOrEqual(min);
				expect(valor, `${categoria}: ${valor}`).toBeLessThanOrEqual(max);
			}
		}
	});

	it("nunca anuncia carta abaixo do piso da Bevi", () => {
		// Moto começa em R$ 8.000 no slider, mas a busca real recusa qualquer
		// valor abaixo do piso (creditoBuscavel). Anunciar R$ 10.000 seria vender
		// o que o funil barra no turno seguinte.
		for (const categoria of CATEGORIAS_DO_CATALOGO) {
			for (const valor of faixasDeCredito(categoria)) {
				expect(valor, `${categoria}: ${valor}`).toBeGreaterThanOrEqual(CREDITO_MINIMO_PADRAO);
			}
		}
		expect(faixasDeCredito("moto")).not.toContain(10_000);
	});

	it("é crescente e sem valor repetido", () => {
		for (const categoria of CATEGORIAS_DO_CATALOGO) {
			const faixas = faixasDeCredito(categoria);
			expect(faixas.length).toBeGreaterThan(3);
			expect([...new Set(faixas)]).toEqual(faixas);
			expect([...faixas].sort((a, b) => a - b)).toEqual(faixas);
		}
	});
});

describe("itensDoCatalogo", () => {
	const itens = itensDoCatalogo();

	it("cobre as três verticais", () => {
		for (const categoria of CATEGORIAS_DO_CATALOGO) {
			expect(itens.some((item) => item.categoria === categoria)).toBe(true);
		}
	});

	it("dá um id único e estável por carta", () => {
		const ids = itens.map((item) => item.id);
		expect([...new Set(ids)]).toHaveLength(ids.length);
		expect(ids).toContain("auto-50000");
	});

	it("tira a parcela do plan-estimate, não de número escrito à mão", () => {
		for (const item of itens) {
			const estimativa = computePlanEstimate({
				category: item.categoria,
				assetValue: item.valorDoBem,
				targetMonth: 1,
			});
			expect(item.parcelaMensal).toBe(estimativa.monthlyPayment);
			expect(item.prazoMeses).toBe(estimativa.termMonths);
		}
	});

	it("aponta para a landing da vertical com o valor da carta no link", () => {
		const item = itens.find((i) => i.id === "auto-50000");
		expect(item).toBeDefined();
		const url = new URL(item?.link ?? "");
		expect(url.origin).toBe(SITE_URL.origin);
		expect(url.pathname).toBe("/autos");
		expect(url.searchParams.get("bem")).toBe("50000");
		expect(url.searchParams.get("utm_source")).toBe("meta");
		expect(url.searchParams.get("utm_medium")).toBe("catalogo");
	});

	it("usa imagem absoluta — a Meta busca o arquivo do lado dela", () => {
		for (const item of itens) {
			expect(item.imagem.startsWith(`${SITE_URL.origin}/`)).toBe(true);
		}
	});

	it("respeita os limites de tamanho de título e descrição da Meta", () => {
		for (const item of itens) {
			expect(item.titulo.length).toBeLessThanOrEqual(200);
			expect(item.descricao.length).toBeLessThanOrEqual(9_999);
			expect(item.descricao.length).toBeGreaterThan(40);
		}
	});

	it("escreve em português com acento, como todo texto que o cliente vê", () => {
		const semAcento = /\b(consorcio|credito|imovel|voce|administracao|nao)\b/i;
		for (const item of itens) {
			expect(semAcento.test(item.titulo), item.titulo).toBe(false);
			expect(semAcento.test(item.descricao), item.descricao).toBe(false);
		}
	});

	it("diz que a parcela é estimativa — número real só vem da administradora", () => {
		for (const item of itens) {
			expect(item.descricao.toLowerCase()).toContain("estimad");
		}
	});
});

/**
 * A FUNÇÃO MAIS SENSÍVEL DO CAMINHO DO DINHEIRO, TESTADA NOS QUATRO QUADRANTES.
 *
 * `coerceEscolhaNosAtalhos` decide se o botão de atalho carrega uma cota — e
 * carregar cota significa que o clique ANCORA o contrato. A revisão de
 * 19/08/2026 mediu que a primeira versão era *fail-open*: rótulo que o servidor
 * não sabe resolver ("A que contempla mais rápido", "A primeira") mantinha o
 * `groupId` que o MODELO declarou, sem conferência. Com o Banco do Brasil (15
 * contemplados/mês) e o Itaú (4) na tela, o botão "A que contempla mais rápido"
 * apontando para o Itaú passava — o cliente clica no que está escrito e o
 * contrato sai no que o modelo declarou. É a mesma classe do "botão do card
 * vira mentira do servidor" que já custou uma venda.
 *
 * A regra agora é fail-CLOSED: o servidor só anexa a cota ao rótulo que ele
 * mesmo consegue explicar. O que ele não explica vira texto puro — perde-se um
 * turno, não um contrato.
 */

import { describe, expect, it } from "vitest";
import { type ChosenOffer, coerceEscolhaNosAtalhos } from "./choose-offer";

const BB: ChosenOffer = {
	groupId: "bb-217",
	administradora: "BANCO DO BRASIL",
	creditValue: 499_634,
	monthlyPayment: 3_030.67,
	termMonths: 217,
	availableSlots: 15,
};
const ITAU_147: ChosenOffer = {
	groupId: "itau-147",
	administradora: "ITAÚ",
	creditValue: 524_580,
	monthlyPayment: 4_519,
	termMonths: 147,
	availableSlots: 4,
};
const ITAU_158: ChosenOffer = {
	groupId: "itau-158",
	administradora: "ITAÚ",
	creditValue: 507_960,
	monthlyPayment: 4_154,
	termMonths: 158,
	availableSlots: 1,
};
const EXIBIDAS = [BB, ITAU_147, ITAU_158];

describe("coerceEscolhaNosAtalhos — os quatro quadrantes", () => {
	it("resolve E bate com o declarado → o atalho carrega a cota", () => {
		const r = coerceEscolhaNosAtalhos(
			[
				{ label: "A de menor parcela", groupId: "itau-158" },
				{ label: "A de prazo mais curto", groupId: "itau-147" },
			],
			[ITAU_147, ITAU_158],
		);
		expect(r).toEqual([
			{ label: "A de menor parcela", groupId: "itau-158" },
			{ label: "A de prazo mais curto", groupId: "itau-147" },
		]);
	});

	it("resolve e DIVERGE do declarado → o id cai (o cliente clica no que está escrito)", () => {
		const r = coerceEscolhaNosAtalhos(
			[
				// trocados de propósito
				{ label: "A de menor parcela", groupId: "itau-147" },
				{ label: "A de prazo mais curto", groupId: "itau-158" },
			],
			[ITAU_147, ITAU_158],
		);
		expect(r.every((o) => !o.groupId)).toBe(true);
	});

	it("NÃO resolve → o id cai, mesmo com o modelo declarando (fail-closed)", () => {
		// O caso medido pela revisão: com BB a 15/mês e Itaú a 4/mês na tela, o
		// rótulo aponta a mais rápida e o modelo declara a mais lenta.
		const r = coerceEscolhaNosAtalhos(
			[
				{ label: "Prefiro pensar melhor", groupId: "itau-147" },
				{ label: "A primeira", groupId: "bb-217" },
			],
			EXIBIDAS,
		);
		expect(r.every((o) => !o.groupId)).toBe(true);
	});

	it("id que não está entre as cotas exibidas não vira botão de escolha", () => {
		const r = coerceEscolhaNosAtalhos(
			[
				{ label: "A de menor parcela", groupId: "grupo-inventado" },
				{ label: "A de prazo mais curto", groupId: "itau-147" },
			],
			[ITAU_147, ITAU_158],
		);
		expect(r.every((o) => !o.groupId)).toBe(true);
	});

	it("menos de duas cotas em jogo não é escolha entre alternativas", () => {
		const r = coerceEscolhaNosAtalhos(
			[{ label: "A de prazo mais curto", groupId: "itau-147" }, { label: "Me explica melhor" }],
			[ITAU_147, ITAU_158],
		);
		expect(r.every((o) => !o.groupId)).toBe(true);
	});

	it("dois rótulos apontando a MESMA cota não separam nada", () => {
		const empatadas: ChosenOffer[] = [
			{ ...ITAU_147, termMonths: 147 },
			{ ...ITAU_158, termMonths: 147 },
		];
		const r = coerceEscolhaNosAtalhos(
			[
				{ label: "A de prazo mais curto", groupId: "itau-147" },
				{ label: "A de prazo menor", groupId: "itau-158" },
			],
			empatadas,
		);
		expect(r.every((o) => !o.groupId)).toBe(true);
	});

	it("atalho sem cota nenhuma passa intacto — é texto, como sempre foi", () => {
		const r = coerceEscolhaNosAtalhos(
			[{ label: "Pode buscar" }, { label: "Me explica melhor" }],
			EXIBIDAS,
		);
		expect(r).toEqual([{ label: "Pode buscar" }, { label: "Me explica melhor" }]);
	});
});

describe("o critério que o produto usa para VENDER também resolve", () => {
	it('"a que contempla mais rápido" aponta a cota com mais contemplados/mês', () => {
		const r = coerceEscolhaNosAtalhos(
			[
				{ label: "A que contempla mais rápido", groupId: "bb-217" },
				{ label: "A de prazo mais curto", groupId: "itau-147" },
			],
			[BB, ITAU_147],
		);
		expect(r[0].groupId).toBe("bb-217");
		expect(r[1].groupId).toBe("itau-147");
	});

	it("e recusa quando o modelo aponta a que contempla MENOS", () => {
		const r = coerceEscolhaNosAtalhos(
			[
				{ label: "A que contempla mais rápido", groupId: "itau-147" },
				{ label: "A de prazo mais curto", groupId: "bb-217" },
			],
			[BB, ITAU_147],
		);
		expect(r.every((o) => !o.groupId)).toBe(true);
	});
});

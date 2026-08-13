// Report do Kairo, 05/08/2026: "Está repetindo grupos iguais".
//
// Reproduzido pelo gate em 2026-08-13, no cenário `golden-probe-i1-empty-turn`,
// turno 8 ("Quero ver mais opções, todas que tiver"): o `comparison_table` saiu
// com `Âncora::80000::970::115` DUAS VEZES na mesma tabela. O defeito estava
// escondido — os cenários que exercitam esse ramo viviam SKIPPED por falta de
// `E2E_TEST_CPF`, destravado nesta mesma data.
import { describe, expect, it } from "vitest";
import { payloadSemOfertasRepetidas, semOfertasRepetidas } from "./dedup-ofertas";

const ANCORA = {
	administradora: "Âncora",
	creditValue: 80_000,
	monthlyPayment: 970,
	termMonths: 115,
};

describe("ofertas repetidas na mesma tela", () => {
	it("a mesma oferta duas vezes vira uma (o caso do report)", () => {
		expect(semOfertasRepetidas([ANCORA, ANCORA])).toEqual([ANCORA]);
	});

	it("preserva a ordem — a primeira ocorrência vence", () => {
		const outra = { ...ANCORA, administradora: "Itaú" };
		expect(semOfertasRepetidas([ANCORA, outra, ANCORA]).map((o) => o.administradora)).toEqual([
			"Âncora",
			"Itaú",
		]);
	});

	// A mesma administradora com números diferentes é OUTRO grupo — proibir isso
	// esconderia opções legítimas do cliente.
	it("mesma administradora com números diferentes NÃO é duplicata", () => {
		const grupos = [ANCORA, { ...ANCORA, creditValue: 90_000, monthlyPayment: 1_090 }];
		expect(semOfertasRepetidas(grupos)).toHaveLength(2);
	});

	it("payload sem lista passa intacto (mesma referência)", () => {
		const p = { administradora: "Itaú", creditValue: 100 };
		expect(payloadSemOfertasRepetidas(p)).toBe(p);
	});

	it("payload sem repetição passa intacto (não paga cópia à toa)", () => {
		const p = { groups: [ANCORA] };
		expect(payloadSemOfertasRepetidas(p)).toBe(p);
	});

	it("payload com repetição sai limpo, preservando o resto", () => {
		const p = { groups: [ANCORA, ANCORA], highlightBestIndex: 0 };
		const saida = payloadSemOfertasRepetidas(p);
		expect(saida.groups).toHaveLength(1);
		expect(saida.highlightBestIndex).toBe(0);
	});

	it("não quebra com payload nulo ou primitivo", () => {
		expect(payloadSemOfertasRepetidas(null)).toBeNull();
		expect(payloadSemOfertasRepetidas("x")).toBe("x");
	});
});

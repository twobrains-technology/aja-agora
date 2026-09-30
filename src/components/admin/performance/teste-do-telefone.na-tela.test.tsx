// @vitest-environment happy-dom
/**
 * O RESULTADO DO A/B DO TELEFONE na TELA — o que o dono lê, não o que a API devolve.
 *
 * Este arquivo existe para travar uma coisa só, e ela é a que decide a leitura
 * do dia 01/10: **ausência de dado não vira zero.** Um lado sem visita mostra
 * "não calculável" e NENHUM número — nem `0`, nem `0%`, nem `NaN` —, porque
 * "0%" afirmaria que ninguém converteu quando a verdade é que ninguém caiu ali.
 *
 * Os outros dois casos são a régua da meta (B com 31 mostra "meta atingida", C
 * com 12 mostra "faltam 18") e o padrão brasileiro da taxa (`0.25` → `25%`).
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResultadoPorVariante } from "@/lib/chat/resultado-do-teste-do-telefone";
import { TesteDoTelefone } from "./teste-do-telefone";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const DE = new Date("2026-09-01T00:00:00.000Z");
const ATE = new Date("2026-09-30T23:59:59.000Z");

function stubDaResposta(corpo: unknown) {
	const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
		ok: true,
		json: async () => corpo,
	}));
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const variante = (over: Partial<ResultadoPorVariante>): ResultadoPorVariante => ({
	variante: "B",
	visitas: 31,
	telefones: 8,
	naComparacao: 3,
	taxaDeTelefone: 8 / 31,
	...over,
});

describe("TesteDoTelefone", () => {
	it("com uma variante sem dado, ela diz 'não calculável' e não mostra nenhum número", async () => {
		stubDaResposta({
			variantes: [
				variante({ variante: "B", visitas: 31, telefones: 8, taxaDeTelefone: 8 / 31 }),
				variante({
					variante: "C",
					visitas: null,
					telefones: null,
					naComparacao: null,
					taxaDeTelefone: null,
				}),
			],
			total: { visitas: 31, telefones: 8, naComparacao: 3 },
		});

		render(<TesteDoTelefone de={DE} ate={ATE} />);

		const colunaC = await screen.findByTestId("variante-C");
		// Ausência em cada uma das quatro linhas + no selo da meta.
		expect(within(colunaC).getAllByText("não calculável").length).toBeGreaterThanOrEqual(5);
		// O lado inteiro não tem NENHUM dígito: "0", "0%" e "NaN" não aparecem.
		expect(colunaC.textContent).not.toMatch(/[0-9]/);

		// O outro lado continua com os números dele.
		const colunaB = screen.getByTestId("variante-B");
		expect(within(colunaB).getByText("31")).toBeTruthy();
		expect(colunaB.textContent).not.toContain("não calculável");
	});

	it("B com 31 mostra 'meta atingida'; C com 12 mostra 'faltam 18'", async () => {
		stubDaResposta({
			variantes: [
				variante({ variante: "B", visitas: 31 }),
				variante({ variante: "C", visitas: 12, telefones: 4, taxaDeTelefone: 4 / 12 }),
			],
			total: { visitas: 43, telefones: 12, naComparacao: 5 },
		});

		render(<TesteDoTelefone de={DE} ate={ATE} />);

		const colunaB = await screen.findByTestId("variante-B");
		expect(within(colunaB).getByText("meta atingida")).toBeTruthy();

		const colunaC = screen.getByTestId("variante-C");
		expect(within(colunaC).getByText("faltam 18")).toBeTruthy();
	});

	it("a taxa sai em % com vírgula decimal (0.25 → 25%)", async () => {
		stubDaResposta({
			variantes: [
				variante({ variante: "B", visitas: 4, telefones: 1, taxaDeTelefone: 0.25 }),
				variante({ variante: "C", visitas: 4, telefones: 1, taxaDeTelefone: 0.25 }),
			],
			total: { visitas: 8, telefones: 2, naComparacao: 0 },
		});

		render(<TesteDoTelefone de={DE} ate={ATE} />);

		const colunaB = await screen.findByTestId("variante-B");
		expect(within(colunaB).getByText("25%")).toBeTruthy();
	});

	it("total null (nenhuma visita no teste) também é 'não calculável'", async () => {
		stubDaResposta({
			variantes: [
				variante({
					variante: "B",
					visitas: null,
					telefones: null,
					naComparacao: null,
					taxaDeTelefone: null,
				}),
				variante({
					variante: "C",
					visitas: null,
					telefones: null,
					naComparacao: null,
					taxaDeTelefone: null,
				}),
			],
			total: null,
		});

		render(<TesteDoTelefone de={DE} ate={ATE} />);

		const total = await screen.findByTestId("teste-do-telefone-total");
		expect(within(total).getAllByText("não calculável")).toHaveLength(3);
		expect(total.textContent).not.toMatch(/[0-9]/);
	});

	it("lê o endpoint do teste com o período da tela em from/to", async () => {
		const fetchMock = stubDaResposta({
			variantes: [
				variante({ variante: "B", visitas: 31 }),
				variante({ variante: "C", visitas: 12 }),
			],
			total: { visitas: 43, telefones: 12, naComparacao: 5 },
		});

		render(<TesteDoTelefone de={DE} ate={ATE} />);

		await screen.findByTestId("variante-B");
		const url = String(fetchMock.mock.calls[0]?.[0]);
		expect(url).toContain("/api/admin/performance/telefone-ab");
		expect(url).toContain(`from=${encodeURIComponent(DE.toISOString())}`);
		expect(url).toContain(`to=${encodeURIComponent(ATE.toISOString())}`);
	});
});

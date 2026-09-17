// @vitest-environment happy-dom
/**
 * A SEÇÃO DE INSIGHTS NA TELA — o que aparece (e o que NÃO aparece).
 *
 * O caso que mais importa é o de hoje: a régua nunca rodou. A tela tem que
 * dizer que nada foi enviado e quantas conversas estão elegíveis — e NÃO pode
 * desenhar um funil de zeros, que se leria como "ninguém respondeu". Com dado,
 * o funil aparece sem NaN nem "undefined" na tela.
 */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LinhaBruta } from "@/lib/admin/remarketing-tela";
import { estadoHonestoDaRegua, insightsDaRegua } from "@/lib/admin/remarketing-tela";
import { SecaoDeInsights } from "./insights-da-regua";

afterEach(() => {
	cleanup();
});

const TOQUE = new Date("2026-09-10T13:00:00Z");

function linha(parcial: Partial<LinhaBruta> = {}): LinhaBruta {
	return {
		conversationId: "11111111-1111-1111-1111-111111111111",
		contactId: "22222222-2222-2222-2222-222222222222",
		nome: "Marina",
		telefoneMascarado: null,
		objetivo: "carro",
		step: 1,
		status: "ATIVO",
		motivoSaida: null,
		nextTouchAt: null,
		ultimoToqueEm: TOQUE,
		touches30d: 1,
		criadoEm: new Date("2026-09-09T13:00:00Z"),
		ultimoInboundEm: null,
		optoutDaPessoaEm: null,
		converteuEm: null,
		rastro: null,
		...parcial,
	};
}

describe("SecaoDeInsights — régua nunca ligada", () => {
	it("diz que nada foi enviado e mostra a fila de elegíveis, sem funil", () => {
		render(
			<SecaoDeInsights
				insights={insightsDaRegua([])}
				estado={estadoHonestoDaRegua({
					totalNoHistorico: 0,
					linhasNoPeriodo: 0,
					elegiveisAgora: 218,
				})}
			/>,
		);

		expect(screen.getByText(/ainda não está ligada/i)).toBeInTheDocument();
		expect(screen.getByText("218")).toBeInTheDocument();
		expect(screen.getByText(/nada foi enviado/i)).toBeInTheDocument();
		// O ponto: nenhum funil de zero é desenhado.
		expect(screen.queryByText(/Funil da régua por passo/i)).not.toBeInTheDocument();
	});
});

describe("SecaoDeInsights — régua ligada, sem toque no período", () => {
	it("aponta o período em vez de zerar o funil", () => {
		render(
			<SecaoDeInsights
				insights={insightsDaRegua([])}
				estado={{
					tipo: "sem_toques_no_periodo",
					totalNoHistorico: 40,
					elegiveisAgora: 12,
				}}
			/>,
		);

		expect(screen.getByText(/Nenhum toque no período/i)).toBeInTheDocument();
		expect(screen.getByText("40")).toBeInTheDocument();
		expect(screen.queryByText(/Funil da régua por passo/i)).not.toBeInTheDocument();
	});
});

describe("SecaoDeInsights — com dados", () => {
	it("mostra o funil sem NaN nem undefined na tela", () => {
		render(
			<SecaoDeInsights
				insights={insightsDaRegua([linha()])}
				estado={{ tipo: "com_dados", totalNoPeriodo: 1 }}
			/>,
		);

		expect(screen.getByText(/Funil da régua por passo/i)).toBeInTheDocument();
		expect(screen.getAllByText(/Depois do toque 01/i).length).toBeGreaterThan(0);

		const texto = document.body.textContent ?? "";
		expect(texto).not.toMatch(/NaN/);
		expect(texto).not.toMatch(/Infinity/);
		expect(texto).not.toMatch(/undefined/);
	});

	it("destaca o toque que mais converteu", () => {
		render(
			<SecaoDeInsights
				insights={insightsDaRegua([
					linha({ step: 1, converteuEm: new Date(TOQUE.getTime() + 60 * 60 * 1000) }),
				])}
				estado={{ tipo: "com_dados", totalNoPeriodo: 1 }}
			/>,
		);

		expect(screen.getAllByText(/mais converteu/i).length).toBeGreaterThan(0);
		expect(screen.getByText(/O toque 01 é o que mais converteu/i)).toBeInTheDocument();
	});
});

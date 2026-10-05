// @vitest-environment happy-dom
/**
 * A RESPOSTA ATRASADA NÃO PINTA A TELA (D10, 02/10/2026).
 *
 * Trocar o período deixa DUAS consultas no ar, e a mais lenta é justamente a
 * antiga: sair de "Hoje" para "30 dias" (ou o contrário) faz a resposta do
 * período velho chegar DEPOIS da nova e sobrescrevê-la — a tela pinta 30 dias
 * com o rótulo "Hoje", e ninguém tem como saber que o número é de outra janela.
 * É o defeito silencioso mais caro desta tela: os números continuam plausíveis.
 *
 * O que este arquivo prova é a ordem invertida, no caminho de quem usa a tela:
 * o operador clica o preset, a consulta nova responde, a antiga responde em
 * seguida — e o que fica na tela é a do período SELECIONADO.
 */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PerformanceResponse } from "@/lib/admin/performance-types";
import PerformancePage from "./page";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** `pessoas` é o marcador: é o número que a tela mostra em destaque na porta. */
function respostaDoPeriodo(pessoas: number): PerformanceResponse {
	return {
		funil: [],
		porta: {
			pessoas,
			visitas: 0,
			pessoasQueConversaram: 0,
			conversas: 0,
			taxaDeEntrada: 0,
			web: 0,
			whatsapp: 0,
		},
		quemChegou: { total: 0, porBem: [], porFaixa: [], comValorInformado: 0 },
		origens: [],
		serie: [],
		cobertura: { conversasComOrigem: 0, conversasTotal: 0, percent: 0, conversasDeTeste: 0 },
		handoff: { etapas: [], parados: [], limiteHoras: 24, amostraSuficiente: true },
		custos: {
			investimentoMetaCents: null,
			custoDeIA: { tipo: "motivo", motivo: "sem_dado", explicacao: "A fonte não reportou nada." },
			custoDeMensagem: {
				quantidade: 0,
				porTemplate: [],
				custo: { tipo: "motivo", motivo: "sem_preco", explicacao: "Sem preço cadastrado." },
			},
			contagens: { conversas: 0, identificados: 0, qualificados: 0 },
			fontes: {
				investimento: "Meta",
				custoDeIA: "Langfuse",
				custoDeMensagem: "Banco",
				contagens: "Funil",
			},
			custoNaoAplicavelAoRecorte: false,
		},
	};
}

function respostaJson(corpo: unknown): Response {
	return new Response(JSON.stringify(corpo), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

interface PedidoPendente {
	url: URL;
	responder: (corpo: unknown) => Promise<void>;
}

/** A consulta da Performance fica PENDENTE até o teste mandar responder — é o
 *  que permite inverter a ordem das duas respostas. O resto da página (o teste
 *  do telefone tem rota própria) responde na hora. */
function montarFetch(): PedidoPendente[] {
	const pendentes: PedidoPendente[] = [];

	vi.stubGlobal("fetch", (entrada: string | URL) => {
		const url = new URL(String(entrada), "http://localhost");
		if (url.pathname !== "/api/admin/performance") {
			return Promise.resolve(
				respostaJson({ variantes: [], total: { visitas: 0, telefones: 0, naComparacao: 0 } }),
			);
		}

		let resolver: (resposta: Response) => void = () => {};
		const promessa = new Promise<Response>((resolve) => {
			resolver = resolve;
		});
		pendentes.push({
			url,
			responder: async (corpo) => {
				await act(async () => {
					resolver(respostaJson(corpo));
				});
			},
		});
		return promessa;
	});

	return pendentes;
}

async function pedido(pendentes: PedidoPendente[], indice: number): Promise<PedidoPendente> {
	return waitFor(() => {
		expect(pendentes.length, `a consulta #${indice + 1} não saiu`).toBeGreaterThan(indice);
		return pendentes[indice];
	});
}

describe("Performance — o período selecionado é quem pinta a tela", () => {
	it("descarta a resposta do período antigo que chega depois da nova", async () => {
		const pendentes = montarFetch();

		render(
			<NuqsTestingAdapter searchParams="?from=2026-09-01&to=2026-09-01" hasMemory>
				<PerformancePage />
			</NuqsTestingAdapter>,
		);

		// A tela abre com o período da URL e dispara a consulta dele.
		const antigo = await pedido(pendentes, 0);

		// O operador troca o período — a consulta nova sai com outra janela.
		await act(async () => {
			screen.getByRole("button", { name: "30 dias" }).click();
		});
		const novo = await pedido(pendentes, 1);
		expect(novo.url.searchParams.get("from")).not.toBe(antigo.url.searchParams.get("from"));

		// A resposta NOVA chega primeiro; a ANTIGA, atrasada, chega depois.
		await novo.responder(respostaDoPeriodo(222));
		await antigo.responder(respostaDoPeriodo(111));

		await waitFor(() => {
			expect(screen.getByText("222")).toBeTruthy();
		});
		expect(screen.queryByText("111")).toBeNull();
	});
});

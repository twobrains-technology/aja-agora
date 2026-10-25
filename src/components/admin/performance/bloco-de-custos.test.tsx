// @vitest-environment happy-dom
/**
 * O BLOCO DE CUSTOS — o total do custo de IA tem de se explicar.
 *
 * Juiz de avaliação, diagnóstico e insight de lead gastam IA sem ter conversa a quem
 * atribuir. Elas ENTRAM no total do período (P314) e a tela precisa dizer que entram: um
 * total que carrega uma fatia invisível é um número que o operador não consegue fechar na
 * leitura — e este bloco existe justamente para fechar o CPC número a número.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type LinhaDeCustoDeIA, somarCustoDeIA } from "@/lib/admin/custo-de-ia";
import type { CustosDoCpc } from "@/lib/admin/performance-types";
import { BlocoDeCustos } from "./bloco-de-custos";

afterEach(cleanup);

/** A cotação do teste: 1 centavo de dólar vale 5 centavos de real, para a conta ser legível. */
const COTACAO = 5;

/**
 * O texto do elemento com os espaços normalizados.
 *
 * `Intl` formata moeda com espaço NÃO separável ("R$\u00A025,00"); num `toContain`
 * literal isso falha sem parecer falhar — o texto na tela é o mesmo.
 */
function texto(elemento: HTMLElement): string {
	return (elemento.textContent ?? "").replace(/\s/g, " ");
}

/** A linha COM conversa: 1.000 centavos de dólar = R$ 50,00. */
const DA_CONVERSA: LinhaDeCustoDeIA = {
	sessionId: "conversa-1",
	modelo: "qwen3.6-flash",
	dia: "2026-10-20",
	custoUsdCents: 1000,
};

function custosDoPeriodo(linhas: LinhaDeCustoDeIA[]): CustosDoCpc {
	const custoDeIA = somarCustoDeIA({
		linhas,
		conversas: [{ conversationId: "conversa-1", canal: "whatsapp" }],
		cotacaoUsdBrl: COTACAO,
	});
	if (custoDeIA.tipo !== "valor") throw new Error("o fixture precisa de um custo calculável");

	return {
		investimentoMetaCents: 100_000,
		custoDeIA,
		custoDeMensagem: {
			quantidade: 10,
			porTemplate: [],
			custo: { tipo: "valor", centavos: 500, precoUnitarioCents: 50 },
		},
		contagens: { conversas: 4, identificados: 3, qualificados: 2 },
		fontes: {
			investimento: "Meta (reportado)",
			custoDeIA: "Postgres (uso_de_ia)",
			custoDeMensagem: "Postgres (volume) + cadastro de preço",
			contagens: "Postgres",
		},
		custoNaoAplicavelAoRecorte: false,
	};
}

describe("BlocoDeCustos — a linha das chamadas sem conversa", () => {
	it("diz quantas chamadas avulsas o total inclui e quanto elas custaram", () => {
		render(
			<BlocoDeCustos
				custos={custosDoPeriodo([
					DA_CONVERSA,
					// A avulsa (juiz, diagnóstico, insight): 200 centavos de dólar = R$ 10,00.
					{ sessionId: null, modelo: "qwen3.6-flash", dia: "2026-10-20", custoUsdCents: 200 },
				])}
			/>,
		);

		// O total é a SOMA com a avulsa dentro: R$ 50,00 da conversa + R$ 10,00 da avulsa.
		expect(screen.getByText("R$ 60,00")).toBeTruthy();

		const nota = screen.getByText(/chamada sem conversa/i);
		expect(texto(nota)).toContain("1 chamada");
		expect(texto(nota)).toContain("R$ 10,00");
		// Quem não é do time sabe o que é "chamada sem conversa" pela própria tela.
		expect(texto(nota).toLowerCase()).toContain("juiz");
		expect(texto(nota).toLowerCase()).toContain("diagnóstico");
	});

	it("com duas avulsas, a fatia é a soma das duas e o plural está certo", () => {
		render(
			<BlocoDeCustos
				custos={custosDoPeriodo([
					DA_CONVERSA,
					{ sessionId: null, modelo: "qwen3.6-flash", dia: "2026-10-20", custoUsdCents: 200 },
					{ sessionId: null, modelo: "qwen3.6-flash", dia: "2026-10-20", custoUsdCents: 300 },
				])}
			/>,
		);

		// 200 + 300 centavos de dólar = R$ 25,00; o total vai a R$ 75,00.
		expect(screen.getByText("R$ 75,00")).toBeTruthy();

		const nota = screen.getByText(/2 chamadas sem conversa/i);
		expect(texto(nota)).toContain("R$ 25,00");
	});

	it("sem avulsa, não acrescenta nota nenhuma sobre a fatia", () => {
		render(<BlocoDeCustos custos={custosDoPeriodo([DA_CONVERSA])} />);

		expect(screen.getByText("R$ 50,00")).toBeTruthy();
		expect(screen.queryByText(/chamada sem conversa/i)).toBeNull();
	});

	it("custo de IA não calculável: a nota é o motivo nomeado, não uma fatia", () => {
		render(
			<BlocoDeCustos
				custos={{
					...custosDoPeriodo([DA_CONVERSA]),
					custoDeIA: {
						tipo: "motivo",
						motivo: "sem_dado",
						explicacao: "O livro-caixa de uso de IA não tem nenhuma linha neste período.",
					},
				}}
			/>,
		);

		expect(screen.getAllByText("não calculável").length).toBeGreaterThanOrEqual(1);
		expect(screen.queryByText(/chamada sem conversa/i)).toBeNull();
	});
});

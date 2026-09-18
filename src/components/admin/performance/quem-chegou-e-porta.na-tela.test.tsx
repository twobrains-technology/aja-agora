// @vitest-environment happy-dom
/**
 * O que a tela de Performance PROMETE depois do AJA-01 e do AJA-17 — no DOM.
 *
 * Dois pedidos literais do cliente, e nenhum dos dois é visível num teste de
 * query:
 *
 * 1. "Quem chegou" (pedido d da Bruna): a distribuição por Bem e por Faixa de
 *    valor precisa aparecer COM contagem e porcentagem, e precisa dizer quando
 *    a faixa é um recorte menor que o total.
 * 2. AJA-17: as conversas sem origem conhecida deixam de ser uma nota de rodapé
 *    sem saída — a linha tem que ter AÇÃO, e o link tem que levar ao filtro
 *    `origem=desconhecida` com o MESMO número que a frase mostra.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CoberturaAtribuicao, PortaDoFunil, QuemChegou } from "@/lib/admin/performance-types";
import { PortaDoFunilCard } from "./porta-do-funil";
import { QuemChegouCard } from "./quem-chegou";

const PORTA: PortaDoFunil = {
	pessoas: 100,
	visitas: 130,
	pessoasQueConversaram: 20,
	conversas: 24,
	taxaDeEntrada: 20,
	web: 18,
	whatsapp: 6,
};

const COBERTURA: CoberturaAtribuicao = {
	conversasComOrigem: 15,
	conversasTotal: 24,
	percent: 62.5,
};

const QUEM_CHEGOU: QuemChegou = {
	total: 12,
	porBem: [
		{ rotulo: "Carro", total: 7 },
		{ rotulo: "Imóvel", total: 4 },
		{ rotulo: "Moto", total: 1 },
	],
	porFaixa: [
		{ rotulo: "Até R$ 50 mil", total: 5 },
		{ rotulo: "Valor não informado", total: 4 },
	],
	comValorInformado: 8,
};

afterEach(cleanup);

describe("AJA-17 — a nota de origem vira linha com ação", () => {
	it("mostra quantas ficam fora e leva ao filtro certo", () => {
		render(<PortaDoFunilCard porta={PORTA} cobertura={COBERTURA} />);

		// 24 - 15 = 9.
		expect(
			screen.getByText(/^9 conversas sem origem conhecida ficam fora deste funil$/),
		).toBeTruthy();

		const link = screen.getByRole("link", { name: /Ver as 9/ });
		expect(link.getAttribute("href")).toBe("/admin/conversations?origem=desconhecida");
	});

	it("sem conversa fora, não oferece um link que abriria lista vazia", () => {
		render(
			<PortaDoFunilCard
				porta={PORTA}
				cobertura={{ conversasComOrigem: 24, conversasTotal: 24, percent: 100 }}
			/>,
		);

		expect(
			screen.getByText(/^0 conversas sem origem conhecida ficam fora deste funil$/),
		).toBeTruthy();
		expect(screen.queryByRole("link", { name: /Ver as/ })).toBeNull();
	});

	it("a explicação longa saiu da tela: virou tooltip com gatilho nomeado", () => {
		render(<PortaDoFunilCard porta={PORTA} cobertura={COBERTURA} />);

		expect(screen.getByLabelText("Por que estas conversas ficam fora")).toBeTruthy();
		expect(screen.queryByText(/não aparecem em nenhum número desta tela/)).toBeNull();
	});
});

describe("Quem chegou — o perfil de quem iniciou a conversa", () => {
	it("mostra o bem com contagem e porcentagem", () => {
		render(<QuemChegouCard dados={QUEM_CHEGOU} />);

		expect(screen.getByText("Carro")).toBeTruthy();
		expect(screen.getByText("Imóvel")).toBeTruthy();
		expect(screen.getByText("Moto")).toBeTruthy();
		// 7 de 12 = 58%.
		expect(screen.getAllByText(/^7 · 5[0-9]%$/).length).toBeGreaterThan(0);
	});

	it("diz que a faixa de valor é um recorte menor, em número", () => {
		render(<QuemChegouCard dados={QUEM_CHEGOU} />);

		expect(screen.getByText(/8 de 12 informaram o valor do bem\./)).toBeTruthy();
		expect(screen.getByText("Valor não informado")).toBeTruthy();
	});

	it("sem conversa iniciada, diz isso em vez de mostrar barras vazias", () => {
		render(<QuemChegouCard dados={{ total: 0, porBem: [], porFaixa: [], comValorInformado: 0 }} />);

		expect(screen.getByText("Sem conversa iniciada no período")).toBeTruthy();
		expect(screen.getByText("Ninguém iniciou a conversa no período")).toBeTruthy();
	});
});

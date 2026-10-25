/**
 * O CPC COM UM CUSTO DE IA PARCIAL.
 *
 * Juiz e diagnóstico gravam linha de um modelo que não tem preço cadastrado. Antes, uma
 * única linha assim apagava o custo do período inteiro e o CPC virava "não calculável" —
 * justamente o número que a cliente pediu (Bruna, 22/09). O total do custo de IA passou a
 * ser a soma do que se CONHECE, marcada como PARCIAL; o CPC usa esse total e carrega a
 * marca. Só não há CPC quando nenhuma linha do período tem preço.
 */
import { describe, expect, it } from "vitest";
import { type LinhaDeCustoDeIA, somarCustoDeIA } from "@/lib/admin/custo-de-ia";
import type { CustosDoCpc } from "@/lib/admin/performance-types";
import { calcularCpc } from "./custos-do-cpc";

/** A cotação do teste: 1 centavo de dólar vale 5 centavos de real, para a conta ser legível. */
const COTACAO = 5;

/** A linha COM conversa: 1.000 centavos de dólar = R$ 50,00. */
const DA_CONVERSA: LinhaDeCustoDeIA = {
	sessionId: "conversa-1",
	modelo: "qwen3.6-flash",
	dia: "2026-10-20",
	custoUsdCents: 1000,
};

/** O juiz: gastou IA, e o modelo dele não tem preço cadastrado. */
const SEM_PRECO: LinhaDeCustoDeIA = {
	sessionId: "conversa-1",
	modelo: "claude-sonnet-4-6",
	dia: "2026-10-20",
	custoUsdCents: null,
};

function custosDoPeriodo(linhas: LinhaDeCustoDeIA[]): CustosDoCpc {
	return {
		investimentoMetaCents: 100_000, // R$ 1.000,00
		custoDeIA: somarCustoDeIA({
			linhas,
			conversas: [{ conversationId: "conversa-1", canal: "web" }],
			cotacaoUsdBrl: COTACAO,
		}),
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

describe("um modelo sem preço no período não derruba o CPC", () => {
	it("o CPC é calculado com a soma do que se conhece e sai marcado como PARCIAL", () => {
		const cpc = calcularCpc(custosDoPeriodo([DA_CONVERSA, SEM_PRECO]));

		expect(cpc.tipo).toBe("valor");
		if (cpc.tipo !== "valor") return;
		// (R$ 1.000,00 de Meta + R$ 50,00 de IA + R$ 5,00 de mensagem) ÷ 2 qualificados.
		expect(cpc.centavos).toBe(52_750);
		expect(cpc.parcial).toBe(true);
	});

	it("período inteiramente precificado: o CPC é cheio, sem a marca de parcial", () => {
		const cpc = calcularCpc(custosDoPeriodo([DA_CONVERSA]));

		expect(cpc.tipo).toBe("valor");
		if (cpc.tipo !== "valor") return;
		expect(cpc.centavos).toBe(52_750);
		expect(cpc.parcial).toBe(false);
	});

	it("nenhuma linha com preço: não há CPC, e o motivo diz que o custo de IA é que faltou", () => {
		const cpc = calcularCpc(custosDoPeriodo([SEM_PRECO]));

		expect(cpc.tipo).toBe("motivo");
		if (cpc.tipo !== "motivo") return;
		expect(cpc.motivo).toBe("custo_de_ia_nao_calculavel");
		// A explicação leva junto o que a tela precisa dizer: o modelo sem preço.
		expect(cpc.explicacao).toContain("claude-sonnet-4-6");
	});
});

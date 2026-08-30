/**
 * A tabela não afoga o cliente.
 *
 * Segundo maior buraco do funil medido em produção (10-26/08/2026): das 30
 * conversas que chegaram a ver carta, **17 nunca escolheram uma** — 57%. E o
 * padrão do último turno delas é sempre o mesmo:
 *
 *   🤖 Encontrei 17 opções de consórcio pra você... Qual delas tem a sua cara?
 *   🤖 Encontrei 19 opções... Qual delas mais te agradou?
 *   🤖 Encontrei 28 opções pra você com parcelas de R$ 848,33 até R$ 6.859,36.
 *   (fim)
 *
 * Não é falta de interesse: essa gente já tinha investido 8,8 turnos de média e
 * entregado CPF. É excesso de escolha — a tabela recebia TODOS os grupos usáveis
 * que a Bevi devolvesse, sem corte, e a pergunta "qual delas?" transferia para o
 * cliente um trabalho de comparação que é do vendedor.
 *
 * Vendedor bom não estende dezenove cartas sobre a mesa. Ele traz a que recomenda,
 * mostra duas ou três alternativas honestas ao lado e diz por quê.
 *
 * O corte é CÓDIGO porque é invariante de payload (o que vai para a tela), e o
 * ranking que decide quem fica já é server-side. Quantas opções mostrar depois
 * disso — e o convite a ver mais — é conversa do modelo.
 */
import { describe, expect, it } from "vitest";
import { limitarOpcoesDaComparacao, MAX_OPCOES_NA_COMPARACAO } from "./recommendation-payload";

function tabelaCom(n: number): Record<string, unknown> {
	return {
		groups: Array.from({ length: n }, (_, i) => ({
			id: `g-${i}`,
			administradora: `ADM-${i}`,
			creditValue: 80_000 + i,
			monthlyPayment: 1_000 + i,
			termMonths: 60,
		})),
	};
}

const qtd = (p: Record<string, unknown>) => (p.groups as unknown[]).length;

describe("limitarOpcoesDaComparacao", () => {
	it("corta a lista de 28 opções para o máximo que cabe numa decisão", () => {
		expect(qtd(limitarOpcoesDaComparacao(tabelaCom(28)))).toBe(MAX_OPCOES_NA_COMPARACAO);
	});

	it("preserva a ORDEM do ranking — quem fica são as melhores, não as primeiras da Bevi", () => {
		const cortada = limitarOpcoesDaComparacao(tabelaCom(28));
		const ids = (cortada.groups as Array<{ id: string }>).map((g) => g.id);
		expect(ids).toEqual(Array.from({ length: MAX_OPCOES_NA_COMPARACAO }, (_, i) => `g-${i}`));
	});

	it("não mexe em lista que já cabe", () => {
		expect(qtd(limitarOpcoesDaComparacao(tabelaCom(3)))).toBe(3);
		expect(qtd(limitarOpcoesDaComparacao(tabelaCom(1)))).toBe(1);
	});

	it("aguenta payload sem grupos sem explodir", () => {
		expect(() => limitarOpcoesDaComparacao({})).not.toThrow();
		expect(() => limitarOpcoesDaComparacao({ groups: [] })).not.toThrow();
	});

	it("o teto é pequeno o bastante para caber numa decisão humana", () => {
		// A regra dos 3-5 de qualquer vitrine física. Se algum dia alguém subir
		// isto para 15, este teste é o lembrete de por que ele existe.
		expect(MAX_OPCOES_NA_COMPARACAO).toBeLessThanOrEqual(5);
		expect(MAX_OPCOES_NA_COMPARACAO).toBeGreaterThanOrEqual(2);
	});
});

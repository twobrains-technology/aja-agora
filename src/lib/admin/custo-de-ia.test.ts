// Custo de IA — ROTA B: a fonte é o Langfuse, o vínculo é o Postgres.
//
// Os três números que a tela da cliente vai ler saem daqui: o custo em dólar que
// a fonte já reporta, a conversa do Postgres que dá vínculo (sessionId do
// Langfuse = conversationId) e a cotação que traz o dólar para o real do CPC.
//
// O que este arquivo trava, acima de tudo: **ausência de preço é "não
// calculável", nunca "R$ 0,00"** — e o motivo é NOMEADO, porque "falta de dado",
// "falta de vínculo", "modelo sem preço na fonte" e "sem cotação cadastrada"
// pedem ações diferentes de quem opera.
//
// Nenhum teste daqui fala com o Langfuse: os dois lados entram por fixture.

import { describe, expect, it } from "vitest";
import type { ConversaDoPostgres, LinhaDeCustoDoLangfuse } from "./custo-de-ia";
import { computeCustoDeIA, linhasDoMetricasDoLangfuse, somarCustoDeIA } from "./custo-de-ia";

const conversa = (
	conversationId: string,
	canal: "web" | "whatsapp" = "web",
): ConversaDoPostgres => ({ conversationId, canal });

const linha = (
	sessionId: string,
	modelo: string,
	dia: string,
	custoUsdCents: number | null,
): LinhaDeCustoDoLangfuse => ({ sessionId, modelo, dia, custoUsdCents });

describe("somarCustoDeIA — a fonte e o vínculo", () => {
	it("soma por modelo e por dia e converte para real pela cotação", () => {
		const resultado = somarCustoDeIA({
			linhas: [
				linha("conv-1", "gpt-x", "2026-09-15", 1200),
				linha("conv-1", "gpt-x", "2026-09-15", 300),
				linha("conv-1", "claude-y", "2026-09-16", 500),
				linha("conv-2", "gpt-x", "2026-09-16", 500),
			],
			conversas: [conversa("conv-1"), conversa("conv-2")],
			cotacaoUsdBrl: 5,
		});

		expect(resultado).toEqual({
			tipo: "valor",
			usdCents: 2500,
			brlCents: 12500,
			conversas: 2,
			porModelo: [
				{ chave: "claude-y", usdCents: 500, brlCents: 2500 },
				{ chave: "gpt-x", usdCents: 2000, brlCents: 10000 },
			],
			porDia: [
				{ chave: "2026-09-15", usdCents: 1500, brlCents: 7500 },
				{ chave: "2026-09-16", usdCents: 1000, brlCents: 5000 },
			],
		});
	});

	it("período sem dado na fonte não vira zero: é 'sem_dado'", () => {
		const resultado = somarCustoDeIA({
			linhas: [],
			conversas: [conversa("conv-1")],
			cotacaoUsdBrl: 5,
		});

		expect(resultado).toMatchObject({ tipo: "motivo", motivo: "sem_dado" });
		expect(JSON.stringify(resultado)).not.toContain("0,00");
	});

	it("custo que não casa com conversa nenhuma do Postgres é 'sem_vinculo'", () => {
		const resultado = somarCustoDeIA({
			linhas: [linha("sessao-orfa", "gpt-x", "2026-09-15", 1200)],
			conversas: [conversa("conv-1")],
			cotacaoUsdBrl: 5,
		});

		expect(resultado).toMatchObject({ tipo: "motivo", motivo: "sem_vinculo" });
	});

	it("sem conversa nenhuma no período, o custo não tem a quem pertencer: 'sem_vinculo'", () => {
		const resultado = somarCustoDeIA({
			linhas: [linha("conv-1", "gpt-x", "2026-09-15", 1200)],
			conversas: [],
			cotacaoUsdBrl: 5,
		});

		expect(resultado).toMatchObject({ tipo: "motivo", motivo: "sem_vinculo" });
	});

	it("modelo sem preço na fonte derruba o total e nomeia os modelos: 'modelo_sem_preco'", () => {
		const resultado = somarCustoDeIA({
			linhas: [
				linha("conv-1", "gpt-x", "2026-09-15", 1200),
				linha("conv-1", "modelo-novo", "2026-09-15", null),
			],
			conversas: [conversa("conv-1")],
			cotacaoUsdBrl: 5,
		});

		expect(resultado).toMatchObject({
			tipo: "motivo",
			motivo: "modelo_sem_preco",
			modelosSemPreco: ["modelo-novo"],
		});
	});

	it("sem cotação cadastrada o custo fica em dólar: 'sem_cotacao', nunca um real chutado", () => {
		const resultado = somarCustoDeIA({
			linhas: [linha("conv-1", "gpt-x", "2026-09-15", 1200)],
			conversas: [conversa("conv-1")],
			cotacaoUsdBrl: null,
		});

		expect(resultado).toMatchObject({ tipo: "motivo", motivo: "sem_cotacao" });
	});

	it("custo zero real é valor zero — o contrário de preço ausente", () => {
		const resultado = somarCustoDeIA({
			linhas: [linha("conv-1", "gpt-x", "2026-09-15", 0)],
			conversas: [conversa("conv-1")],
			cotacaoUsdBrl: null,
		});

		expect(resultado).toMatchObject({ tipo: "valor", usdCents: 0, brlCents: 0 });
	});

	it("recorte por canal só conta as conversas daquele canal", () => {
		const resultado = somarCustoDeIA({
			linhas: [
				linha("web-1", "gpt-x", "2026-09-15", 1000),
				linha("wpp-1", "gpt-x", "2026-09-15", 9000),
			],
			conversas: [conversa("web-1", "web"), conversa("wpp-1", "whatsapp")],
			cotacaoUsdBrl: 5,
			canal: "web",
		});

		expect(resultado).toMatchObject({ tipo: "valor", usdCents: 1000, conversas: 1 });
	});
});
describe("linhasDoMetricasDoLangfuse — o payload da v1 vira linha de custo", () => {
	it("lê sessionId, providedModelName, time_dimension e converte dólar → centavos", () => {
		expect(
			linhasDoMetricasDoLangfuse({
				data: [
					{
						sessionId: "conv-1",
						providedModelName: "gpt-x",
						time_dimension: "2026-09-15T00:00:00.000Z",
						sum_totalCost: 12.5,
					},
				],
			}),
		).toEqual([{ sessionId: "conv-1", modelo: "gpt-x", dia: "2026-09-15", custoUsdCents: 1250 }]);
	});

	it("custo ausente vira null (não zero) — a fonte não sabe o preço", () => {
		expect(
			linhasDoMetricasDoLangfuse({
				data: [{ sessionId: "conv-1", providedModelName: "novo", time_dimension: "2026-09-15" }],
			}),
		).toEqual([{ sessionId: "conv-1", modelo: "novo", dia: "2026-09-15", custoUsdCents: null }]);
	});

	it("linha sem sessão ou sem modelo não vira fato (custo órfão fica de fora)", () => {
		expect(
			linhasDoMetricasDoLangfuse({
				data: [
					{ providedModelName: "gpt-x", time_dimension: "2026-09-15", sum_totalCost: 1 },
					{ sessionId: "conv-1", time_dimension: "2026-09-15", sum_totalCost: 1 },
				],
			}),
		).toEqual([]);
	});

	it("payload sem data ⇒ lista vazia, sem explodir", () => {
		expect(linhasDoMetricasDoLangfuse(null)).toEqual([]);
		expect(linhasDoMetricasDoLangfuse({})).toEqual([]);
	});
});

describe("computeCustoDeIA — a costura, provada com fontes injetadas", () => {
	it("junta os dois lados e a cotação num número só", async () => {
		const resultado = await computeCustoDeIA(
			{ de: new Date("2026-09-15T00:00:00Z"), ate: new Date("2026-09-16T00:00:00Z") },
			{
				lerLangfuse: async () => [linha("conv-1", "gpt-x", "2026-09-15", 1000)],
				lerConversas: async () => [conversa("conv-1")],
				lerCotacao: async () => 5,
			},
		);
		expect(resultado).toMatchObject({ tipo: "valor", usdCents: 1000, brlCents: 5000 });
	});

	it("falha na leitura da fonte é 'fonte_indisponivel' — não 'sem_dado'", async () => {
		const resultado = await computeCustoDeIA(
			{ de: new Date("2026-09-15T00:00:00Z"), ate: new Date("2026-09-16T00:00:00Z") },
			{
				lerLangfuse: async () => {
					throw new Error("langfuse-metrics-500");
				},
				lerConversas: async () => [conversa("conv-1")],
				lerCotacao: async () => 5,
			},
		);
		expect(resultado).toMatchObject({ tipo: "motivo", motivo: "fonte_indisponivel" });
	});
});

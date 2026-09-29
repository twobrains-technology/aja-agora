// O CPC e o motivo de ele não existir — o cálculo PURO do bloco de custos.
//
// A regra que este arquivo existe para travar, e que é a mesma do resto da
// frente: **faltando qualquer um dos custos, o CPC é "não calculável" com o
// motivo nomeado — nunca um número**. Um CPC somado por cima de um custo
// ausente seria menor que a verdade e a cliente decidiria verba sobre ele.

import { describe, expect, it } from "vitest";
import type { CustosDoCpc } from "@/lib/admin/performance-types";
import { calcularCpc } from "./custos-do-cpc";

const base = (over: Partial<CustosDoCpc> = {}): CustosDoCpc => ({
	investimentoMetaCents: 100_000,
	custoDeIA: {
		tipo: "valor",
		usdCents: 2000,
		brlCents: 10_000,
		conversas: 5,
		porModelo: [],
		porDia: [],
	},
	custoDeMensagem: {
		quantidade: 10,
		porTemplate: [],
		custo: { tipo: "valor", centavos: 500, precoUnitarioCents: 50 },
	},
	contagens: { conversas: 5, identificados: 4, qualificados: 10 },
	fontes: {
		investimento: "Meta (reportado)",
		custoDeIA: "Langfuse",
		custoDeMensagem: "cadastro de preço",
		contagens: "Postgres",
	},
	...over,
});

describe("calcularCpc", () => {
	it("com os três custos presentes, é a soma dividida pelos qualificados", () => {
		// (100000 + 10000 + 500) / 10 = 11050
		expect(calcularCpc(base())).toEqual({ tipo: "valor", centavos: 11_050 });
	});

	it("sem preço de mensagem, o CPC é 'não calculável' com o motivo — não um número", () => {
		const resultado = calcularCpc(
			base({
				custoDeMensagem: {
					quantidade: 10,
					porTemplate: [],
					custo: { tipo: "motivo", motivo: "sem_preco", explicacao: "sem preço cadastrado" },
				},
			}),
		);

		expect(resultado).toMatchObject({
			tipo: "motivo",
			motivo: "custo_de_mensagem_nao_calculavel",
		});
		expect(resultado).not.toHaveProperty("centavos");
	});

	it("custo de IA sem cotação deixa o CPC não calculável — o dólar não vira real sozinho", () => {
		const resultado = calcularCpc(
			base({
				custoDeIA: { tipo: "motivo", motivo: "sem_cotacao", explicacao: "sem cotação" },
			}),
		);

		expect(resultado).toMatchObject({
			tipo: "motivo",
			motivo: "custo_de_ia_nao_calculavel",
		});
	});

	it("a Meta sem investimento no período não vira investimento zero", () => {
		expect(calcularCpc(base({ investimentoMetaCents: null }))).toMatchObject({
			tipo: "motivo",
			motivo: "sem_investimento",
		});
	});

	it("sem qualificado não há CPC — o denominador é o que ele divide", () => {
		expect(
			calcularCpc(base({ contagens: { conversas: 5, identificados: 4, qualificados: 0 } })),
		).toMatchObject({ tipo: "motivo", motivo: "sem_qualificado" });
	});
});

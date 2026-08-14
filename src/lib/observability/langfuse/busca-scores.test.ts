// Os sinais que teriam pego a conversa de 13/08 — e que não existiam.
//
// Medição no Langfuse de produção (janela 02:28–02:36 UTC, dossiê de 14/08):
// `tool_falhou`=0, `turno_mudo`=0, `card_sem_fala`=0. Os quatro Monitors
// desenhados até então não cobriam nada do que aconteceu: a busca RODOU e
// devolveu resultado — errado, não falho —, e o agente ESCREVEU em todos os
// turnos. O defeito passou por baixo de toda rede existente.
//
// O que estes sinais medem é FATO DE SERVIDOR, nunca fala:
//   • a busca saiu com um alvo que a administradora não pode atender;
//   • a busca voltou vazia, e de novo, e de novo;
//   • o estado tem piso acima do teto;
//   • o card na tela contradiz, na aritmética, a parcela que o cliente pediu.
//
// Nenhum deles lê o que o agente disse. Fala é assunto do juiz e do Langfuse,
// não de guard — a regra do CLAUDE.md deste projeto.
import { describe, expect, it } from "vitest";
import {
	scoresDeBuscaDespachada,
	scoresDeEstadoIncoerente,
	scoresDeOfertaContradizParcela,
} from "./busca-scores";

describe("busca_abaixo_do_piso — a pergunta impossível nem devia sair", () => {
	it("acusa a faixa abaixo do piso da administradora", () => {
		// R$ 9.120 foi o crédito derivado da parcela de R$ 200 na conversa real.
		const scores = scoresDeBuscaDespachada({
			alvo: "valor",
			creditMax: 9_120,
			categoria: "moto",
		});
		const piso = scores.find((s) => s.name === "busca_abaixo_do_piso");
		expect(piso?.value).toBe(1);
		expect(piso?.comment).toContain("9120");
	});

	it("faixa buscável não acusa", () => {
		const scores = scoresDeBuscaDespachada({ alvo: "valor", creditMax: 20_000, categoria: "moto" });
		expect(scores.find((s) => s.name === "busca_abaixo_do_piso")?.value).toBe(0);
	});

	it("respeita o piso que a própria Bevi informou nesta conversa", () => {
		// A administradora disse que o mínimo dela é R$ 8.000: R$ 9.120 passa.
		const scores = scoresDeBuscaDespachada({
			alvo: "valor",
			creditMax: 9_120,
			categoria: "moto",
			creditoMinimoInformado: 8_000,
		});
		expect(scores.find((s) => s.name === "busca_abaixo_do_piso")?.value).toBe(0);
	});

	it("busca por PARCELA não é medida contra o piso de crédito", () => {
		// O piso é do crédito; quem busca por parcela não tem crédito-alvo.
		const scores = scoresDeBuscaDespachada({
			alvo: "parcela",
			parcelaAlvo: 200,
			categoria: "moto",
		});
		expect(scores.find((s) => s.name === "busca_abaixo_do_piso")?.value).toBe(0);
		expect(scores.find((s) => s.name === "busca_alvo")?.value).toBe("parcela");
	});
});

describe("busca_vazia e busca_esgotada — a mão na massa da re-busca", () => {
	it("primeira vazia marca vazia, não esgotada", () => {
		const scores = scoresDeBuscaDespachada({
			alvo: "valor",
			creditMax: 9_120,
			categoria: "moto",
			vazia: true,
			streak: 1,
		});
		expect(scores.find((s) => s.name === "busca_vazia")?.value).toBe(1);
		expect(scores.find((s) => s.name === "busca_esgotada")?.value).toBe(0);
	});

	it("da segunda em diante, esgotada — o mesmo limiar que o funil já usa", () => {
		const scores = scoresDeBuscaDespachada({
			alvo: "valor",
			creditMax: 9_120,
			categoria: "moto",
			vazia: true,
			streak: 2,
		});
		expect(scores.find((s) => s.name === "busca_esgotada")?.value).toBe(1);
		expect(scores.find((s) => s.name === "busca_vazia")?.comment).toContain("streak=2");
	});

	it("busca com resultado não acusa nada", () => {
		const scores = scoresDeBuscaDespachada({ alvo: "valor", creditMax: 20_000, categoria: "moto" });
		expect(scores.find((s) => s.name === "busca_vazia")?.value).toBe(0);
		expect(scores.find((s) => s.name === "busca_esgotada")?.value).toBe(0);
	});
});

describe("estado_incoerente — o par invertido que chegou à busca", () => {
	it("acusa o par exato de produção", () => {
		const scores = scoresDeEstadoIncoerente({ creditMin: 18_000, creditMax: 6_424 });
		expect(scores.find((s) => s.name === "estado_incoerente")?.value).toBe(1);
		expect(scores.find((s) => s.name === "estado_incoerente")?.comment).toContain("18000");
	});

	it("acusa o alvo por parcela que foi buscado por valor", () => {
		const scores = scoresDeEstadoIncoerente({
			creditMin: 18_000,
			creditMax: 20_000,
			alvo: "parcela",
			buscaDespachadaPor: "valor",
		});
		expect(scores.find((s) => s.name === "estado_incoerente")?.value).toBe(1);
	});

	it("estado coerente não acusa", () => {
		const scores = scoresDeEstadoIncoerente({ creditMin: 18_000, creditMax: 20_000 });
		expect(scores.find((s) => s.name === "estado_incoerente")?.value).toBe(0);
	});
});

describe("oferta_contradiz_parcela — a aritmética que o juiz não viu", () => {
	it("acusa o card de R$ 6.270 para quem pediu R$ 200/mês (fator 31×)", () => {
		const scores = scoresDeOfertaContradizParcela({ parcelaAlvo: 200, monthlyPayment: 6_270.48 });
		const s = scores.find((sc) => sc.name === "oferta_contradiz_parcela");
		expect(s?.value).toBe(1);
		expect(s?.comment).toContain("31");
	});

	it("dentro do dobro da parcela pedida, passa — a carta real nunca bate exato", () => {
		const scores = scoresDeOfertaContradizParcela({ parcelaAlvo: 200, monthlyPayment: 380 });
		expect(scores.find((sc) => sc.name === "oferta_contradiz_parcela")?.value).toBe(0);
	});

	it("sem parcela declarada, não há o que contradizer", () => {
		expect(scoresDeOfertaContradizParcela({ monthlyPayment: 6_270 })).toEqual([]);
	});

	it("o fator vira dimensão própria quando estoura o triplo", () => {
		const scores = scoresDeOfertaContradizParcela({ parcelaAlvo: 200, monthlyPayment: 6_270.48 });
		expect(scores.find((sc) => sc.name === "oferta_contradiz_parcela_gravidade")?.value).toBe(
			"acima_de_3x",
		);
	});
});

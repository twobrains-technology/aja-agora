/**
 * §5 do PRD (19/08/2026) — A AVALIAÇÃO ESTAVA MENTINDO.
 *
 * A conversa da Rute terminou sem uma linha em `bevi_proposals`, com a cliente
 * indo embora depois de uma pergunta não respondida. A avaliação automática deu
 * **0,85 de conversão** e escreveu a própria confissão ao lado:
 *
 *   "conversao": { "score": 0.85, "reasoning": "Stage do lead: em_negociacao.
 *                   Lead capturado: não." }
 *
 * Duas coisas somadas produziam isso:
 *   • `scoreConversao` era um MAPA FIXO de estágio, sem olhar uma única vez
 *     para o desfecho real (proposta gerada, contrato fechado);
 *   • o estágio `em_negociacao` é promovido em QUALQUER turno de usuário após o
 *     reveal — ou seja, "o cliente falou depois de ver os cards".
 *
 * Havia ainda uma incoerência interna: `qualificado + lead → 1,0`, acima de
 * `proposta_enviada → 0,95`. Morrer qualificado pontuava mais que mandar
 * proposta.
 *
 * A régua nova é do DESFECHO: sem proposta, teto baixo, não importa o estágio.
 * Com proposta, sobe. Contrato fechado é o topo.
 */

import { describe, expect, it } from "vitest";
import { scoreConversao } from "./scorer-internals";

describe("conversão mede desfecho, não humor do kanban", () => {
	it("em_negociacao SEM proposta não passa do teto — é a conversa da Rute", () => {
		const score = scoreConversao("em_negociacao", false, { propostas: 0, contratoFechado: false });
		expect(score).toBeLessThanOrEqual(0.4);
	});

	it("nenhum estágio, sozinho, fura o teto de quem não gerou proposta", () => {
		for (const stage of [
			"em_negociacao",
			"proposta_enviada",
			"na_administradora",
			"aguardando_pagamento",
			"qualificado",
			"engajado",
			"em_atendimento",
		] as const) {
			expect(
				scoreConversao(stage, true, { propostas: 0, contratoFechado: false }),
				`estágio ${stage} sem proposta`,
			).toBeLessThanOrEqual(0.4);
		}
	});

	it("proposta REAL sobe a nota, mesmo com o estágio atrasado no kanban", () => {
		// 3 das 7 conversas com proposta real estão marcadas como "perdido".
		const comProposta = scoreConversao("perdido", true, { propostas: 1, contratoFechado: false });
		expect(comProposta).toBeGreaterThan(0.6);
	});

	it("contrato fechado é o topo", () => {
		expect(scoreConversao("fechado_ganho", true, { propostas: 1, contratoFechado: true })).toBe(1);
	});

	it("a régua é monotônica: nada pontua acima de quem chegou mais longe", () => {
		const morreuQualificado = scoreConversao("qualificado", true, {
			propostas: 0,
			contratoFechado: false,
		});
		const mandouProposta = scoreConversao("proposta_enviada", true, {
			propostas: 1,
			contratoFechado: false,
		});
		const fechou = scoreConversao("fechado_ganho", true, { propostas: 1, contratoFechado: true });
		expect(morreuQualificado).toBeLessThan(mandouProposta);
		expect(mandouProposta).toBeLessThan(fechou);
	});

	it("conversa nova, sem nada, continua no chão", () => {
		expect(scoreConversao("novo", false, { propostas: 0, contratoFechado: false })).toBeLessThan(
			0.2,
		);
	});
});

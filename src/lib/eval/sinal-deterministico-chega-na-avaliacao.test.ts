/**
 * §5.4 do PRD (19/08/2026) — O SINAL CERTO EXISTIA E NÃO CONVERSAVA COM
 * NINGUÉM.
 *
 * `venda_prometida_sem_proposta` teria disparado na conversa da Rute. Mas ele
 * vive num worker que publica no Langfuse, desconectado de
 * `conversation_evaluations` — o painel que a mesa lê. Quem olhava a conversa
 * via 0,85 de conversão e nenhum alerta.
 *
 * Aqui os dois se encontram: a avaliação de cada conversa passa a carregar os
 * sinais determinísticos, e eles entram na frente dos `topIssues` — antes do
 * que o juiz LLM achou, porque prova vem antes de hipótese.
 */

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { computeEvalFromData } from "./scorer-pipeline";

const juizNeutro = async () => ({
	result: {
		dimensions: {
			engajamento: { score: 0.9, reasoning: "x" },
			discovery: { score: 0.9, reasoning: "x" },
			continuidade: { score: 0.9, reasoning: "x" },
			naturalidade: { score: 0.9, reasoning: "x" },
			assertividade: { score: 0.9, reasoning: "x" },
		},
		flags: {
			hallucination: false,
			missedHandoff: false,
			incompleteDiscovery: false,
			lowEngagement: false,
		},
		topIssues: ["achado do juiz"],
		topStrengths: ["conduziu bem"],
	},
	tokensInput: 1,
	tokensOutput: 1,
	durationMs: 1,
});

const t = (min: number) => new Date(Date.UTC(2026, 7, 19, 17, min, 0));

/** A conversa da Rute, reduzida ao que a avaliação enxerga. */
const ENTRADA_DA_RUTE = {
	status: "active" as const,
	channel: "web" as const,
	currentPersona: "helena-imovel",
	currentCategory: "imovel",
	personas: [{ personaId: "helena-imovel", voiceTone: "consultiva", forbiddenTopics: [] }],
	metadata: {
		currentPersona: "helena-imovel",
		currentCategory: "imovel",
		revealCompleted: true,
		maxStageReached: "em_negociacao",
		qualifyAnswers: {},
	} as ConversationMetadata,
	messages: [
		{ id: "m1", role: "assistant" as const, content: "Encontrei 11 opções", createdAt: t(25) },
		{ id: "m2", role: "user" as const, content: "Qual contempla mais rápido?", createdAt: t(27) },
		{ id: "m3", role: "assistant" as const, content: "Qual você prefere?", createdAt: t(27) },
		{ id: "m4", role: "user" as const, content: "Itaú", createdAt: t(27) },
		{ id: "m5", role: "user" as const, content: "A de prazo mais curto", createdAt: t(28) },
		{ id: "m6", role: "user" as const, content: "Ver cenários", createdAt: t(29) },
	],
	artifacts: [
		{ messageId: "m1", type: "comparison_table", payload: { groups: [] } },
		{ messageId: "m5", type: "simulation_result", payload: { groupId: "ita-147" } },
	],
	lead: { stage: "em_negociacao" as const, name: "Rute", phone: "11999999999", email: null },
	propostas: 0,
};

describe("os sinais determinísticos chegam à avaliação da conversa", () => {
	it("a conversa da Rute sai com alerta de funil parado antes da decisão", async () => {
		const out = await computeEvalFromData(ENTRADA_DA_RUTE, juizNeutro);
		if (out.kind !== "success") throw new Error("esperava sucesso");

		expect(out.signals.alertas).toContain("funil_parado_pre_decisao");
		expect(out.signals.alertas).toContain("escolha_falada_nao_ancorada");
		// Prova vem antes de hipótese: o alerta encabeça os issues.
		expect(out.topIssues[0]).toContain("funil_parado_pre_decisao");
		expect(out.topIssues).toContain("achado do juiz");
	});

	it("a nota de conversão desta conversa fica no chão, como devia estar em 19/08", async () => {
		const out = await computeEvalFromData(ENTRADA_DA_RUTE, juizNeutro);
		if (out.kind !== "success") throw new Error("esperava sucesso");
		expect(out.dimensions.conversao.score).toBeLessThanOrEqual(0.4);
	});

	it("conversa com proposta e decisão ofertada não gera alerta nenhum", async () => {
		const out = await computeEvalFromData(
			{
				...ENTRADA_DA_RUTE,
				propostas: 1,
				metadata: {
					...ENTRADA_DA_RUTE.metadata,
					escolha: { groupId: "ita-147", origem: "mencao" as const },
				} as ConversationMetadata,
				artifacts: [
					...ENTRADA_DA_RUTE.artifacts,
					{ messageId: "m5", type: "decision_prompt", payload: {} },
					{ messageId: "m6", type: "contract_form", payload: {} },
				],
			},
			juizNeutro,
		);
		if (out.kind !== "success") throw new Error("esperava sucesso");
		expect(out.signals.alertas).toEqual([]);
		expect(out.topIssues).toEqual(["achado do juiz"]);
	});
});

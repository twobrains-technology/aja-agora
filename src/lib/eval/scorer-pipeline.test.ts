import { describe, expect, it, vi } from "vitest";

/**
 * P314/L25 — A CONVERSA ATRAVESSA O PIPELINE ATÉ O JUIZ.
 *
 * Registrar a chamada dentro de `judgeConversation` só fecha a conta se o
 * `conversationId` CHEGAR lá. O pipeline é o seam entre o scorer (que tem a conversa) e o
 * juiz (que só recebe transcript/personas/sinais) — se ele engolir o id, a linha nasce com
 * `conversationId` NULL e o admin descarta (`custo-de-ia.ts`: linha sem conversa não é
 * custo de conversa).
 */

import { computeEvalFromData, type EvalInput, type JudgeFn } from "./scorer-pipeline";

const entrada: EvalInput = {
	status: "active",
	channel: "web",
	currentPersona: null,
	currentCategory: null,
	messages: [],
	artifacts: [],
	lead: null,
	personas: [],
	metadata: null,
	propostas: 0,
	conversationId: "33333333-3333-4333-8333-333333333333",
};

const julgamento: Awaited<ReturnType<JudgeFn>> = {
	result: {
		dimensions: {
			engajamento: { score: 0.8, reasoning: "mock" },
			discovery: { score: 0.6, reasoning: "mock" },
			continuidade: { score: 0.7, reasoning: "mock" },
			naturalidade: { score: 0.9, reasoning: "mock" },
			assertividade: { score: 0.5, reasoning: "mock" },
		},
		flags: {
			hallucination: false,
			missedHandoff: false,
			incompleteDiscovery: false,
			lowEngagement: false,
		},
		topIssues: [],
		topStrengths: [],
	},
	tokensInput: 100,
	tokensOutput: 20,
	durationMs: 5,
};

describe("P314/L25 — o pipeline entrega a conversa ao juiz", () => {
	it("repassa o `conversationId` da avaliação para a chamada do juiz", async () => {
		const juiz = vi.fn<JudgeFn>(async () => julgamento);

		await computeEvalFromData(entrada, juiz);

		expect(juiz).toHaveBeenCalledOnce();
		expect(juiz.mock.calls[0][0].conversationId).toBe("33333333-3333-4333-8333-333333333333");
	});
});

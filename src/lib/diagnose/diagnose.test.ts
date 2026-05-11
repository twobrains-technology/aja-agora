import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__resetGenerateObjectImplForTests,
	__setGenerateObjectImplForTests,
	DiagnosisError,
	diagnoseConversation,
} from "./diagnose";
import { buildDiagnosisPrompt } from "./prompt";
import type { DiagnosisResult } from "./types";

const validResult: DiagnosisResult = {
	rootCause: "Agente usou jargão técnico sem explicar pra usuária leiga.",
	suggestedExamples: [
		{
			whenExpertise: ["leigo"],
			whenCategory: ["imovel"],
			userMessage: "O que é cota?",
			assistantResponse: "Cota é seu lugar reservado no grupo, cada pessoa tem uma.",
			rationale: "Naturalidade caiu por jargão sem explicação em leigo+imóvel.",
		},
	],
	suggestedForbiddenTopics: [],
	suggestedHandoffTriggers: [],
};

const baseArgs = {
	transcript: "=== CONVERSA ===\n[Turn 1 · USER] oi\n",
	evaluation: {
		overallScore: 0.45,
		dimensions: null,
		flags: null,
		topIssues: ["Citou 'cota' sem explicar"],
		topStrengths: null,
	},
	persona: {
		id: "helena-imovel",
		displayName: "Helena",
		voiceTone: "consultiva e didática",
		examples: [],
		forbiddenTopics: [],
		handoffTriggers: [],
	},
	context: {
		expertise: "leigo",
		category: "imovel",
		channel: "whatsapp" as const,
		intent: null,
	},
};

afterEach(() => {
	__resetGenerateObjectImplForTests();
});

describe("diagnoseConversation", () => {
	it("retorna result + tokens em formato AI SDK 6", async () => {
		__setGenerateObjectImplForTests(
			vi.fn().mockResolvedValue({
				object: validResult,
				usage: { inputTokens: 3000, outputTokens: 300 },
			}) as never,
		);
		const out = await diagnoseConversation(baseArgs);
		expect(out.result).toEqual(validResult);
		expect(out.tokensInput).toBe(3000);
		expect(out.tokensOutput).toBe(300);
		expect(out.durationMs).toBeGreaterThanOrEqual(0);
	});

	it("aceita formato legacy de usage (promptTokens/completionTokens)", async () => {
		__setGenerateObjectImplForTests(
			vi.fn().mockResolvedValue({
				object: validResult,
				usage: { promptTokens: 3000, completionTokens: 300 },
			}) as never,
		);
		const out = await diagnoseConversation(baseArgs);
		expect(out.tokensInput).toBe(3000);
		expect(out.tokensOutput).toBe(300);
	});

	it("retry: 1ª falha + 2ª sucesso → retorna ok", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("transient"))
			.mockResolvedValueOnce({
				object: validResult,
				usage: { inputTokens: 100, outputTokens: 50 },
			});
		__setGenerateObjectImplForTests(fn as never);

		const out = await diagnoseConversation(baseArgs);
		expect(out.result).toEqual(validResult);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("2 falhas → DiagnosisError com cause", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("network down"));
		__setGenerateObjectImplForTests(fn as never);

		await expect(diagnoseConversation(baseArgs)).rejects.toBeInstanceOf(DiagnosisError);
		expect(fn).toHaveBeenCalledTimes(2);
	});
});

describe("buildDiagnosisPrompt — estrutura", () => {
	it("inclui transcript, avaliação, contexto e persona", () => {
		const prompt = buildDiagnosisPrompt(baseArgs);
		expect(prompt).toContain("=== AVALIAÇÃO ===");
		expect(prompt).toContain("=== TRANSCRIPT ===");
		expect(prompt).toContain("=== CONTEXTO DA CONVERSA ===");
		expect(prompt).toContain("=== PERSONA ATIVA");
		expect(prompt).toContain("0.45"); // overall score
		expect(prompt).toContain("Citou 'cota' sem explicar"); // top issue
		expect(prompt).toContain("Helena"); // persona name
		expect(prompt).toContain("whatsapp"); // channel
		expect(prompt).toContain("leigo"); // expertise
	});

	it("lista exemplos existentes pra o LLM não duplicar", () => {
		const prompt = buildDiagnosisPrompt({
			...baseArgs,
			persona: {
				...baseArgs.persona,
				examples: [
					{
						id: "e1",
						userMessage: "como funciona?",
						assistantResponse: "É um grupo...",
						whenExpertise: ["leigo"],
					},
				],
			},
		});
		expect(prompt).toContain("exemplos atuais (NÃO duplique)");
		expect(prompt).toContain("expertise=leigo");
		expect(prompt).toContain("como funciona?");
	});

	it("omite seções de persona quando não há tópicos/triggers/exemplos", () => {
		const prompt = buildDiagnosisPrompt(baseArgs);
		expect(prompt).not.toContain("tópicos proibidos atuais");
		expect(prompt).not.toContain("triggers de handoff atuais");
		expect(prompt).not.toContain("exemplos atuais (NÃO duplique)");
	});
});

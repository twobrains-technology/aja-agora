import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__resetGenerateObjectImplForTests,
	__setGenerateObjectImplForTests,
	JudgeError,
	judgeConversation,
	sanitizeUnicode,
} from "./judge";
import type { JudgeResult } from "./rubric";
import type { DeterministicSignals } from "./signals";

const validResult: JudgeResult = {
	dimensions: {
		engajamento: { score: 0.9, reasoning: "x" },
		discovery: { score: 0.8, reasoning: "x" },
		continuidade: { score: 0.7, reasoning: "x" },
		naturalidade: { score: 0.85, reasoning: "x" },
		assertividade: { score: 0.95, reasoning: "x" },
	},
	flags: {
		hallucination: false,
		missedHandoff: false,
		incompleteDiscovery: false,
		lowEngagement: false,
	},
	topIssues: [],
	topStrengths: ["Coleta natural"],
};

const baseArgs = {
	transcript: "T",
	personas: [{ personaId: "x", voiceTone: "y", forbiddenTopics: [] }],
	signals: {
		replyRate: 1,
		qualifyCoverage: 1,
		qualifyMissing: [],
		numbersInTextFlagged: [],
		dropOffGate: null,
		conversionStage: "qualificado",
		hasLead: true,
		personaSegments: [],
	} satisfies DeterministicSignals,
};

afterEach(() => {
	__resetGenerateObjectImplForTests();
});

describe("judgeConversation", () => {
	it("propaga result + tokens em ambos formatos de usage (AI SDK 6 e legacy)", async () => {
		// Modern AI SDK 6: inputTokens / outputTokens
		__setGenerateObjectImplForTests(
			vi.fn().mockResolvedValue({
				object: validResult,
				usage: { inputTokens: 4500, outputTokens: 480 },
			}) as never,
		);
		let out = await judgeConversation(baseArgs);
		expect(out.tokensInput).toBe(4500);
		expect(out.tokensOutput).toBe(480);

		// Legacy: promptTokens / completionTokens
		__setGenerateObjectImplForTests(
			vi.fn().mockResolvedValue({
				object: validResult,
				usage: { promptTokens: 100, completionTokens: 50 },
			}) as never,
		);
		out = await judgeConversation(baseArgs);
		expect(out.tokensInput).toBe(100);
		expect(out.tokensOutput).toBe(50);

		// Sem usage: zeros (defensivo)
		__setGenerateObjectImplForTests(vi.fn().mockResolvedValue({ object: validResult }) as never);
		out = await judgeConversation(baseArgs);
		expect(out.tokensInput).toBe(0);
	});

	it("retry resolve falha transitória (1 erro + 1 sucesso = OK)", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("network blip"))
			.mockResolvedValueOnce({ object: validResult, usage: {} });
		__setGenerateObjectImplForTests(fn as never);

		const out = await judgeConversation(baseArgs);
		expect(out.result).toEqual(validResult);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("após 2 falhas lança JudgeError preservando causa original", async () => {
		const original = new Error("network down");
		const fn = vi.fn().mockRejectedValue(original);
		__setGenerateObjectImplForTests(fn as never);

		try {
			await judgeConversation(baseArgs);
			expect.fail("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(JudgeError);
			expect((err as JudgeError).cause).toBe(original);
			expect(fn).toHaveBeenCalledTimes(2);
		}
	});
});

describe("sanitizeUnicode", () => {
	it("preserva texto válido sem mudança", () => {
		const out = sanitizeUnicode("oi 👋 tudo bem? café R$ 1.500");
		expect(out.text).toBe("oi 👋 tudo bem? café R$ 1.500");
		expect(out.stripped).toBe(0);
	});

	it("substitui high surrogate solitário por replacement char", () => {
		const out = sanitizeUnicode(`high lone: \uD83D end`);
		expect(out.stripped).toBe(1);
		expect(out.text).toBe("high lone: � end");
	});

	it("substitui low surrogate solitário por replacement char", () => {
		const out = sanitizeUnicode(`low lone: \uDC00 end`);
		expect(out.stripped).toBe(1);
		expect(out.text).toBe("low lone: � end");
	});

	it("preserva surrogate pairs válidos (emojis)", () => {
		const emoji = "😀"; // U+1F600 = surrogate pair 😀
		const out = sanitizeUnicode(`hello ${emoji}`);
		expect(out.stripped).toBe(0);
		expect(out.text).toBe(`hello ${emoji}`);
	});

	it("conta múltiplos surrogates solitários", () => {
		const out = sanitizeUnicode(`\uD800 ok \uDC00 ok \uD83D end`);
		expect(out.stripped).toBe(3);
	});
});

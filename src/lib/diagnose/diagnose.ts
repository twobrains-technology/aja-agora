// Wrapper de chamada do "doutor" — generateObject contra Claude com retry,
// mesma forma do judge (lib/eval/judge.ts). Não persiste; só executa.

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { sanitizeUnicode } from "@/lib/eval/judge";
import {
	buildDiagnosisPrompt,
	type ConversationContext,
	DIAGNOSIS_SYSTEM_PROMPT,
	type EvalSnapshot,
	type PersonaSnapshot,
} from "./prompt";
import { type DiagnosisResult, diagnosisResultSchema } from "./types";

export const DIAGNOSIS_MODEL = "claude-sonnet-4-6";

export class DiagnosisError extends Error {
	override readonly cause?: unknown;
	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "DiagnosisError";
		this.cause = cause;
	}
}

export type DiagnosisResponse = {
	result: DiagnosisResult;
	tokensInput: number;
	tokensOutput: number;
	durationMs: number;
};

export type DiagnosisArgs = {
	transcript: string;
	evaluation: EvalSnapshot;
	persona: PersonaSnapshot;
	context: ConversationContext;
};

type GenerateObjectFn = typeof generateObject;

let generateObjectImpl: GenerateObjectFn = generateObject;

export function __setGenerateObjectImplForTests(fn: GenerateObjectFn): void {
	generateObjectImpl = fn;
}

export function __resetGenerateObjectImplForTests(): void {
	generateObjectImpl = generateObject;
}

const RETRY_BACKOFF_MS = 1000;

export async function diagnoseConversation(args: DiagnosisArgs): Promise<DiagnosisResponse> {
	const rawPrompt = buildDiagnosisPrompt(args);
	const { text: prompt, stripped } = sanitizeUnicode(rawPrompt);
	if (stripped > 0) {
		console.warn(
			`[diagnose] sanitized ${stripped} lone surrogate(s) from prompt (length=${rawPrompt.length})`,
		);
	}

	const anthropic = createAnthropic();
	const start = Date.now();
	let lastError: unknown;

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const result = await generateObjectImpl({
				model: anthropic(DIAGNOSIS_MODEL),
				schema: diagnosisResultSchema,
				system: DIAGNOSIS_SYSTEM_PROMPT,
				prompt,
				temperature: 0,
			});

			const usage = result.usage as
				| {
						inputTokens?: number;
						outputTokens?: number;
						promptTokens?: number;
						completionTokens?: number;
				  }
				| undefined;

			return {
				result: result.object,
				tokensInput: usage?.inputTokens ?? usage?.promptTokens ?? 0,
				tokensOutput: usage?.outputTokens ?? usage?.completionTokens ?? 0,
				durationMs: Date.now() - start,
			};
		} catch (err) {
			lastError = err;
			if (attempt === 0) {
				await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
			}
		}
	}

	throw new DiagnosisError(
		`diagnose failed after 2 attempts: ${lastError instanceof Error ? lastError.message : "unknown error"}`,
		lastError,
	);
}

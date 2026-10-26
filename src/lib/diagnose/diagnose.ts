// Wrapper de chamada do "doutor" — generateObject contra Claude com retry,
// mesma forma do judge (lib/eval/judge.ts). Não persiste; só executa.

import { generateObject } from "ai";
import { sanitizeUnicode } from "@/lib/eval/judge";
import { createGatewayAnthropic } from "@/lib/llm/gateway-anthropic";
import { registrarUsoDeIa } from "@/lib/observability/sinais/publicar";
import { normalizarUsoDoSdk } from "@/lib/observability/sinais/uso-do-sdk";
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
	/** A conversa diagnosticada — a linha do livro-caixa é por conversa. */
	conversationId?: string | null;
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

	const anthropic = createGatewayAnthropic();
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

			// O usage vem com o TOTAL de entrada do SDK; `normalizarUsoDoSdk` separa a
			// entrada líquida das parcelas de cache que o provedor cobra à parte (P314).
			const uso = normalizarUsoDoSdk(result.usage);

			// Livro-caixa local (P314): diagnóstico é Sonnet com o transcript inteiro —
			// a chamada mais cara do fluxo de admin. Grava e segue; falha aqui não
			// derruba o diagnóstico.
			await registrarUsoDeIa({
				conversationId: args.conversationId ?? null,
				modelo: DIAGNOSIS_MODEL,
				tokensInput: uso.tokensInput,
				tokensOutput: uso.tokensOutput,
				cacheRead: uso.cacheRead,
				cacheWrite: uso.cacheWrite,
			});

			// Defesa pós-LLM: os `.min(N)` do schema Zod são silenciosamente
			// perdidos quando o AI SDK 6 traduz Zod → JSON Schema (viram só
			// `description`). O modelo pode emitir arrays vazios ou strings
			// curtas que passariam a validação estrutural mas violariam o
			// contrato semântico. Sanitiza aqui pra manter o output utilizável.
			const sanitized: DiagnosisResult = {
				...result.object,
				rootCause:
					result.object.rootCause.length < 10
						? `Análise inconclusiva: ${result.object.rootCause}`
						: result.object.rootCause,
				suggestedExamples: result.object.suggestedExamples
					.filter((ex) => ex.userMessage.length >= 3)
					.map((ex) => ({
						...ex,
						whenExpertise:
							ex.whenExpertise && ex.whenExpertise.length === 0
								? (["neutro"] as typeof ex.whenExpertise)
								: ex.whenExpertise,
					})),
			};

			return {
				result: sanitized,
				tokensInput: uso.tokensInput,
				tokensOutput: uso.tokensOutput,
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

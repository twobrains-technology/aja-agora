import { generateObject } from "ai";
import { createGatewayAnthropic } from "@/lib/llm/gateway-anthropic";
import { registrarUsoDeIa } from "@/lib/observability/sinais/publicar";
import { normalizarUsoDoSdk } from "@/lib/observability/sinais/uso-do-sdk";
import {
	buildJudgePrompt,
	type JudgeResult,
	judgeResultSchema,
	type PersonaContext,
	RUBRIC_SYSTEM_PROMPT,
} from "./rubric";
import type { DeterministicSignals } from "./signals";

export const JUDGE_MODEL = "claude-sonnet-4-6";

export class JudgeError extends Error {
	override readonly cause?: unknown;
	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "JudgeError";
		this.cause = cause;
	}
}

export type JudgeResponse = {
	result: JudgeResult;
	tokensInput: number;
	tokensOutput: number;
	durationMs: number;
};

export type JudgeArgs = {
	transcript: string;
	personas: PersonaContext[];
	signals: DeterministicSignals;
	/** A conversa julgada — a linha do livro-caixa é por conversa, e o admin
	 * descarta custo sem conversa. Ausente só na calibração offline (fixtures). */
	conversationId?: string | null;
};

type GenerateObjectFn = typeof generateObject;

// Test seam: allow tests to inject a mocked generator without touching the network.
let generateObjectImpl: GenerateObjectFn = generateObject;

export function __setGenerateObjectImplForTests(fn: GenerateObjectFn): void {
	generateObjectImpl = fn;
}

export function __resetGenerateObjectImplForTests(): void {
	generateObjectImpl = generateObject;
}

const RETRY_BACKOFF_MS = 1000;

// Surrogate solitário (high sem low ou low sem high) faz a Anthropic rejeitar
// o body JSON. Substituímos por U+FFFD pra não perder posições no transcript.
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitizeUnicode(text: string): { text: string; stripped: number } {
	let stripped = 0;
	const sanitized = text.replace(LONE_SURROGATE_RE, () => {
		stripped++;
		return "�";
	});
	return { text: sanitized, stripped };
}

export async function judgeConversation(args: JudgeArgs): Promise<JudgeResponse> {
	const rawPrompt = buildJudgePrompt(args);
	const { text: prompt, stripped } = sanitizeUnicode(rawPrompt);
	if (stripped > 0) {
		console.warn(
			`[judge] sanitized ${stripped} lone surrogate(s) from prompt (length=${rawPrompt.length})`,
		);
	}
	const anthropic = createGatewayAnthropic();
	const start = Date.now();

	let lastError: unknown;

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const result = await generateObjectImpl({
				model: anthropic(JUDGE_MODEL),
				schema: judgeResultSchema,
				system: RUBRIC_SYSTEM_PROMPT,
				prompt,
				temperature: 0,
			});

			// O usage vem com o TOTAL de entrada do SDK; `normalizarUsoDoSdk` separa a
			// entrada líquida das parcelas de cache que o provedor cobra à parte (P314).
			const uso = normalizarUsoDoSdk(result.usage);

			// Livro-caixa local (P314): o juiz é chamada de LLM em produção e, com o
			// Langfuse fora, os tokens voltavam para o caller e não deixavam rastro.
			// Grava e segue — falha aqui nunca derruba o julgamento.
			await registrarUsoDeIa({
				conversationId: args.conversationId ?? null,
				modelo: JUDGE_MODEL,
				tokensInput: uso.tokensInput,
				tokensOutput: uso.tokensOutput,
				cacheRead: uso.cacheRead,
				cacheWrite: uso.cacheWrite,
			});

			return {
				result: result.object,
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

	throw new JudgeError(
		`judge failed after 2 attempts: ${lastError instanceof Error ? lastError.message : "unknown error"}`,
		lastError,
	);
}

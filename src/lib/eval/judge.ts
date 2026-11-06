import { generateObject, generateText } from "ai";
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

// O gateway do ambiente (LiteLLM) pode expor o juiz com outro alias: `JUDGE_MODEL`
// no ambiente vence o default, sem tocar no resto do judge.
export const JUDGE_MODEL = process.env.JUDGE_MODEL?.trim() || "claude-sonnet-4-6";

export class JudgeError extends Error {
	override readonly cause?: unknown;
	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "JudgeError";
		this.cause = cause;
	}
}

/** Teto de saída do juiz: transcript longo (21 turnos) truncava o JSON e o schema não casava. */
export const JUDGE_MAX_OUTPUT_TOKENS = 8000;

/** Detalhe de diagnóstico de erro do SDK (NoObjectGeneratedError): finishReason e uso. */
export function detalheDoErroDoJuiz(err: unknown): string {
	if (!(err instanceof Error)) return "unknown error";
	const e = err as Error & { finishReason?: unknown; usage?: unknown };
	const extras: string[] = [];
	if (e.finishReason) extras.push(`finishReason=${String(e.finishReason)}`);
	if (e.usage) {
		try {
			extras.push(`usage=${JSON.stringify(e.usage)}`);
		} catch {
			// uso não serializável: segue sem ele
		}
	}
	return extras.length > 0 ? `${err.message} [${extras.join(" ")}]` : err.message;
}

/**
 * Sonda do juiz: UMA chamada mínima antes do dataset run. `chamar` é injetada
 * (o caller passa a chamada real pelo mesmo caminho do juiz). Falha → `ok:false`
 * com a mensagem pronta; o caller aborta com exit 4.
 */
export async function sondarJuiz(
	chamar: () => Promise<unknown>,
	modelo: string = JUDGE_MODEL,
): Promise<{ ok: true } | { ok: false; mensagem: string }> {
	try {
		await chamar();
		return { ok: true };
	} catch (e) {
		return {
			ok: false,
			mensagem: `JUIZ INDISPONÍVEL: modelo ${modelo} recusado pelo gateway (${e instanceof Error ? e.message : String(e)}). Defina JUDGE_MODEL com um modelo servido.`,
		};
	}
}

/** Chamada mínima real ao modelo do juiz (mesmo caminho: createGatewayAnthropic + JUDGE_MODEL). */
export async function chamadaMinimaDoJuiz(): Promise<void> {
	const anthropic = createGatewayAnthropic();
	await generateText({ model: anthropic(JUDGE_MODEL), prompt: "ok", maxOutputTokens: 8 });
}

export type CoberturaDoJuiz = { julgados: number; tentados: number; falhas: string[] };

/** Linha final + decisão: juiz morto (tentou e nada julgou) → exit 4; parcial é só hipótese. */
export function resumoDaCoberturaDoJuiz(c: CoberturaDoJuiz): { linha: string; morto: boolean } {
	const morto = c.tentados > 0 && c.julgados === 0;
	const linha = `JUIZ: ${c.julgados} de ${c.tentados} cenários com nota (${c.falhas.length} falhas${c.falhas.length > 0 ? `: ${c.falhas.join(", ")}` : ""})`;
	return { linha: morto ? `${linha}\nJUIZ MORTO` : linha, morto };
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
				maxOutputTokens: JUDGE_MAX_OUTPUT_TOKENS,
				// `temperature` OMITIDO: o gateway (litellm 1.93) rejeita o parâmetro
				// para claude-sonnet-5 (invalid_request_error: "deprecated").
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
		`judge failed after 2 attempts: ${detalheDoErroDoJuiz(lastError)}`,
		lastError,
	);
}

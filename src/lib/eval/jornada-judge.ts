// judgeJornada — LLM-as-judge da jornada canônica (Camada 3, nightly).
// Mesmo padrão do judgeConversation (judge.ts): generateObject + Sonnet,
// temperature 0, 1 retry, seam injetável pra testes (zero rede em PR).

import { generateObject } from "ai";
import { createGatewayAnthropic } from "@/lib/llm/gateway-anthropic";
import {
	buildJornadaJudgePrompt,
	JORNADA_RUBRIC_SYSTEM_PROMPT,
	type JornadaJudgeResult,
	jornadaJudgeResultSchema,
} from "./jornada-rubric";
import { sanitizeUnicode } from "./judge";

export const JORNADA_JUDGE_MODEL = "claude-sonnet-4-6";

type GenerateObjectFn = typeof generateObject;
let generateObjectImpl: GenerateObjectFn = generateObject;

export function __setJornadaGenerateObjectForTests(fn: GenerateObjectFn | null): void {
	generateObjectImpl = fn ?? generateObject;
}

const RETRY_BACKOFF_MS = 1000;

export type JornadaJudgeResponse = {
	result: JornadaJudgeResult;
	durationMs: number;
};

export async function judgeJornada(args: { transcript: string }): Promise<JornadaJudgeResponse> {
	const { text: prompt } = sanitizeUnicode(
		buildJornadaJudgePrompt({ transcript: args.transcript }),
	);
	const anthropic = createGatewayAnthropic();
	const start = Date.now();

	let lastError: unknown;
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const result = await generateObjectImpl({
				model: anthropic(JORNADA_JUDGE_MODEL),
				schema: jornadaJudgeResultSchema,
				system: JORNADA_RUBRIC_SYSTEM_PROMPT,
				prompt,
				temperature: 0,
			});
			return { result: result.object as JornadaJudgeResult, durationMs: Date.now() - start };
		} catch (err) {
			lastError = err;
			if (attempt === 0) await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
		}
	}
	throw new Error(
		`judgeJornada falhou após 2 tentativas: ${lastError instanceof Error ? lastError.message : "erro desconhecido"}`,
	);
}

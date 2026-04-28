/**
 * Turn classifier — runs once per user message before the main agent.
 *
 * Uses Vercel AI SDK 6 `generateObject` with Claude Haiku 4.5 to extract
 * structured signals from the latest message. Single call covers:
 *   - category detection (which specialist should be active)
 *   - explicit switch intent ("na verdade quero...", "mudei de ideia")
 *   - expertise level (leigo vs expert vs neutro)
 *   - self-reported confidence (used as gate before triggering transitions)
 *
 * Failure mode: if generateObject throws or times out, returns a neutral
 * fallback so the conversation continues without the classification signal.
 *
 * Reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

const anthropic = createAnthropic();

// Model used for classification. Haiku 4.5 is fast (~300-500ms p50) and
// cheap (~$0.0001/turn) which fits per-message classification well.
const CLASSIFIER_MODEL = process.env.AI_CLASSIFIER_MODEL ?? "claude-haiku-4-5-20251001";

// Hard timeout — if Haiku stalls we'd rather fall back than block the agent.
const CLASSIFIER_TIMEOUT_MS = 4000;

// ─── Schema ──────────────────────────────────────────────────────────────────

export const turnClassificationSchema = z.object({
	detectedCategory: z
		.enum(["imovel", "auto", "servicos"])
		.nullable()
		.describe(
			"Categoria de consorcio detectada na mensagem. imovel = apto/casa/terreno/comercial. auto = carro/moto/veiculo. servicos = reforma/viagem/formatura/saude/qualquer outro. null se nao houver indicacao clara nesta mensagem.",
		),
	isExplicitSwitch: z
		.boolean()
		.describe(
			'True APENAS se o usuario explicitamente sinaliza que quer trocar de assunto/categoria nesta mensagem (ex: "na verdade quero", "mudei de ideia", "esquece, prefiro", "melhor ver outro tipo"). False se ele so menciona outra categoria de passagem.',
		),
	expertiseLevel: z
		.enum(["leigo", "expert", "neutro"])
		.describe(
			"leigo: pergunta o que e consorcio, demonstra duvida basica, usa termos comuns. expert: usa jargao (lance livre/fixo/embutido, contemplacao, taxa admin, fundo reserva, prazo em meses, cilindrada, cc). neutro: nao deu sinal claro.",
		),
	confidence: z
		.enum(["high", "medium", "low"])
		.describe(
			"Sua confianca na classificacao geral. Use high apenas quando os sinais sao explicitos. Em duvida use low.",
		),
});

export type TurnClassification = z.infer<typeof turnClassificationSchema>;

// ─── Public API ──────────────────────────────────────────────────────────────

const NEUTRAL_FALLBACK: TurnClassification = {
	detectedCategory: null,
	isExplicitSwitch: false,
	expertiseLevel: "neutro",
	confidence: "low",
};

const SYSTEM_INSTRUCTION = `Voce classifica turnos de conversa de WhatsApp de um sistema de consorcio.
Sua resposta sera usada por codigo pra rotear a conversa pro especialista certo (Helena=imovel, Rafael=auto, Camila=servicos).

Regras:
- Seja preciso e conservador. Em duvida, retorne null/neutro com confidence=low.
- detectedCategory deve refletir o foco da MENSAGEM ATUAL, nao o historico.
- isExplicitSwitch e true APENAS quando o usuario sinaliza troca clara ("na verdade", "mudei de ideia", "melhor", "esquece"). Mencionar outra categoria em passagem NAO e switch.
- expertiseLevel reflete o vocabulario da mensagem atual. Se nao houver sinal, retorne neutro.

NUNCA invente sinais que nao estao no texto.`;

/**
 * Classify the latest user turn. Returns structured signals or a neutral
 * fallback if the underlying call fails.
 *
 * Pass `currentPersona` so the model can consider context (e.g., user with
 * Rafael saying "quero ver imovel" is more likely to be a switch than a
 * passing mention).
 */
export async function classifyTurn(
	text: string,
	currentPersona: string,
): Promise<TurnClassification> {
	// Skip system-injected nudges — they aren't user input.
	if (text.startsWith("[sistema:")) {
		return { ...NEUTRAL_FALLBACK, confidence: "high" };
	}

	const start = Date.now();
	try {
		const result = await Promise.race([
			generateObject({
				model: anthropic(CLASSIFIER_MODEL),
				schema: turnClassificationSchema,
				system: SYSTEM_INSTRUCTION,
				prompt: `Persona ativa atualmente: ${currentPersona}
Mensagem do usuario: "${text}"

Classifique conforme o schema.`,
			}),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("classifier timeout")), CLASSIFIER_TIMEOUT_MS),
			),
		]);

		const elapsed = Date.now() - start;
		console.log(
			`[classifier] ${elapsed}ms | category=${result.object.detectedCategory} switch=${result.object.isExplicitSwitch} expertise=${result.object.expertiseLevel} confidence=${result.object.confidence}`,
		);
		return result.object;
	} catch (err) {
		const elapsed = Date.now() - start;
		console.error(`[classifier] failed after ${elapsed}ms — falling back to neutral:`, err);
		return NEUTRAL_FALLBACK;
	}
}

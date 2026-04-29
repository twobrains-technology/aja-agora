import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { ConversationMetadata } from "./personas";

const anthropic = createAnthropic();

const EXTRACTOR_MODEL = process.env.AI_EXTRACTOR_MODEL ?? "claude-haiku-4-5-20251001";
const EXTRACTOR_TIMEOUT_MS = 4000;
const MIN_TEXT_LEN = 10;

export const qualifyExtractionSchema = z.object({
	experiencePrev: z
		.enum(["first", "returning", "doubts"])
		.nullable()
		.describe(
			"first = primeira vez/nunca fez consorcio. returning = ja tem familiaridade/ja teve. doubts = explicitamente pede pra entender antes. null se mensagem nao deixa claro.",
		),
	creditMin: z
		.number()
		.nullable()
		.describe(
			"Limite inferior do credito desejado em BRL. Ex: '50 a 100k' -> 50000. Se o usuario der so um valor isolado ('200 mil'), use null aqui e preencha apenas creditMax.",
		),
	creditMax: z
		.number()
		.nullable()
		.describe(
			"Limite superior do credito em BRL. Ex: '200 mil' -> 200000. '100 a 200k' -> 200000. null se nao mencionado.",
		),
	prazoMeses: z
		.number()
		.nullable()
		.describe(
			"Prazo desejado em meses. '2 anos'=24, '1 ano'=12, 'imediato/ja/com lance forte'=0, 'sem pressa'=120, '5 anos'=60. null se nao mencionado.",
		),
	hasLance: z
		.enum(["yes", "maybe", "no"])
		.nullable()
		.describe(
			"yes = tem reserva pra lance (afirmacao direta tipo 'tenho lance', 'tenho 30k de reserva', 'sim tenho'). no = nao tem ('nao tenho', 'sem reserva', 'por enquanto nao'). maybe = depende ('talvez', 'depende do valor', 'pode ser'). null se nao mencionado.",
		),
	confidence: z
		.enum(["high", "medium", "low"])
		.describe(
			"Confianca geral. high = sinais explicitos no texto. medium = inferencia razoavel. low = chute. So persistimos campos com confidence=high.",
		),
});

export type QualifyExtraction = z.infer<typeof qualifyExtractionSchema>;

const NEUTRAL_FALLBACK: QualifyExtraction = {
	experiencePrev: null,
	creditMin: null,
	creditMax: null,
	prazoMeses: null,
	hasLance: null,
	confidence: "low",
};

const SYSTEM_INSTRUCTION = `Voce extrai dados de qualificacao de consorcio de mensagens de WhatsApp em portugues brasileiro.
Sua resposta sera usada por codigo pra preencher metadata da conversa e decidir o que perguntar a seguir.

Regras:
- Seja preciso e conservador. Em duvida, retorne null no campo e confidence=low/medium.
- Use confidence=high APENAS quando o sinal for explicito no texto.
- Nao invente valores. "uns 200" sem unidade NAO e 200 mil — null.
- "100k", "100 mil", "R$ 100000", "cem mil" sao todos 100000.
- Para prazoMeses, traduza linguagem natural pra meses: 0=imediato, 12=1ano, 24=2anos, 36=3anos, 60=5anos, 120=10+anos/sem pressa.
- Para hasLance, so retorne yes/no/maybe quando o usuario falar especificamente sobre reserva, lance, ou capacidade de antecipar — nao confunda com prazo.

NUNCA invente sinais que nao estao no texto.`;

export async function extractQualify(
	text: string,
	meta: ConversationMetadata,
): Promise<QualifyExtraction> {
	if (text.startsWith("[sistema:")) return NEUTRAL_FALLBACK;
	if (text.length < MIN_TEXT_LEN) return NEUTRAL_FALLBACK;

	const q = meta.qualifyAnswers ?? {};
	const allFilled =
		meta.experiencePrev !== undefined &&
		q.creditMax !== undefined &&
		q.prazoMeses !== undefined &&
		q.hasLance !== undefined;
	if (allFilled) return NEUTRAL_FALLBACK;

	// Hint about pending fields lets the model promote plausible short answers
	// like "no momento nao" to high-confidence on the field being asked.
	const missing: string[] = [];
	if (!meta.experiencePrev) missing.push("experiencia previa (first/returning/doubts)");
	if (q.creditMax === undefined) missing.push("faixa de credito");
	if (q.prazoMeses === undefined) missing.push("prazo desejado em meses");
	if (!q.hasLance) missing.push("reserva pra lance (yes/maybe/no)");

	const contextHint =
		missing.length > 0 && missing.length < 4
			? `\n\nContexto: o sistema acabou de perguntar ao usuario sobre estes campos pendentes: ${missing.join(", ")}. A mensagem dele provavelmente e resposta direta a uma dessas perguntas. Para esses campos, use confidence=high quando o sinal for plausivel mesmo que curto. Exemplos: "no momento nao" / "ainda nao" / "sem reserva" como resposta a lance = high confidence hasLance=no. "uns 100 mil" como resposta a faixa de credito = high confidence creditMax=100000.`
			: "";

	const start = Date.now();
	try {
		const result = await Promise.race([
			generateObject({
				model: anthropic(EXTRACTOR_MODEL),
				schema: qualifyExtractionSchema,
				system: SYSTEM_INSTRUCTION,
				prompt: `Mensagem do usuario: "${text}"${contextHint}

Extraia os campos de qualificacao conforme o schema. Use null em campos nao mencionados.`,
			}),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("extractor timeout")), EXTRACTOR_TIMEOUT_MS),
			),
		]);

		const elapsed = Date.now() - start;
		const o = result.object;
		console.log(
			`[extractor] ${elapsed}ms | exp=${o.experiencePrev} credit=${o.creditMin}-${o.creditMax} prazo=${o.prazoMeses} lance=${o.hasLance} conf=${o.confidence}`,
		);
		return o;
	} catch (err) {
		const elapsed = Date.now() - start;
		console.error(`[extractor] failed after ${elapsed}ms — falling back to neutral:`, err);
		return NEUTRAL_FALLBACK;
	}
}

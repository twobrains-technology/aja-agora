import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { Category, ConversationMetadata } from "./personas";
import { listExpertisesByCategory } from "./personas-repo";

const anthropic = createAnthropic();

const ANALYZER_MODEL = process.env.AI_ANALYZER_MODEL ?? "claude-haiku-4-5-20251001";
const ANALYZER_TIMEOUT_MS = 4000;

export const turnAnalysisSchema = z.object({
	reasoning: z
		.string()
		.describe(
			"Frase curta (max 1 linha) explicando os sinais detectados no texto. Use pra ancorar a decisao e facilitar debug.",
		),
	detectedCategory: z
		.enum(["imovel", "auto", "servicos"])
		.nullable()
		.describe(
			"Categoria de consorcio detectada. imovel = apto/casa/terreno/comercial. auto = carro/moto/veiculo. servicos = reforma/viagem/formatura/saude/qualquer outro. null se nao houver indicacao clara nesta mensagem.",
		),
	detectedSubTopic: z
		.string()
		.nullable()
		.describe(
			'Sub-tópico/nicho dentro da categoria detectada. DEVE ser EXATAMENTE um dos valores listados na seção "Sub-topicos disponiveis" do system prompt — qualquer outro valor sera ignorado. null se a mensagem nao casa com nenhum sub-topico ou se nao ha sub-topicos cadastrados pra essa categoria.',
		),
	isExplicitSwitch: z
		.boolean()
		.describe(
			'True APENAS se o usuario explicitamente sinaliza troca de assunto/categoria nesta mensagem ("na verdade quero", "mudei de ideia", "esquece, prefiro", "melhor ver outro tipo"). False se ele so menciona outra categoria de passagem.',
		),
	expertiseLevel: z
		.enum(["leigo", "expert", "neutro"])
		.describe(
			"leigo: pergunta o que e consorcio, demonstra duvida basica, usa termos comuns. expert: usa jargao (lance livre/fixo/embutido, contemplacao, taxa admin, fundo reserva, prazo em meses, cilindrada, cc). neutro: nao deu sinal claro.",
		),
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
			"yes = tem reserva pra lance ('tenho lance', 'tenho 30k de reserva', 'sim tenho'). no = nao tem ('nao tenho', 'sem reserva', 'por enquanto nao'). maybe = depende ('talvez', 'depende do valor', 'pode ser'). null se nao mencionado.",
		),
});

export type TurnAnalysis = z.infer<typeof turnAnalysisSchema>;

const NEUTRAL_FALLBACK: TurnAnalysis = {
	reasoning: "fallback",
	detectedCategory: null,
	detectedSubTopic: null,
	isExplicitSwitch: false,
	expertiseLevel: "neutro",
	experiencePrev: null,
	creditMin: null,
	creditMax: null,
	prazoMeses: null,
	hasLance: null,
};

const BASE_SYSTEM_INSTRUCTION = `Voce analisa turnos de WhatsApp em portugues brasileiro de um sistema de consorcio.
Sua resposta sera usada por codigo pra (1) rotear pro especialista certo e (2) preencher dados de qualificacao da conversa.

Regras gerais:
- Seja preciso e conservador. Em duvida, retorne null no campo. NAO invente sinais que nao estao no texto.
- detectedCategory deve refletir o foco da MENSAGEM ATUAL, nao o historico.
- detectedSubTopic so pode usar valores EXATOS da lista. Se nenhum casa, retorne null. Nao invente sub-topicos novos.
- isExplicitSwitch e true APENAS quando o usuario sinaliza troca clara ("na verdade", "mudei de ideia", "melhor", "esquece"). Mencionar outra categoria de passagem NAO e switch.
- expertiseLevel reflete o vocabulario da mensagem atual. Sem sinal claro -> neutro.
- "100k", "100 mil", "R$ 100000", "cem mil" sao todos 100000.
- Para prazoMeses, traduza: 0=imediato/com lance forte, 12=1ano, 24=2anos, 36=3anos, 60=5anos, 120=10+anos/sem pressa.
- Para hasLance, so retorne yes/no/maybe quando o usuario falar de reserva/lance/capacidade de antecipar — nao confunda com prazo.

Exemplos:
- "olá" -> { detectedCategory: null, detectedSubTopic: null, expertiseLevel: "neutro", todos os outros null }
- "imóvel de 200k" -> { detectedCategory: "imovel", detectedSubTopic: null, isExplicitSwitch: false, expertiseLevel: "neutro", creditMax: 200000 }
- "queria fazer uma reforma" -> { detectedCategory: "servicos", detectedSubTopic: null, expertiseLevel: "neutro" }
- "quero comprar um carro de uns 80 mil em 2 anos" -> { detectedCategory: "auto", creditMax: 80000, prazoMeses: 24 }
- "ja conheço, tenho dinheiro pra dar lance" -> { experiencePrev: "returning", hasLance: "yes" }
- "lance livre embutido na cota" -> { expertiseLevel: "expert" }
- "na verdade prefiro carro" (persona ativa: imovel) -> { detectedCategory: "auto", isExplicitSwitch: true }
- "primeira vez fazendo isso" -> { experiencePrev: "first", expertiseLevel: "leigo" }
- "no momento nao" (em resposta a pergunta sobre lance) -> { hasLance: "no" }`;

function renderSubTopicSection(subTopics: Record<Category, string[]>): string {
	const lines: string[] = ["", "## Sub-topicos disponiveis (use EXATO ou null)"];
	let hasAny = false;
	for (const [cat, list] of Object.entries(subTopics)) {
		if (list.length === 0) continue;
		hasAny = true;
		lines.push(`- ${cat}: [${list.join(", ")}]`);
	}
	if (!hasAny) {
		return "\n\n## Sub-topicos disponiveis\n(Nenhuma categoria tem sub-topicos cadastrados — sempre retorne null em detectedSubTopic.)";
	}
	return lines.join("\n");
}

export async function analyzeTurn(
	text: string,
	currentPersona: string,
	meta: ConversationMetadata,
): Promise<TurnAnalysis> {
	const q = meta.qualifyAnswers ?? {};
	const allFilled =
		meta.experiencePrev !== undefined &&
		q.creditMax !== undefined &&
		q.prazoMeses !== undefined &&
		q.hasLance !== undefined;

	const missing: string[] = [];
	if (!allFilled) {
		if (!meta.experiencePrev) missing.push("experiencia previa (first/returning/doubts)");
		if (q.creditMax === undefined) missing.push("faixa de credito");
		if (q.prazoMeses === undefined) missing.push("prazo desejado em meses");
		if (!q.hasLance) missing.push("reserva pra lance (yes/maybe/no)");
	}

	const contextHint =
		missing.length > 0 && missing.length < 4
			? `\n\nContexto: o sistema acabou de perguntar ao usuario sobre estes campos pendentes: ${missing.join(", ")}. A mensagem dele provavelmente e resposta direta a uma dessas perguntas — preencha o campo correspondente quando o sinal for plausivel mesmo que curto.`
			: "";

	const subTopics = await listExpertisesByCategory().catch(() => ({
		imovel: [],
		auto: [],
		servicos: [],
	}));

	const start = Date.now();
	try {
		const result = await Promise.race([
			generateObject({
				model: anthropic(ANALYZER_MODEL),
				schema: turnAnalysisSchema,
				system: BASE_SYSTEM_INSTRUCTION + renderSubTopicSection(subTopics),
				prompt: `Persona ativa atualmente: ${currentPersona}
Mensagem do usuario: "${text}"${contextHint}

Analise conforme o schema. Use null em campos sem sinal claro.`,
			}),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("analyzer timeout")), ANALYZER_TIMEOUT_MS),
			),
		]);

		const elapsed = Date.now() - start;
		const o = result.object;
		console.log(
			`[analyzer] ${elapsed}ms | cat=${o.detectedCategory} sub=${o.detectedSubTopic} switch=${o.isExplicitSwitch} exp=${o.expertiseLevel}/${o.experiencePrev} credit=${o.creditMin}-${o.creditMax} prazo=${o.prazoMeses} lance=${o.hasLance} | ${o.reasoning}`,
		);
		return o;
	} catch (err) {
		const elapsed = Date.now() - start;
		console.error(`[analyzer] failed after ${elapsed}ms — falling back to neutral:`, err);
		return NEUTRAL_FALLBACK;
	}
}

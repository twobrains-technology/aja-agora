import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { Category, ConversationMetadata } from "./personas";
import { listExpertisesByCategory } from "./personas-repo";

const anthropic = createAnthropic();

const ANALYZER_MODEL = process.env.AI_ANALYZER_MODEL ?? "claude-haiku-4-5-20251001";
// 4s era apertado em cold starts da Anthropic — quando timeout, fallback neutro
// faz o concierge atender mesmo quando o usuario foi explicito ("quero imovel").
// 6s permite Haiku completar com folga; usuario nem percebe diferenca.
const ANALYZER_TIMEOUT_MS = 6000;

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
	userIntent: z
		.enum([
			"ready_to_proceed",
			"asking_question",
			"providing_info",
			"expressing_doubt",
			"off_topic",
			"neutral",
		])
		.describe(
			"Intencao da mensagem atual, usada pra decidir se mostra botoes estruturados ou deixa fluir conversa livre. " +
				"ready_to_proceed = quer avancar ('bora', 'vamos', 'pode ir', 'ok seguir', 'me mostra'). " +
				"asking_question = pergunta sobre o produto/processo ('como funciona o lance?', 'e o seguro?', 'quanto custa a taxa?'). " +
				"providing_info = ja respondeu/colaborou com dado concreto ('uns 200 mil', '2 anos', 'tenho reserva'). " +
				"expressing_doubt = hesitando, sem decisao ('nao sei', 'to em duvida', 'depende', 'tenho que pensar'). " +
				"off_topic = assunto fora do consorcio ('voce e robo?', 'tudo bem?', piadas, smalltalk). " +
				"neutral = afirmacao curta de acolhimento sem direcao clara ('entendi', 'ah ta', 'legal', 'show'). " +
				"Em duvida, prefira neutral.",
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
	userIntent: "neutral",
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
- Quando o usuario der so o limite inferior ("acima de 500k", "a partir de 300", "uns X pra cima", "no minimo Y"): preencha creditMin com o valor citado E creditMax com uma estimativa razoavel de teto (entre 1.5x e 2x o piso). Isso destrava o sistema sem precisar perguntar de novo. Nao retorne null em creditMax nesses casos.
- Quando o usuario der so o limite superior ("ate 400 mil", "no maximo 700", "menos de X"): preencha apenas creditMax com o valor; deixe creditMin em null (o sistema usa um piso default).
- Quando der UM valor isolado ("200 mil", "uns 80k", "tipo 150"): preencha apenas creditMax; creditMin fica null.

Exemplos:
- "olá" -> { detectedCategory: null, detectedSubTopic: null, expertiseLevel: "neutro", todos os outros null }
- "imóvel de 200k" -> { detectedCategory: "imovel", detectedSubTopic: null, isExplicitSwitch: false, expertiseLevel: "neutro", creditMax: 200000 }
- "queria fazer uma reforma" -> { detectedCategory: "servicos", detectedSubTopic: null, expertiseLevel: "neutro" }
- "quero comprar um carro de uns 80 mil em 2 anos" -> { detectedCategory: "auto", creditMax: 80000, prazoMeses: 24 }
- "ja conheço, tenho dinheiro pra dar lance" -> { experiencePrev: "returning", hasLance: "yes" }
- "lance livre embutido na cota" -> { expertiseLevel: "expert" }
- "na verdade prefiro carro" (persona ativa: imovel) -> { detectedCategory: "auto", isExplicitSwitch: true }
- "primeira vez fazendo isso" -> { experiencePrev: "first", expertiseLevel: "leigo" }
- "no momento nao" (em resposta a pergunta sobre lance) -> { hasLance: "no" }
- "acima de 500 mil" -> { creditMin: 500000, creditMax: 1000000 }
- "a partir de 300k" -> { creditMin: 300000, creditMax: 600000 }
- "uns 200 mil pra cima" -> { creditMin: 200000, creditMax: 400000 }
- "no minimo 100" -> { creditMin: 100000, creditMax: 200000 }
- "ate 400 mil" -> { creditMin: null, creditMax: 400000 }
- "no maximo 700" -> { creditMin: null, creditMax: 700000 }
- "menos de 80k" -> { creditMin: null, creditMax: 80000 }
- "uns 80k" -> { creditMin: null, creditMax: 80000 }
- "bora ver as opcoes" -> { userIntent: "ready_to_proceed" }
- "como funciona o lance livre?" -> { userIntent: "asking_question" }
- "uns 200 mil entao" -> { userIntent: "providing_info", creditMax: 200000 }
- "ainda nao sei direito" -> { userIntent: "expressing_doubt" }
- "voce e um robo?" -> { userIntent: "off_topic" }
- "entendi, legal" -> { userIntent: "neutral" }`;

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
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), ANALYZER_TIMEOUT_MS);
	try {
		const result = await generateObject({
			model: anthropic(ANALYZER_MODEL),
			schema: turnAnalysisSchema,
			system: BASE_SYSTEM_INSTRUCTION + renderSubTopicSection(subTopics),
			prompt: `Persona ativa atualmente: ${currentPersona}
Mensagem do usuario: "${text}"${contextHint}

Analise conforme o schema. Use null em campos sem sinal claro.`,
			abortSignal: controller.signal,
		});

		const elapsed = Date.now() - start;
		const o = result.object;
		console.log(
			`[analyzer] ${elapsed}ms | cat=${o.detectedCategory} sub=${o.detectedSubTopic} switch=${o.isExplicitSwitch} exp=${o.expertiseLevel}/${o.experiencePrev} credit=${o.creditMin}-${o.creditMax} prazo=${o.prazoMeses} lance=${o.hasLance} intent=${o.userIntent} | ${o.reasoning}`,
		);
		return o;
	} catch (err) {
		const elapsed = Date.now() - start;
		const reason = controller.signal.aborted ? "timeout" : "error";
		console.error(`[analyzer] ${reason} after ${elapsed}ms — falling back to neutral:`, err);
		return NEUTRAL_FALLBACK;
	} finally {
		clearTimeout(timeoutId);
	}
}

import { createGatewayAnthropic } from "@/lib/llm/gateway-anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { Category, ConversationMetadata } from "./personas";
import { listExpertisesByCategory } from "./personas-repo";

const anthropic = createGatewayAnthropic();

const ANALYZER_MODEL = process.env.AI_ANALYZER_MODEL ?? "claude-haiku-4-5";
// 4s era apertado em cold starts da Anthropic — quando timeout, fallback neutro
// faz o concierge atender mesmo quando o usuário foi explicito ("quero imovel").
// 6s permite Haiku completar com folga; usuário nem percebe diferença.
const ANALYZER_TIMEOUT_MS = 6000;

export const turnAnalysisSchema = z.object({
	reasoning: z
		.string()
		.describe(
			"Frase curta (max 1 linha) explicando os sinais detectados no texto. Use pra ancorar a decisão e facilitar debug.",
		),
	detectedCategory: z
		.enum(["imovel", "auto", "moto", "servicos"])
		.nullable()
		.describe(
			"Categoria de consórcio detectada. imovel = apto/casa/terreno/comercial. auto = carro/automóvel/caminhonete/veículo. moto = moto/motocicleta/motoneta. servicos = reforma/viagem/formatura/saúde/qualquer outro. null se não houver indicação clara nesta mensagem.",
		),
	detectedSubTopic: z
		.string()
		.nullable()
		.describe(
			'Sub-tópico/nicho dentro da categoria detectada. DEVE ser EXATAMENTE um dos valores listados na seção "Sub-topicos disponíveis" do system prompt — qualquer outro valor será ignorado. null se a mensagem não casa com nenhum sub-topico ou se não ha sub-topicos cadastrados pra essa categoria.',
		),
	isExplicitSwitch: z
		.boolean()
		.describe(
			'True APENAS se o usuário explicitamente sinaliza troca de assunto/categoria nesta mensagem ("na verdade quero", "mudei de ideia", "esquece, prefiro", "melhor ver outro tipo"). False se ele só menciona outra categoria de passagem.',
		),
	expertiseLevel: z
		.enum(["leigo", "expert", "neutro"])
		.describe(
			"leigo: pergunta o que e consórcio, demonstra dúvida básica, usa termos comuns. expert: usa jargão (lance livre/fixo/embutido, contemplação, taxa admin, fundo reserva, prazo em meses, cilindrada, cc). neutro: não deu sinal claro.",
		),
	experiencePrev: z
		.enum(["first", "returning", "doubts"])
		.nullable()
		.describe(
			"first = primeira vez/nunca fez consórcio. returning = já tem familiaridade/já teve. doubts = explicitamente pede pra entender antes. null se mensagem não deixa claro.",
		),
	creditMin: z
		.number()
		.nullable()
		.describe(
			"Limite inferior do crédito desejado em BRL. Ex: '50 a 100k' -> 50000. Se o usuário der só um valor isolado ('200 mil'), use null aqui e preencha apenas creditMax.",
		),
	creditMax: z
		.number()
		.nullable()
		.describe(
			"Limite superior do crédito em BRL. Ex: '200 mil' -> 200000. '100 a 200k' -> 200000. null se não mencionado.",
		),
	prazoMeses: z
		.number()
		.nullable()
		.describe(
			"Prazo desejado em meses. '2 anos'=24, '1 ano'=12, 'imediato/já/com lance forte'=0, 'sem pressa'=120, '5 anos'=60. null se não mencionado.",
		),
	hasLance: z
		.enum(["yes", "maybe", "no", "so_parcela"])
		.nullable()
		.describe(
			"yes = tem reserva pra lance ('tenho lance', 'tenho 30k de reserva', 'sim tenho'). no = não tem ('não tenho', 'sem reserva', 'por enquanto não'). maybe = depende ('talvez', 'depende do valor', 'pode ser'). so_parcela = RECUSA EXPLÍCITA de qualquer conversa de lance, só quer pagar a parcela fixa ('não quero comprometer nada além da parcela', 'só a parcela mesmo', 'prefiro só ir pagando', 'sem lance nenhum, só parcela') — diferente de 'no' (que ainda é candidato à educação de lance embutido). null se não mencionado.",
		),
	desiredItem: z
		.string()
		.nullable()
		.describe(
			"FIX-233 (gate `desire`, não bloqueante): o bem específico que o usuário tem em mente, em texto livre curto (ex: 'um Corolla', 'apê de 2 quartos', 'uma NC 750'). Preencha só quando ele nomear o item concreto, não a categoria genérica. null se não mencionado.",
		),
	motivation: z
		.string()
		.nullable()
		.describe(
			"FIX-233 (gate `desire`): o motivo/gatilho de querer o bem agora, em texto livre curto (ex: 'carro vive na oficina', 'família cresceu', 'quer trocar de vida'). null se não mencionado.",
		),
	userIntent: z
		.enum([
			"ready_to_proceed",
			"wants_more_options",
			"asking_question",
			"providing_info",
			"expressing_doubt",
			"off_topic",
			"neutral",
		])
		.describe(
			"Intenção da mensagem atual, usada pra decidir se mostra botoes estruturados ou deixa fluir conversa livre. " +
				"ready_to_proceed = quer AVANÇAR no funil / prosseguir pra próxima etapa ('bora', 'vamos', 'pode ir', 'ok seguir', 'quero começar'). " +
				"wants_more_options = quer ver MAIS/TODAS/OUTRAS opções ALÉM das que já foram mostradas ('quero ver todos', 'ver todas as opções', 'tem mais opções?', 'mostra as outras', 'quero ver mais', 'só essas?'). NÃO confundir com ready_to_proceed: aqui o usuário NÃO quer decidir/avançar, quer AMPLIAR o que viu. Só use quando já houve uma apresentação de opções antes. " +
				"asking_question = pergunta sobre o produto/processo ('como funciona o lance?', 'e o seguro?', 'quanto custa a taxa?'). " +
				"providing_info = já respondeu/colaborou com dado concreto ('uns 200 mil', '2 anos', 'tenho reserva'). " +
				"expressing_doubt = hesitando, sem decisão ('não sei', 'to em dúvida', 'depende', 'tenho que pensar'). " +
				"off_topic = assunto fora do consórcio ('você e robô?', 'tudo bem?', piadas, smalltalk). " +
				"neutral = afirmação curta de acolhimento sem direção clara ('entendi', 'ah ta', 'legal', 'show'). " +
				"Em dúvida, prefira neutral.",
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
	desiredItem: null,
	motivation: null,
	userIntent: "neutral",
};

export const BASE_SYSTEM_INSTRUCTION = `Você analisa turnos de WhatsApp em portugues brasileiro de um sistema de consórcio.
Sua resposta será usada por codigo pra (1) rotear pro especialista certo e (2) preencher dados de qualificação da conversa.

Regras gerais:
- Seja preciso e conservador. Em dúvida, retorne null no campo. NÃO invente sinais que não estao no texto.
- detectedCategory deve refletir o foco da MENSAGEM ATUAL, não o histórico.
- detectedSubTopic só pode usar valores EXATOS da lista. Se nenhum casa, retorne null. Não invente sub-topicos novos.
- isExplicitSwitch e true APENAS quando o usuário sinaliza troca clara ("na verdade", "mudei de ideia", "melhor", "esquece"). Mencionar outra categoria de passagem NÃO e switch.
- expertiseLevel reflete o vocabulário da mensagem atual. Sem sinal claro -> neutro.
- "100k", "100 mil", "R$ 100000", "cem mil" são todos 100000.
- Para prazoMeses, traduza: 0=imediato/com lance forte, 12=1ano, 24=2anos, 36=3anos, 60=5anos, 120=10+anos/sem pressa.
- prazoMeses SÓ deve ser preenchido quando houver menção explicita de TEMPO/horizonte ("em 2 anos", "daqui a 18 meses", "o mais rápido possível", "sem pressa"). ORÇAMENTO/parcela mensal NÃO e prazo: "R$ 850 por mês", "850 mensais", "pago 800/mês", "cabe 1000 no mês" dizem QUANTO a pessoa paga por mês, não o horizonte de tempo. Na dúvida sobre prazo, prazoMeses=null (o sistema pergunta o prazo num passo próprio).
- Para hasLance, só retorne yes/no/maybe/so_parcela quando o usuário falar de reserva/lance/capacidade de antecipar — não confunda com prazo. so_parcela é RECUSA EXPLÍCITA de qualquer lance (quer só pagar a parcela fixa) — diferente de "no" (ainda pode ser educado sobre lance embutido depois).
- desiredItem e motivation (FIX-233, gate "desire" não bloqueante): preencha só quando o usuário nomear o bem específico ("um Corolla", "apê de 2 quartos") e/ou o motivo de querer agora ("carro vive na oficina", "família cresceu"). Ambos null se não mencionado — não invente a partir da categoria genérica.
- Quando o usuário der só o limite inferior ("acima de 500k", "a partir de 300", "uns X pra cima", "no mínimo Y"): preencha creditMin com o valor citado E creditMax com uma estimativa razoável de teto (entre 1.5x e 2x o piso). Isso destrava o sistema sem precisar perguntar de novo. Não retorne null em creditMax nesses casos.
- Quando o usuário der só o limite superior ("até 400 mil", "no máximo 700", "menos de X"): preencha apenas creditMax com o valor; deixe creditMin em null (o sistema usa um piso default).
- Quando der UM valor isolado ("200 mil", "uns 80k", "tipo 150"): preencha apenas creditMax; creditMin fica null.

Exemplos:
- "olá" -> { detectedCategory: null, detectedSubTopic: null, expertiseLevel: "neutro", todos os outros null }
- "imóvel de 200k" -> { detectedCategory: "imovel", detectedSubTopic: null, isExplicitSwitch: false, expertiseLevel: "neutro", creditMax: 200000 }
- "queria fazer uma reforma" -> { detectedCategory: "servicos", detectedSubTopic: null, expertiseLevel: "neutro" }
- "quero comprar um carro de uns 80 mil em 2 anos" -> { detectedCategory: "auto", creditMax: 80000, prazoMeses: 24 }
- "carro de 80 mil, uns 850 por mês" -> { detectedCategory: "auto", creditMax: 80000, prazoMeses: null }  // 850/mês e orçamento mensal, NÃO prazo
- "quero um imovel de 300k, pago uns 2 mil mensais" -> { detectedCategory: "imovel", creditMax: 300000, prazoMeses: null }  // 2 mil mensais e orçamento, NÃO prazo
- "já conheço, tenho dinheiro pra dar lance" -> { experiencePrev: "returning", hasLance: "yes" }
- "lance livre embutido na cota" -> { expertiseLevel: "expert" }
- "na verdade prefiro carro" (persona ativa: imovel) -> { detectedCategory: "auto", isExplicitSwitch: true }
- "primeira vez fazendo isso" -> { experiencePrev: "first", expertiseLevel: "leigo" }
- "no momento não" (em resposta a pergunta sobre lance) -> { hasLance: "no" }
- "não quero comprometer nada além da parcela" -> { hasLance: "so_parcela" }
- "só a parcela mesmo, sem lance nenhum" -> { hasLance: "so_parcela" }
- "quero um Corolla, meu carro vive na oficina" -> { detectedCategory: "auto", desiredItem: "um Corolla", motivation: "carro vive na oficina" }
- "acima de 500 mil" -> { creditMin: 500000, creditMax: 1000000 }
- "a partir de 300k" -> { creditMin: 300000, creditMax: 600000 }
- "uns 200 mil pra cima" -> { creditMin: 200000, creditMax: 400000 }
- "no mínimo 100" -> { creditMin: 100000, creditMax: 200000 }
- "até 400 mil" -> { creditMin: null, creditMax: 400000 }
- "no máximo 700" -> { creditMin: null, creditMax: 700000 }
- "menos de 80k" -> { creditMin: null, creditMax: 80000 }
- "uns 80k" -> { creditMin: null, creditMax: 80000 }
- "bora ver as opções" -> { userIntent: "ready_to_proceed" }  // avanço no funil (ainda não viu opções)
- "quero ver todos" -> { userIntent: "wants_more_options" }  // JÁ viu um conjunto, quer ver MAIS/TODAS
- "tem mais opções?" -> { userIntent: "wants_more_options" }
- "me mostra as outras dessa faixa" -> { userIntent: "wants_more_options" }
- "como funciona o lance livre?" -> { userIntent: "asking_question" }
- "uns 200 mil então" -> { userIntent: "providing_info", creditMax: 200000 }
- "ainda não sei direito" -> { userIntent: "expressing_doubt" }
- "você e um robô?" -> { userIntent: "off_topic" }
- "entendi, legal" -> { userIntent: "neutral" }`;

function renderSubTopicSection(subTopics: Record<Category, string[]>): string {
	const lines: string[] = ["", "## Sub-topicos disponíveis (use EXATO ou null)"];
	let hasAny = false;
	for (const [cat, list] of Object.entries(subTopics)) {
		if (list.length === 0) continue;
		hasAny = true;
		lines.push(`- ${cat}: [${list.join(", ")}]`);
	}
	if (!hasAny) {
		return "\n\n## Sub-topicos disponíveis\n(Nenhuma categoria tem sub-topicos cadastrados — sempre retorne null em detectedSubTopic.)";
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
		if (!meta.experiencePrev) missing.push("experiência previa (first/returning/doubts)");
		if (q.creditMax === undefined) missing.push("faixa de crédito");
		if (q.prazoMeses === undefined) missing.push("prazo desejado em meses");
		if (!q.hasLance) missing.push("reserva pra lance (yes/maybe/no)");
	}

	const contextHint =
		missing.length > 0 && missing.length < 4
			? `\n\nContexto: o sistema acabou de perguntar ao usuário sobre estes campos pendentes: ${missing.join(", ")}. A mensagem dele provavelmente e resposta direta a uma dessas perguntas — preencha o campo correspondente quando o sinal for plausível mesmo que curto.`
			: "";

	const subTopics = await listExpertisesByCategory().catch(() => ({
		imovel: [],
		auto: [],
		moto: [],
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
Mensagem do usuário: "${text}"${contextHint}

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

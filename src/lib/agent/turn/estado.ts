// O ESTADO DO TURNO — contrato de dados, sem framework.
//
// Este módulo é a parte do estado que NÃO depende de LangGraph: os tipos do funil
// (`FunnelState`, `FunnelQualifyAnswers`), o mapa de chaves e `funnelFromMeta`.
// Ele nasceu da extração do estado do runtime anterior (B2 da campanha 2026-10-19) por
// um motivo só: com o pi como runtime, o estado do turno é um OBJETO comum
// montado e devolvido por funções, não um canal de `Annotation` com reducer.
//
// Regra que continua valendo: o estado guarda FATO (posição no funil, oferta
// ancorada, o que está na tela). Como o agente FALA vem da caixa.

import type { Gate, UserIntent } from "@/lib/agent/funil-tipos";
import type { Channel, TurnEvent, TurnInput } from "@/lib/agent/orchestrator/types";
import type { Category, ConversationMetadata, ExperiencePrev, Persona } from "@/lib/agent/personas";

/** O contrato que `runTurnLangGraph` cumpre — mesma assinatura de
 * `runTurnVercel` (orchestrator/index.ts), o que faz do dispatcher (FIX-355)
 * uma troca sem custo de tipos nos dois lados. */
export type RuntimeAdapter = (input: TurnInput) => AsyncGenerator<TurnEvent>;

/** Subconjunto de `QualifyAnswers` (personas.ts) que o slice desta fundação
 * lê/escreve. Tipo estrutural (não `Pick<>`) — os campos batem 1:1 com os de
 * `ConversationMetadata["qualifyAnswers"]` de propósito, pra `projectToMeta`
 * fazer merge raso sem transformação. */
export type FunnelQualifyAnswers = {
	creditMin?: number;
	creditMax?: number;
	/** FIX-377 — piso informado pela Bevi (`MinCreditError.minCredit`). Precede
	 * o default do código ao decidir se a faixa é buscável. */
	creditoMinimoInformado?: number;
	desiredItem?: string;
	motivation?: string;
	// FIX-360 (funil completo, Rodada 1) — campos dos gates pós-reveal
	// (timeframe/lance/lance-value/lance-embutido). Mesmos nomes/tipos de
	// `QualifyAnswers` (personas.ts) de propósito — `projectToMeta` faz merge
	// raso sem transformação.
	prazoMeses?: number;
	/** "contemplacao_rapida" | "investimento" — derivado do prazo escolhido
	 * (`objetivoForPrazo`). Quem escolhe investimento quer a MENOR PARCELA, e
	 * isso muda o que a descoberta procura (prazo mais longo). */
	objetivo?: ConversationMetadata["qualifyAnswers"] extends infer Q
		? Q extends { objetivo?: infer O }
			? O
			: never
		: never;
	hasLance?: "yes" | "maybe" | "no" | "so_parcela";
	lanceValue?: number;
	lanceEmbutido?: boolean;
	lanceEmbutidoPercent?: 30 | 50;
	valorDoBemAlvo?: number;
	/** Parcela que o cliente disse que cabe no bolso — reposiciona a faixa de busca. */
	parcelaAlvo?: number;
	/** Discriminante do alvo da busca: valor do bem ou parcela (`qualify-answers.ts`). */
	alvoDeBusca?: "valor" | "parcela";
	embeddedBidDispatched?: boolean;
};

export type FunnelState = {
	currentPersona: Persona;
	currentCategory?: Category;
	desireAsked: boolean;
	// FIX-360 — marca que o gate `desire` recebeu RESPOSTA (independente do que
	// o analyzer extraiu como `desiredItem`) — já setado por `analyzeAndMerge`
	// (reusado tal-e-qual, ver `nodes/analyze.ts`); só precisava sobreviver ao
	// turno via `funnelFromMeta`/`projectToMeta`.
	desireAnswered?: boolean;
	qualifyAnswers: FunnelQualifyAnswers;
	identityCollected: boolean;
	searchDispatched: boolean;
	/** FIX-380 — quantas buscas seguidas voltaram VAZIAS. A busca vazia devolvia
	 * silêncio (sem marcar `searchDispatched`, pra liberar retry) e o modelo
	 * prometia buscar pra sempre. Contar as tentativas é o que permite parar de
	 * prometer e pedir outro valor. */
	discoveryEmptyStreak?: number;
	// FIX-360 — snapshot do `creditMax` efetivamente buscado na última
	// descoberta (equivalente a `discoveredCreditTarget` do runtime Vercel,
	// tool-policy.ts `revealValueTargetChanged`) — permite ao `route` decidir
	// re-disparar a descoberta quando o usuário pede uma faixa de valor NOVA
	// pós-reveal, sem re-buscar em afirmativos curtos na MESMA faixa.
	discoveredCreditTarget?: number;
	/** O par do `discoveredCreditTarget` para o alvo por PARCELA: a parcela que
	 * a última busca de fato levou à Bevi. Sem ele, quem trocasse o alvo de
	 * valor para parcela nunca re-disparava a descoberta — a busca ficava presa
	 * na faixa antiga e o cliente ouvia promessa sem card. */
	discoveredParcelaTarget?: number;
	/** A oferta ancorada é de uma busca ANTERIOR e a última busca voltou vazia.
	 *
	 * Apagar `recommendedOffer` na busca vazia parecia certo, mas some com a
	 * âncora de um card que CONTINUA na tela — o cliente é convidado a escolher
	 * uma oferta que o estado não conhece mais, e o contrato perde a referência.
	 * Marcar é o que separa as duas coisas: o agente não pode AFIRMAR que
	 * encontrou (a busca nova voltou vazia), mas a cota visível continua
	 * escolhível e contratável. */
	recommendedOfferStale?: boolean;
	/** Ver `ConversationMetadata.bemAbandonado`. */
	bemAbandonado?: { categoria: Category; valor?: number };
	revealCompleted: boolean;
	recommendedAdministradora?: string;
	recommendedOffer?: ConversationMetadata["recommendedOffer"];
	/** A cota do CONTRATO — só de ação estruturada. Ver personas.ts (FIX-413). */
	contractOffer?: ConversationMetadata["contractOffer"];
	// FIX-360 — rapport (motivo + espelho, `qualify-state.ts` `shouldAskMotive`/
	// `shouldMirrorMotivation`, reusados tal-e-qual): marca que o beat de cada
	// turno-próprio já rodou, pra não repetir a pergunta/o espelho.
	motivationAsked?: boolean;
	motivationMirrored?: boolean;
	// FIX-360 — pós-reveal (`experience`/`doubts-wait`, D2 do ADR
	// agente-vendas-consorcio): experiência do usuário com consórcio +
	// resolução do beat de dúvidas.
	experiencePrev?: ExperiencePrev;
	doubtsAddressed?: boolean;
	/** A explicação de COMO FUNCIONA o consórcio já foi dada a este cliente.
	 * Existe porque perguntar "primeira vez?" e não explicar nada é o
	 * comportamento de formulário que este produto combate — e porque a
	 * explicação precisa acontecer UMA vez, não a cada turno. */
	explicouComoFunciona?: boolean;
	/** O gate `experience` já foi PERGUNTADO — ver `ConversationMetadata`. */
	experienceDispatched?: boolean;
	/** O card do gate `name` já cedeu a vez UMA vez pra uma pergunta que o
	 * modelo fez sobre outro assunto. É o que impede o adiamento de virar
	 * refém: no turno seguinte o card sai de qualquer jeito. Ver
	 * `deveEmitirCardDeNome` (emit-card.ts) e o FIX-379. */
	nameCardAdiado?: boolean;
	/** O card do gate `name` saiu no TURNO ANTERIOR — e só nele.
	 *
	 *  É o fato de servidor que autoriza `captureAnswerNode` a ler uma resposta
	 *  curta como o nome da pessoa. Sem ele, a captura se apoiava só em "o gate
	 *  ativo é `name`" — premissa verdadeira enquanto esse gate só existia no
	 *  primeiro contato, e que quebrou em 30/08/2026, quando ele desceu para
	 *  depois do valor do bem.
	 *
	 *  O que a quebra produzia: o MODELO pergunta "novo ou usado?", o cliente
	 *  responde "SUV" — ao modelo —, e o servidor grava `contactName = "Suv"`.
	 *  Mesma família dos leads que nasceram "Uma", "Sujo" e "Voltei", até aqui
	 *  combatida por lista de palavras.
	 *
	 *  **É de UM TURNO, não monotônico** — e essa distinção é o item inteiro.
	 *  Com "já apareceu alguma vez", a guarda ficava desarmada pelo resto da
	 *  conversa: bastava o cliente perguntar a taxa de administração (o card é
	 *  suprimido, `answeredGate` continua `name`, o modelo emenda "prefere prazo
	 *  curto ou longo?") para "Curto" virar o nome dele no turno seguinte.
	 *  `captureAnswerNode` consome e apaga; `emitCardNode` remarca quando o card
	 *  sai de novo. */
	nameCardExibido?: boolean;
	/** Quantas falas do CLIENTE esta conversa já teve, contadas pelo `persist`.
	 *
	 *  Existe porque `state.messages.length` NÃO serve para isso: `run-turn.ts`
	 *  monta a lista por dois caminhos (banco no primeiro turno, checkpointer +
	 *  `resume` nos seguintes), e a fala corrente entra em momentos diferentes em
	 *  cada um. Medido ao vivo em 30/08/2026, a contagem por mensagem deu
	 *  0 → 1 → 3 numa conversa de três falas.
	 *
	 *  Turno de SERVIDOR (directive, retomada) não incrementa — não é fala do
	 *  cliente, e contá-la gastaria o índice 0, que é o que o score
	 *  `primeira_resposta_com_numero` observa. */
	turnosDoCliente?: number;
	/** O funil DESISTIU de perguntar o nome, depois de tentar sem progresso.
	 *
	 *  É o escape do gate `name` na posição nova (depois do valor do bem). Sem
	 *  ele, o cliente que responde algo que `extractName` recusa — "prefiro não
	 *  dizer", "depois" — trava para sempre: `o funil antigo` devolve `name` a cada
	 *  turno e o funil nunca chega ao `identify`. Justamente com quem já
	 *  informou o valor, que a medição de 30/08/2026 mostra ser o segmento em
	 *  que 86% entrega o CPF.
	 *
	 *  Ele NÃO fabrica nome — ao contrário dos outros defaults de escape, que
	 *  gravam um valor assumido em `qualifyAnswers`. Nome inventado chega à mesa
	 *  como se o cliente o tivesse dito, e o agente passa a chamá-lo por ele. O
	 *  escape aqui é desistir da pergunta, não responder por ele. */
	nomeDispensado?: boolean;
	// FIX-360 — card único (`topic_picker`) pro usuário novato logo após
	// `experience` resolver, antes do convite de recomendação.
	topicPickerDispatched?: boolean;
	// FIX-360 — "reveal em dois tempos": convite de recomendação
	// (`reco-consent`) e resposta reconhecida.
	recoConsentDispatched?: boolean;
	recoConsentAnswered?: boolean;
	/** O convite foi RECUSADO ("prefiro comparar sozinho"). O funil segue igual —
	 * só não impõe o hero. Existe pra telemetria/tom, nunca pra travar. */
	recoConsentDeclined?: boolean;
	// FIX-361 — payload JÁ coagido (I3) do hero, guardado por `discoveryNode`
	// quando `evaluateArtifactGuards` (regra `hero-awaits-reco-consent`)
	// suprime a emissão imediata — `emitCardNode` libera assim que
	// `recoConsentAnswered` virar true, nunca recalculado.
	pendingRecommendationCard?: ConversationMetadata["pendingRecommendationCard"];
	pendingSimulationResult?: ConversationMetadata["pendingSimulationResult"];
	// FIX-360 — convite do simulador de contemplação pós-lance.
	simulatorOfferDispatched?: boolean;
	simulatorOfferAnswered?: boolean;
	decisionDispatched: boolean;
	/** FIX-386 — aceite REAL do plano (ver `ConversationMetadata`). */
	decisionAccepted?: boolean;
	/** FIX-372: idempotência do card `scarcity`, separada de `decisionDispatched`
	 * — ver `ConversationMetadata.scarcityDispatched`. */
	scarcityDispatched?: boolean;
	/** Uma simulação de cota já foi mostrada nesta conversa — ver
	 * `ConversationMetadata.simulacaoApresentada`. */
	simulacaoApresentada?: boolean;
	/** A cota que o cliente escolheu — ver `ConversationMetadata.escolha`. */
	escolha?: ConversationMetadata["escolha"];
	/** As cotas que os ATALHOS do turno anterior ofereceram como escolha — ver
	 * `ConversationMetadata.escolhaOfertada`. */
	escolhaOfertada?: ConversationMetadata["escolhaOfertada"];
	/** O agente pediu atendimento humano. Sem isto no slice, a promessa "já
	 * encaminhei pra alguém te ajudar" não virava estado nenhum. */
	handoffSuggested?: boolean;
	handoffReason?: string;
	/** Passo 5 — o formulário de contratação já apareceu. Idempotência do card
	 * (nunca duas vezes) e pré-requisito do handler `contract-submit`
	 * (route.ts, defesa em profundidade da família FIX-12). */
	contractFormDispatched?: boolean;
};

/**
 * REGISTRO DOS CAMPOS DO SLICE — existe pra trocar disciplina por código.
 *
 * O estado do funil atravessa o turno por uma PROJEÇÃO MANUAL em dois sentidos
 * (`funnelFromMeta` na entrada, `projectToMeta` na saída) e `persistMeta`
 * SUBSTITUI a coluna `metadata` inteira. Consequência: um campo novo no
 * `FunnelState` que alguém esqueça de espalhar nas duas funções **some sem erro
 * nenhum** — o grafo escreve, a persistência não leva, e o sintoma aparece
 * turnos depois como o agente repetindo uma pergunta já respondida. Aconteceu
 * três vezes (`valorDoBemAlvo`, `parcelaAlvo`, `embeddedBidDispatched`).
 *
 * O `satisfies` abaixo faz o `tsc` recusar campo novo não registrado aqui, e o
 * teste de ida-e-volta (`state.projecao.test.ts`) itera estas chaves pra provar
 * que cada uma sobrevive ao ciclo. Juntos, tornam a classe impossível em vez de
 * dependerem de alguém lembrar.
 */
export const FUNNEL_QUALIFY_KEYS = {
	creditMin: true,
	creditMax: true,
	creditoMinimoInformado: true,
	desiredItem: true,
	motivation: true,
	prazoMeses: true,
	objetivo: true,
	hasLance: true,
	lanceValue: true,
	lanceEmbutido: true,
	lanceEmbutidoPercent: true,
	valorDoBemAlvo: true,
	parcelaAlvo: true,
	alvoDeBusca: true,
	embeddedBidDispatched: true,
} satisfies Record<keyof FunnelQualifyAnswers, true>;

export const FUNNEL_KEYS = {
	currentPersona: true,
	currentCategory: true,
	desireAsked: true,
	desireAnswered: true,
	qualifyAnswers: true,
	identityCollected: true,
	searchDispatched: true,
	discoveryEmptyStreak: true,
	discoveredCreditTarget: true,
	discoveredParcelaTarget: true,
	recommendedOfferStale: true,
	bemAbandonado: true,
	revealCompleted: true,
	recommendedAdministradora: true,
	recommendedOffer: true,
	contractOffer: true,
	motivationAsked: true,
	motivationMirrored: true,
	experiencePrev: true,
	doubtsAddressed: true,
	explicouComoFunciona: true,
	experienceDispatched: true,
	nameCardAdiado: true,
	nameCardExibido: true,
	turnosDoCliente: true,
	nomeDispensado: true,
	topicPickerDispatched: true,
	recoConsentDispatched: true,
	recoConsentAnswered: true,
	recoConsentDeclined: true,
	pendingRecommendationCard: true,
	pendingSimulationResult: true,
	simulatorOfferDispatched: true,
	simulatorOfferAnswered: true,
	decisionDispatched: true,
	decisionAccepted: true,
	scarcityDispatched: true,
	simulacaoApresentada: true,
	escolha: true,
	escolhaOfertada: true,
	handoffSuggested: true,
	handoffReason: true,
	contractFormDispatched: true,
} satisfies Record<keyof FunnelState, true>;

/** Constrói o `FunnelState` inicial a partir do `ConversationMetadata`
 * persistido (carregado do banco no início do turno) — projeção INVERSA de
 * `projectToMeta` (emit.ts). Só lê os campos do slice; o resto do meta
 * segue intacto em `AgentGraphStateType.baseMeta` pra `projectToMeta`
 * devolver no merge final. */
export function funnelFromMeta(meta: ConversationMetadata): FunnelState {
	return {
		currentPersona: meta.currentPersona ?? "concierge",
		currentCategory: meta.currentCategory,
		desireAsked: meta.desireAsked ?? false,
		desireAnswered: meta.desireAnswered,
		qualifyAnswers: {
			creditMin: meta.qualifyAnswers?.creditMin,
			creditMax: meta.qualifyAnswers?.creditMax,
			creditoMinimoInformado: meta.qualifyAnswers?.creditoMinimoInformado,
			desiredItem: meta.qualifyAnswers?.desiredItem,
			motivation: meta.qualifyAnswers?.motivation,
			prazoMeses: meta.qualifyAnswers?.prazoMeses,
			objetivo: meta.qualifyAnswers?.objetivo,
			hasLance: meta.qualifyAnswers?.hasLance,
			lanceValue: meta.qualifyAnswers?.lanceValue,
			lanceEmbutido: meta.qualifyAnswers?.lanceEmbutido,
			lanceEmbutidoPercent: meta.qualifyAnswers?.lanceEmbutidoPercent,
			valorDoBemAlvo: meta.qualifyAnswers?.valorDoBemAlvo,
			parcelaAlvo: meta.qualifyAnswers?.parcelaAlvo,
			alvoDeBusca: meta.qualifyAnswers?.alvoDeBusca,
			embeddedBidDispatched: meta.qualifyAnswers?.embeddedBidDispatched,
		},
		identityCollected: meta.identityCollected ?? false,
		searchDispatched: meta.searchDispatched ?? false,
		discoveryEmptyStreak: meta.discoveryEmptyStreak,
		discoveredCreditTarget: meta.discoveredCreditTarget,
		discoveredParcelaTarget: meta.discoveredParcelaTarget,
		recommendedOfferStale: meta.recommendedOfferStale,
		bemAbandonado: meta.bemAbandonado,
		revealCompleted: meta.revealCompleted ?? false,
		recommendedAdministradora: meta.recommendedAdministradora,
		recommendedOffer: meta.recommendedOffer,
		motivationAsked: meta.motivationAsked,
		motivationMirrored: meta.motivationMirrored,
		experiencePrev: meta.experiencePrev,
		doubtsAddressed: meta.doubtsAddressed,
		explicouComoFunciona: meta.explicouComoFunciona,
		experienceDispatched: meta.experienceDispatched,
		nameCardAdiado: meta.nameCardAdiado,
		nameCardExibido: meta.nameCardExibido,
		turnosDoCliente: meta.turnosDoCliente,
		nomeDispensado: meta.nomeDispensado,
		topicPickerDispatched: meta.topicPickerDispatched,
		recoConsentDispatched: meta.recoConsentDispatched,
		recoConsentAnswered: meta.recoConsentAnswered,
		recoConsentDeclined: meta.recoConsentDeclined,
		pendingRecommendationCard: meta.pendingRecommendationCard,
		pendingSimulationResult: meta.pendingSimulationResult,
		simulatorOfferDispatched: meta.simulatorOfferDispatched,
		simulatorOfferAnswered: meta.simulatorOfferAnswered,
		decisionDispatched: meta.decisionDispatched ?? false,
		decisionAccepted: meta.decisionAccepted,
		scarcityDispatched: meta.scarcityDispatched,
		simulacaoApresentada: meta.simulacaoApresentada,
		escolha: meta.escolha,
		escolhaOfertada: meta.escolhaOfertada,
		contractOffer: meta.contractOffer,
		handoffSuggested: meta.handoffSuggested,
		handoffReason: meta.handoffReason,
		contractFormDispatched: meta.contractFormDispatched,
	};
}

// ── O ESTADO DO TURNO, COMO OBJETO ──────────────────────────────────────────
//
// Mesma informação que o grafo carregava, com dois cortes de propósito:
//  · `historico` é texto e papel — não `BaseMessage` de framework. O runtime do
//    pi hidrata a sessão com isso, e o banco já guarda exatamente nesse formato.
//  · campos de "o que já foi empurrado ao vivo neste turno" existem aqui, porque
//    quem persiste precisa saber o que NÃO reemitir.
export type MensagemDaConversa = { role: "user" | "assistant"; content: string };

export type EstadoDoTurno = {
	historico: MensagemDaConversa[];
	conversationId: string;
	channel: Channel;
	contactName: string | null;
	isUserTurn: boolean;
	userText: string;
	isResumeGreeting: boolean;
	baseMeta: ConversationMetadata;
	/** Produzido pelo passo de leitura da mensagem (`analyze`). */
	intent?: UserIntent;
	/** O card DESTE turno (só existe quando a decisão libera mostrá-lo). */
	gate?: Gate;
	/** O gate que o funil AGUARDA, mesmo quando o card é suprimido. */
	answeredGate?: Gate;
	modelAskedQuestion: boolean;
	ancoraFalhou: boolean;
	modelAskedForName: boolean;
	pedidoDeNomeExplicito: boolean;
	apresentaOfertaNesteTurno: boolean;
	/** Artifacts já empurrados ao vivo — o persist não reemite. */
	streamedArtifactIds: string[];
	funnel: FunnelState;
	events: TurnEvent[];
};

export function estadoInicialDoTurno(args: {
	conversationId: string;
	channel: Channel;
	contactName?: string | null;
	isUserTurn: boolean;
	userText?: string | null;
	isResumeGreeting?: boolean;
	baseMeta: ConversationMetadata;
	historico?: MensagemDaConversa[];
}): EstadoDoTurno {
	return {
		historico: args.historico ?? [],
		conversationId: args.conversationId,
		channel: args.channel,
		contactName: args.contactName ?? null,
		isUserTurn: args.isUserTurn,
		userText: args.userText?.trim() ?? "",
		isResumeGreeting: args.isResumeGreeting === true,
		baseMeta: args.baseMeta,
		modelAskedQuestion: false,
		ancoraFalhou: false,
		modelAskedForName: false,
		pedidoDeNomeExplicito: false,
		apresentaOfertaNesteTurno: false,
		streamedArtifactIds: [],
		funnel: funnelFromMeta(args.baseMeta),
		events: [],
	};
}

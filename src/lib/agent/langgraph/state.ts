// Contrato de estado do grafo LangGraph (FIX-357, fundação — Rodada 0). Struct
// LIMPO: NÃO copia flags de remendo do runtime Vercel (ex.: `gateStuckTurns`,
// `pendingGateSince`) — esses existem pra segurar o if-cascade implícito do
// `nextGate()`, um problema que o grafo explícito resolve estruturalmente.
//
// `funnel` guarda só os campos do SLICE desta fundação (name→desire→credit→
// identify→discovery→reveal→decision). O resto de `ConversationMetadata`
// (~80 campos — lance, contract, whatsapp opt-in, etc.) fica de fora por
// enquanto: `run-turn.ts` faz merge do `funnel` projetado por cima do
// `ConversationMetadata` completo carregado do banco (nunca substitui os
// campos que este runtime ainda não entende) — ver `projectToMeta` em
// `emit.ts`. TODO(rodada-1): nós de funil completos (ITEM D do goal doc)
// devem estender `FunnelState` conforme cobrem mais gates.
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { Channel, TurnEvent, TurnInput } from "@/lib/agent/orchestrator/types";
import type { Category, ConversationMetadata, ExperiencePrev, Persona } from "@/lib/agent/personas";
import type { Gate, UserIntent } from "@/lib/agent/qualify-state";

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
	// FIX-360 — snapshot do `creditMax` efetivamente buscado na última
	// descoberta (equivalente a `discoveredCreditTarget` do runtime Vercel,
	// tool-policy.ts `revealValueTargetChanged`) — permite ao `route` decidir
	// re-disparar a descoberta quando o usuário pede uma faixa de valor NOVA
	// pós-reveal, sem re-buscar em afirmativos curtos na MESMA faixa.
	discoveredCreditTarget?: number;
	revealCompleted: boolean;
	recommendedAdministradora?: string;
	recommendedOffer?: ConversationMetadata["recommendedOffer"];
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
	/** A cota que o cliente escolheu — ver `ConversationMetadata.escolha`. */
	escolha?: ConversationMetadata["escolha"];
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
	discoveredCreditTarget: true,
	revealCompleted: true,
	recommendedAdministradora: true,
	recommendedOffer: true,
	motivationAsked: true,
	motivationMirrored: true,
	experiencePrev: true,
	doubtsAddressed: true,
	explicouComoFunciona: true,
	topicPickerDispatched: true,
	recoConsentDispatched: true,
	recoConsentAnswered: true,
	recoConsentDeclined: true,
	pendingRecommendationCard: true,
	pendingSimulationResult: true,
	simulatorOfferDispatched: true,
	simulatorOfferAnswered: true,
	decisionDispatched: true,
	escolha: true,
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
			embeddedBidDispatched: meta.qualifyAnswers?.embeddedBidDispatched,
		},
		identityCollected: meta.identityCollected ?? false,
		searchDispatched: meta.searchDispatched ?? false,
		discoveredCreditTarget: meta.discoveredCreditTarget,
		revealCompleted: meta.revealCompleted ?? false,
		recommendedAdministradora: meta.recommendedAdministradora,
		recommendedOffer: meta.recommendedOffer,
		motivationAsked: meta.motivationAsked,
		motivationMirrored: meta.motivationMirrored,
		experiencePrev: meta.experiencePrev,
		doubtsAddressed: meta.doubtsAddressed,
		explicouComoFunciona: meta.explicouComoFunciona,
		topicPickerDispatched: meta.topicPickerDispatched,
		recoConsentDispatched: meta.recoConsentDispatched,
		recoConsentAnswered: meta.recoConsentAnswered,
		recoConsentDeclined: meta.recoConsentDeclined,
		pendingRecommendationCard: meta.pendingRecommendationCard,
		pendingSimulationResult: meta.pendingSimulationResult,
		simulatorOfferDispatched: meta.simulatorOfferDispatched,
		simulatorOfferAnswered: meta.simulatorOfferAnswered,
		decisionDispatched: meta.decisionDispatched ?? false,
		escolha: meta.escolha,
		handoffSuggested: meta.handoffSuggested,
		handoffReason: meta.handoffReason,
		contractFormDispatched: meta.contractFormDispatched,
	};
}

export const AgentGraphState = Annotation.Root({
	...MessagesAnnotation.spec,

	// ── Contexto imutável do turno (setado uma vez na entrada) ──
	conversationId: Annotation<string>(),
	channel: Annotation<Channel>(),
	contactName: Annotation<string | null>(),
	isUserTurn: Annotation<boolean>(),
	userText: Annotation<string>(),

	// ── Snapshot completo do meta persistido — `projectToMeta` faz merge do
	// `funnel` por cima disto no fim do turno (nunca perde campos que este
	// runtime ainda não entende). ──
	baseMeta: Annotation<ConversationMetadata>(),

	// ── Produzido pelo nó `analyze` ──
	intent: Annotation<UserIntent | undefined>(),

	// ── Produzido pelo nó `route` — guarda a decisão de roteamento do turno. ──
	gate: Annotation<Gate | undefined>(),

	// O gate que o funil está AGUARDANDO, independente de o card ser exibido.
	// `gate` é zerado sempre que `decideShowGate` suprime o card — e no LangGraph
	// gravar `undefined` APAGA o canal. Sem este canal separado, o turno seguinte
	// chegava no `capture` sem saber o que o usuário está respondendo, e a captura
	// determinística (o nome) não acontecia.
	answeredGate: Annotation<Gate | undefined>({
		reducer: (a, b) => b ?? a,
		default: () => undefined,
	}),

	/** O modelo de fato FEZ uma pergunta neste turno (`hasHeldQuestion` do
	 * sanitizer), não "emitiu algum caractere". É o que decide se o card cala a
	 * pergunta canônica: com o proxy antigo (`events.some(text-delta)`) uma fala
	 * social sem pergunta desligava a rede de segurança e o turno acabava sem
	 * ninguém perguntando nada. */
	modelAskedQuestion: Annotation<boolean>({
		reducer: (a, b) => b ?? a,
		default: () => false,
	}),

	/** Este turno APRESENTA uma oferta ao cliente — a lista recém-buscada
	 * (`discovery`) ou o card de recomendação que estava pendente (`advance`).
	 * É o que separa os DOIS TEMPOS da apresentação: primeiro o vendedor conta o
	 * que encontrou e os cards entram embaixo da fala; só então, num segundo
	 * balão, ele pergunta o que precisa saber antes de recomendar UMA delas.
	 * Sem isso o modelo recebia "apresente as ofertas" e "pergunte a experiência"
	 * no mesmo contexto e resolvia as duas coisas numa frase só — a pergunta
	 * grudava no fim do anúncio e os atalhos ficavam órfãos embaixo dos cards. */
	apresentaOfertaNesteTurno: Annotation<boolean>({
		reducer: (a, b) => b ?? a,
		default: () => false,
	}),

	/** `toolCallId` dos artifacts que o `converse` já empurrou AO VIVO (pra
	 * aparecerem ENTRE os dois balões). O `persist` continua gravando todos no
	 * banco, mas não pode reemitir estes — sairia o card duplicado na tela. */
	streamedArtifactIds: Annotation<string[], string[] | null>({
		reducer: (a, b) => (b === null ? [] : a.concat(b)),
		default: () => [],
	}),

	// ── Autoridade do fluxo (mutado pelos nós conforme o turno avança) ──
	funnel: Annotation<FunnelState>(),

	// ── TurnEvents acumulados pelos nós (persist os lê no fim; run-turn.ts
	// também os re-emite via streaming em tempo real — ver `emit.ts`) ──
	// `null` como Update é sentinela de RESET (o nó `human` manda no começo de
	// cada turno) — sem isso os TurnEvents acumulariam pra sempre no checkpointer
	// e o guard intra-turno do `emitCard` acharia que cards de turnos passados
	// saíram AGORA. Update normal (`TurnEvent[]`) concatena.
	events: Annotation<TurnEvent[], TurnEvent[] | null>({
		reducer: (a, b) => (b === null ? [] : a.concat(b)),
		default: () => [],
	}),
});

export type AgentGraphStateType = typeof AgentGraphState.State;
export type AgentGraphUpdateType = typeof AgentGraphState.Update;

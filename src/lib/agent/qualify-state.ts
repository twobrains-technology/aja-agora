import { revealValueTargetChanged } from "./orchestrator/tool-policy";
import type { ConversationMetadata } from "./personas";

export type Gate =
	| "name"
	| "desire"
	| "experience"
	| "doubts-wait"
	| "credit"
	| "timeframe"
	| "lance"
	| "lance-value"
	| "lance-embutido"
	| "identify"
	| "search"
	| "simulator-offer"
	| "decision";

/**
 * FIX-208: gates de COLETA ativa — quem responde direto a um destes está
 * fornecendo o dado pedido (valor do bem, lance), então o gate dispara mesmo
 * em intent `neutral` (o analyzer é não-confiável em timeout de cold-start).
 * NÃO inclui experience/consent (binárias com card próprio que já são
 * dirigidas por clique) nem name/search/decision (fora da coleta de dados).
 * FIX-215 (2026-07-04): `lance`/`lance-value`/`lance-embutido` migraram de
 * PRÉ-search (entrada) pra PÓS-reveal no `nextGate()` — mas continuam aqui:
 * a mesma classe de bug (resposta direta classificada como `neutral` no
 * cold-start do analyzer) vale independente de onde o gate mora na sequência.
 * Exportado pra o guard rede-final (gate-reengage) re-emitir a MESMA classe.
 */
export const COLLECTION_GATES: ReadonlySet<Gate> = new Set<Gate>([
	"credit",
	"lance",
	"lance-value",
	"lance-embutido",
]);

export type UserIntent =
	| "ready_to_proceed"
	// FIX-183 (Mirella, PROD conv 69a38af1): "quero ver todos/mais opções" — o
	// usuário quer AMPLIAR o conjunto já mostrado, NÃO avançar/decidir. Sem essa
	// categoria caía em ready_to_proceed e empurrava o funil pra decisão sobre um
	// grupo não-escolhido (confabulação de entidade). Roteado em decideShowGate.
	| "wants_more_options"
	| "asking_question"
	| "providing_info"
	| "expressing_doubt"
	| "off_topic"
	| "neutral";

export function nextGate(meta: ConversationMetadata, opts?: { hasContactName?: boolean }): Gate {
	// PF-08 + FIX-17: enquanto o nome não foi capturado, o ÚNICO gate é o do
	// nome. A pergunta sai no texto do agente (directive de 1o contato) e o card
	// "name" complementa com input focado (gateQuestion('name')=null não duplica).
	// Antes era "doubts-wait" (no-op) e o nome era pedido só por texto livre —
	// inconsistente com o resto do funil e ruim no mobile (teclado não abria).
	if (opts && opts.hasContactName === false) return "name";

	// FIX-233 (handoff agente-vendas-consorcio, 2026-07-09): gate `desire`,
	// NÃO bloqueante — duas perguntas curtas (bem específico + motivo de agora),
	// logo após o nome. `desireAsked` é marcado na EMISSÃO (padrão de
	// `consentOffered`/`simulatorOfferDispatched`), não na resposta: se o
	// usuário pular, o funil segue normal — nunca mais re-emite este gate.
	if (!meta.desireAsked) return "desire";

	if (meta.pendingFollowUp) return "doubts-wait";

	// FIX-274 (Kairo, teste manual web 2026-07-11 — "remover, fiel ao mockup"): o
	// gate `consent` ("Posso te fazer 3 perguntinhas pra entender seu perfil?" +
	// botões Bora!/Entender mais antes) SAIU do funil. Depois do `desire` (carro +
	// motivo), a conversa vai direto pro `identify`. A explicação/dúvidas de
	// consórcio fica no gate `experience` (PÓS-reveal, FIX-233 D1). Sem o consent,
	// somem tanto a 2ª pergunta colidindo no mesmo balão (CK-1) quanto o "Entender
	// mais antes" cedo demais (CK-2). O motivo ("por que agora") ganha turno próprio
	// via `shouldAskMotive` (decideShowGate) pra nunca colidir com o próximo card.

	// FIX-53 (jornada2_revisão.docx — Bernardo, 2026-06-19): "Precisa pedir os
	// dados, antes do valor". O gate `identify` (CPF+celular+LGPD, cifrado, D1)
	// — que era o ÚLTIMO da qualificação — sobe para ANTES do `credit` (seletor
	// de valor / present_value_picker), logo após o consent. A Bevi exige
	// CPF+celular+LGPD antes de simular de qualquer forma (D1), então coletar
	// cedo só reforça D1. Os handlers de identidade (web/route + whatsapp/
	// processor) NÃO disparam mais o reveal — despacham o próximo gate; o reveal
	// segue sendo disparado por pipeSearchSummaryTurn no fim da qualificação.
	if (!meta.identityCollected) return "identify";

	const q = meta.qualifyAnswers ?? {};
	if (q.creditMax === undefined) return "credit";

	// (FIX-53) O gate `identify` foi movido para ANTES do `credit` — ver acima.
	// A busca real continua exigindo identidade (tripwire em pipeSearchSummaryTurn /
	// runSearchSummaryWithOrchestrator); aqui ela já foi coletada cedo.

	// FIX-215 (Refino Ata 2026-07-04, item 1 — P0): o funil pula DIRETO de
	// `credit` (valor) pra `search` — a pergunta de lance ("Pretende dar um
	// lance?") e a educação de lance embutido SAEM da entrada (reverte a
	// COLOCAÇÃO de FIX-92/118/212, não o conceito: ele só migra pro pós-reveal
	// abaixo). Motivo (Bernardo): todo consórcio tem lance; perguntar na
	// largada, antes do usuário ver qualquer oferta, não faz sentido e confunde
	// quem nem sabe o que é embutido. A busca real NÃO tem lance como
	// pré-requisito — só identidade (tool-policy.ts, `identityCollected`) — e
	// `prefsFromMeta` (discovery-session.ts) já trata `lanceEmbutido` ausente
	// como "sem embutido" (funciona sem os campos).
	//
	// Funil pós-qualificação (jornada.docx): search (passo 3+4 reveal) →
	// decision (fim do passo 4: "Esse plano faz sentido?"). searchDispatched e
	// decisionDispatched são guards de idempotência — o orquestrador dirige cada
	// etapa via directive (mirror do search reveal). Sem o passo "decision", o
	// agent re-disparava o reveal em loop e nunca cruzava pro passo 5
	// (BUG-REVEAL-LOOP, 2026-06-02).
	if (!meta.searchDispatched) return "search";
	// FIX-76 (Maria, retomada 2026-06-25): o usuário pediu um valor-alvo NOVO
	// sobre um reveal antigo (256k → 130k). A tool-policy (FIX-68) já reabria
	// search_groups no toolset via revealValueTargetChanged, mas sem reabrir o
	// GATE o orquestrador não FORÇAVA o reveal — o modelo ficava livre pra
	// alucinar "instabilidade" e ressuscitar o valor antigo como dado real
	// (viola Bevi fonte única). Reabrir aqui faz o orquestrador re-disparar a
	// busca determinística na faixa nova. Converge: o runner re-snapshota
	// discoveredCreditTarget ao produzir os cards da nova faixa →
	// revealValueTargetChanged volta a false → sem loop. Anti BUG-REVEAL-LOOP:
	// afirmativo curto na MESMA faixa (valor == descoberto) NÃO cai aqui. Tem
	// PRECEDÊNCIA sobre a conversa de lance abaixo — trocar de faixa é mais
	// urgente que continuar a qualificação de lance da faixa antiga.
	if (revealValueTargetChanged(meta)) return "search";

	// FIX-233 (handoff agente-vendas-consorcio, 2026-07-09 — D2): `experience`
	// DESCE pra depois do reveal (roda com os grupos já na tela; explica só
	// pra quem é novato — não atrasa quem já conhece consórcio). Antes era o
	// 1º gate do funil (linha logo após o nome); ver ADR
	// docs/decisoes/blocos/2026-07-09-agente-vendas-consorcio.md (D2).
	if (meta.revealCompleted) {
		if (!meta.experiencePrev) return "experience";
		if (meta.experiencePrev === "doubts" && !meta.doubtsAddressed) return "doubts-wait";

		// FIX-233 (D1 — reverte FIX-103): o gate `timeframe` (prazo desejado de
		// contemplação) REINTRODUZ, agora PÓS-recomendação — é a ponte natural
		// pro simulador de contemplação (contemplation_dial). Perguntar antes da
		// recomendação desperdiçava a pergunta (o usuário ainda não tinha visto
		// nenhuma oferta real pra ancorar a resposta).
		if (q.prazoMeses === undefined) return "timeframe";
	}

	// FIX-215 (Refino Ata 2026-07-04): a conversa de lance (recurso próprio +
	// educação de lance embutido) SÓ entra em jogo DEPOIS que o usuário JÁ VIU
	// as opções reais (revealCompleted) — nunca antes. Fica ANTES do
	// `simulator-offer` de propósito: o simulador de contemplação (P5 da
	// jornada) promete mostrar a parcela pós-contemplação CAINDO com lance
	// embutido — sem o dado coletado aqui, o dial só teria o cenário "sem
	// lance" na primeira oferta. Decisão de design registrada em
	// docs/decisoes/blocos/2026-07-04-bloco-jornada-conversa.md.
	if (meta.revealCompleted) {
		if (!q.hasLance) return "lance";
		// FIX-233 — 3ª saída do gate lance: "não quero comprometer nada além da
		// parcela". Pula lance-value/lance-embutido/simulator-offer (a "agulha")
		// por completo — o agente chama present_two_paths e devolve a decisão
		// ao usuário (sem recomendar sorteio vs. lance modesto).
		if (q.hasLance === "so_parcela") {
			if (!meta.decisionDispatched) return "decision";
			return "search"; // terminal — mesma convenção do fallback abaixo
		}
		// Jornada do doc (passo 2, linha 21-22): quem TEM reserva responde "Qual
		// valor aproximado?" — o valor do lance vem do USUÁRIO, nunca derivado
		// silenciosamente (auditoria 2026-06-04: derivação de 30% era MISSING do docx).
		if (q.hasLance === "yes" && q.lanceValue === undefined) return "lance-value";
		// Jornada do doc: TODO MUNDO passa pelo gate de lance embutido (educa +
		// opt-in) — no docx a educação é sub-bullet PARALELO ao "Se sim", e o
		// próprio texto diz que o lance embutido "ajuda quem não possui todo o
		// valor do lance hoje" (= quem respondeu Não/Talvez). FIX-4 (teste manual
		// Kairo 2026-06-05): a versão anterior pulava "maybe"/"no" — o ramo
		// educativo "sumia" e parecia intermitência.
		if (q.lanceEmbutido === undefined) return "lance-embutido";
	}

	// docx passo 4 (linha 34-36): após apresentar o plano (e a conversa de
	// lance já resolvida), OFERECER o simulador ("contemplado em 3, 6 ou 12
	// meses — que tal?") ANTES do card de decisão. Conceito do Bernardo
	// (simulador-agulha) no caminho padrão da jornada.
	if (meta.revealCompleted && !meta.simulatorOfferDispatched) return "simulator-offer";
	if (meta.revealCompleted && !meta.decisionDispatched) return "decision";
	return "search"; // terminal — com searchDispatched=true o orquestrador encerra cedo
}

/**
 * FIX-301 (P7, loop-de-goal r10) — o usuário está CONFUSO ("não entendi") num
 * turno em que já existe um gate REALMENTE aguardando resposta. Devolve o
 * `Gate` a REANCORAR (mesmo gate, sem avançar nem inventar menu), ou `null`
 * quando não há pergunta canônica re-apresentável agora.
 *
 * Caso especial: `decision`. `nextGate()` só devolve `"decision"` enquanto
 * `!meta.decisionDispatched` — assim que o card é mostrado, o dispatch marca
 * a flag e `nextGate()` avança pro terminal (`"search"`). Sem este caso à
 * parte, o usuário confuso respondendo ao PRÓPRIO card de decisão não teria
 * pra onde reancorar. Os demais gates (credit/lance/identify/…) continuam
 * corretos via `nextGate()` puro — o DADO em si (não uma flag de "já
 * mostrei") é que os mantém pendentes.
 *
 * `name`/`doubts-wait`/`search` não têm pergunta canônica re-apresentável
 * (nome vem do texto de abertura; doubts-wait é um "aguarde"; search é ação,
 * não pergunta) — devolve `null` pra esses.
 */
export function gateAwaitingReply(
	meta: ConversationMetadata,
	hasContactName: boolean,
): Gate | null {
	if (meta.revealCompleted && meta.decisionDispatched === true && meta.contractClosed !== true) {
		return "decision";
	}
	const gate = nextGate(meta, { hasContactName });
	if (gate === "name" || gate === "doubts-wait" || gate === "search") return null;
	return gate;
}

/**
 * FIX-274 — o "por que agora" (motivo, 2ª pergunta do gate `desire`) tem turno
 * próprio: enquanto o cliente já RESPONDEU ao gate `desire` (`desireAnswered`)
 * mas ainda não deu o motivo, o funil SEGURA — o LLM pergunta o motivo
 * (desireFollowUpSection) e NENHUM card estruturado é emitido junto (anti
 * CK-1: 2 perguntas no mesmo balão). NÃO-bloqueante: `motivationAsked`
 * (marcado no runner quando o beat ativa) libera o funil no turno seguinte
 * mesmo se o motivo não vier. Função PURA (Camada 1).
 *
 * FIX-285: a precondição era `Boolean(q.desiredItem)` — falhava quando o
 * usuário só nomeava a categoria genérica ("um carro", sem citar um modelo),
 * porque o `turn-analyzer.ts` devolve `desiredItem: null` POR DESIGN nesse
 * caso (não inventa item a partir da categoria). `desireAnswered` é um proxy
 * determinístico de "o gate desire recebeu uma resposta", independente do que
 * o analyzer conseguiu extrair.
 */
export function shouldAskMotive(meta: ConversationMetadata): boolean {
	const q = meta.qualifyAnswers ?? {};
	return Boolean(meta.desireAnswered) && q.motivation === undefined && !meta.motivationAsked;
}

/**
 * FIX-206 — o clique "🤔 Tenho dúvidas" dispara `buildExperienceDoubtsDirective`
 * como turno de SERVIDOR (isUserTurn=false). Esse turno JÁ é a explicação que
 * endereça as dúvidas — exatamente como quando o usuário responde por texto no
 * caminho livre. Marcar `doubtsAddressed` nos DOIS casos faz `nextGate` convergir
 * pro `consent` (que já oferece "Entendi, continuar" / "Entender mais antes") no
 * MESMO turno, matando o beco sem saída onde o funil parava em `doubts-wait` mudo
 * e o usuário tinha de digitar "continua/vai".
 *
 * Independe de `isUserTurn` — é justamente o ponto do fix (o servidor também
 * endereça). Função PURA (Camada 1 prova o invariante sem DB); o runner a consome
 * no fim do turno. Auto-avançar ≠ pular etapa: o gate de consent segue APARECENDO.
 */
export function shouldMarkDoubtsAddressed(args: {
	meta: Pick<ConversationMetadata, "experiencePrev" | "doubtsAddressed">;
	producedArtifact: boolean;
	userReplied: boolean;
}): boolean {
	return (
		!args.producedArtifact &&
		args.meta.experiencePrev === "doubts" &&
		!args.meta.doubtsAddressed &&
		args.userReplied
	);
}

/**
 * Decides whether to dispatch the next qualify gate (button) at the end of a turn.
 * The state machine still tracks WHICH gate is next; this function only decides
 * if NOW is the right moment to interrupt the conversation with structured UI.
 *
 * Rule of thumb: only fire when the user is collaborating or first contact.
 * Stay silent when they're asking, doubting, or off-topic — let the agent reply
 * conversationally and re-engage on a later turn.
 */
export function decideShowGate(args: {
	gate: Gate;
	intent: UserIntent;
	meta: ConversationMetadata;
	isUserTurn: boolean;
}): boolean {
	const { gate, intent, meta, isUserTurn } = args;
	// FIX-206: `doubts-wait` não tem card (é um "aguarde") — nunca vira gate. Um
	// turno server-authored que legitimamente resolve nele (ex.: "Entender mais
	// antes", que PERGUNTA e espera a resposta livre) já deu ao usuário um gancho:
	// não é trava. O clique "Tenho dúvidas" NÃO cai mais aqui — o runner marca
	// doubtsAddressed (shouldMarkDoubtsAddressed) e nextGate converge pro consent.
	if (gate === "doubts-wait") return false;
	// FIX-274 — o motivo ("por que agora?") tem turno próprio: enquanto pendente, o
	// LLM o pergunta e NENHUM card estruturado é emitido junto (anti CK-1, 2 perguntas
	// no mesmo balão). Só em turno de usuário; server-authored avança normal abaixo.
	if (isUserTurn && shouldAskMotive(meta)) return false;
	// FIX-275 — depois que o beat do motivo já rodou (motivationAsked), a resposta do
	// usuário (o "por que agora") quase sempre é uma QUEIXA — "cansei do carro velho,
	// vive na oficina" — que o analyzer classifica como expressing_doubt/off_topic.
	// Mas é a RESPOSTA ESPERADA, não um desvio: o `identify` tem que disparar no mesmo
	// turno (espelho do motivo + card de CPF; o card NÃO é uma 2ª pergunta). Sem isto,
	// o funil trava 1 turno até o usuário mandar "vamos" (provado no log: [gate-skip]
	// gate=identify intent=expressing_doubt). Só uma pergunta EXPLÍCITA deixa o agente
	// responder antes; o watchdog (FIX-207) re-cobra o identify se ele sumir.
	if (isUserTurn && gate === "identify" && meta.motivationAsked && !meta.identityCollected) {
		return intent !== "asking_question";
	}
	// Server-authored turns (button click, transition) are always followed by the
	// next gate — that's the whole point of the directive flow. Por isso qualquer
	// reação da qualificação (experiência/consent/valor/lance) SEMPRE mostra o
	// próximo passo no mesmo turno, sem exigir "continua/vai" do usuário (FIX-206).
	if (!isUserTurn) return true;

	// FIX-183 (Mirella, PROD conv 69a38af1, 2026-07-01): "quero ver todos/mais
	// opções" NUNCA abre gate estruturado nem empurra o funil (decisão/simulador/
	// busca). O usuário quer AMPLIAR o que já viu, não avançar sobre um grupo
	// não-escolhido — sem essa trava, o intent (antes ready_to_proceed) disparava
	// o card de decisão sobre "Embracon" (grupo nunca exibido). Default de produto
	// (AskUserQuestion 2026-07-01, ver docs/correcoes/decisions/): o agente
	// re-apresenta o comparativo conversacionalmente quando o gate NÃO dispara.
	// Governança determinística (allowlist de avanço), não regra-no-prompt (Lei 4).
	if (intent === "wants_more_options") return false;

	// "decision" — fim do passo 4 (card "Esse plano faz sentido?"). Pós-reveal,
	// dispara em sinal de avanço do usuário (ready_to_proceed: "bora", "vamos")
	// OU afirmativo neutro de acolhimento (neutral: "ta otimo", "show", "legal").
	// NÃO dispara em what-if (providing_info → re-simular), pergunta, dúvida nem
	// off-topic. Idempotência garantida por decisionDispatched no orquestrador.
	if (gate === "decision") {
		return intent === "ready_to_proceed" || intent === "neutral";
	}

	// "simulator-offer" — oferta do simulador na sequência do reveal (docx).
	// Server-authored já retornou true acima; em turno do usuário, mesmo
	// critério do decision: afirmativo avança, pergunta/dúvida deixa conversar.
	if (gate === "simulator-offer") {
		return intent === "ready_to_proceed" || intent === "neutral";
	}

	// FIX-208 (Kairo, WhatsApp PROD 2026-07-02): responder DIRETO um gate de COLETA
	// (valor/lance) dispara o gate mesmo em intent `neutral`. O bug: "Quanto custa o
	// carro?" → usuário responde "200" → o analyzer cai em NEUTRAL_FALLBACK (timeout
	// cold-start) → o heurístico "neutral → conversacional" (abaixo) SUPRIME o gate e
	// a LLM fica muda → EMPTY_TURN_FALLBACK ("me perdi"). Mesma CLASSE do FIX-206, mas
	// no gate de valor em turno de USUÁRIO. Durante a coleta ativa o "neutral →
	// conversacional" NÃO vale — ele é pra PÓS-reveal. Perguntas/dúvidas/off-topic/
	// wants_more_options seguem deixando o agente conversar (o usuário desviou; o
	// watchdog FIX-207 re-engaja se ele sumir). Invariante em CÓDIGO (Lei 4), não
	// regra-no-prompt. Server-authored já retornou true acima (FIX-206) — não colide.
	if (COLLECTION_GATES.has(gate)) {
		if (intent === "asking_question" || intent === "expressing_doubt" || intent === "off_topic") {
			return false;
		}
		return true;
	}

	// "search" dispara busca + cards — a acao mais invasiva do sistema.
	// Exige sinal EXPLICITO do usuario. Nunca dispara em asking/doubt/off-topic.
	if (gate === "search") {
		// FIX-76: numa retomada com valor-alvo TROCADO (revealValueTargetChanged),
		// o próprio sinal de troca de faixa já justifica re-buscar — o analyzer
		// costuma marcar a mensagem da retomada como conversacional (neutral),
		// e cair em conversacional deixava o modelo alucinar "instabilidade".
		if (revealValueTargetChanged(meta)) return true;
		// FIX-215 (Ata 2026-07-04): lance saiu do meio — `credit` agora cai DIRETO
		// em `search` (antes caía em `lance`, um COLLECTION_GATE tolerante a
		// `neutral`). Sem este atalho, a MESMA classe de bug do FIX-208 reaparece:
		// o usuário acaba de responder o valor, o analyzer cai em NEUTRAL_FALLBACK
		// (timeout cold-start) e a busca — que já tem tudo que precisa
		// (nextGate só chega em "search" com credit+identity prontos) — ficaria
		// suspensa esperando um sinal explícito que não vem. `!searchDispatched`
		// escopa isto à PRIMEIRA busca (o gatilho de fim-de-qualificação); depois
		// dela, só `revealValueTargetChanged` (acima) reabre — nunca `neutral` solto.
		if (!meta.searchDispatched && intent === "neutral") return true;
		return intent === "ready_to_proceed" || intent === "providing_info";
	}

	if (intent === "asking_question") return false;
	if (intent === "expressing_doubt") return false;
	if (intent === "off_topic") return false;

	if (intent === "ready_to_proceed") return true;
	if (intent === "providing_info") return true;

	// Neutral: only fire if this is effectively the first contact
	// (no qualify data yet) — invites the user into the funnel.
	// Otherwise stay quiet and let the conversation breathe.
	const hasNoQualifyData =
		!meta.experiencePrev &&
		!meta.qualifyAnswers?.creditMax &&
		!meta.qualifyAnswers?.prazoMeses &&
		!meta.qualifyAnswers?.hasLance;
	return hasNoQualifyData;
}

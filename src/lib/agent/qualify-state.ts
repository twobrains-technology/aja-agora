import { revealValueTargetChanged } from "./orchestrator/tool-policy";
import type { ConversationMetadata, QualifyAnswers } from "./personas";
import { objetivoForPrazo } from "./qualify-config";

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
	| "reco-consent"
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

/**
 * FIX-305 (rodada 10, onda 3) — gates que podem ficar presos PARA SEMPRE em
 * `nextGate()` quando o dado nunca é extraído do texto livre (modelo fraco,
 * resposta vaga) e por isso ganham um ESCAPE por default após N tentativas
 * sem progresso (`registerGateStuckTurn`). `COLLECTION_GATES` (acima) NÃO
 * protege contra isso: aquele set só afeta `decideShowGate` (se o CARD volta
 * a aparecer no turno), nunca `nextGate()` — a cascata que decide se o funil
 * avança. Um `COLLECTION_GATE` cujo dado nunca é extraído tem o card
 * re-exibido a cada turno, mas `nextGate()` continua devolvendo o MESMO gate
 * pra sempre — mesma classe de bug do `timeframe`, só sem o sintoma visível
 * de "IA muda" ([gate-skip]). Por isso a lista abaixo inclui os 3 gates de
 * `COLLECTION_GATES` que vivem pós-reveal (`lance`/`lance-value`/
 * `lance-embutido`) além do `timeframe` — decisão registrada em
 * docs/decisoes/blocos/2026-07-13-bloco-r10-3-timeframe-stuck.md (D3).
 * `credit`/`identify` ficam de fora: são pré-requisito de TUDO (busca/reveal)
 * e já têm defesa própria (FIX-115 backstop determinístico + FIX-208 guard de
 * turno-mudo) — assumir um valor de crédito no escuro seria fabricar dado
 * financeiro, não um fallback de conveniência.
 */
export const STUCK_ESCAPE_GATES: ReadonlySet<Gate> = new Set<Gate>([
	"timeframe",
	"lance",
	"lance-value",
	"lance-embutido",
]);

/** FIX-305 — teto de tentativas sem progresso antes de assumir o default (Kairo,
 * AskUserQuestion 2026-07-13: "~2-3 tentativas"; 3 é o valor já usado como
 * exemplo na correção proposta do card fix-305 — dá a última chance possível
 * dentro da faixa antes de assumir). */
export const GATE_STUCK_ESCAPE_THRESHOLD = 3;

/** FIX-305 — default de prazo (meses) quando `timeframe` nunca resolve. "12"
 * é uma opção CANÔNICA já existente do produto (`TIMEFRAME_OPTIONS` em
 * qualify-config.ts, token "12" = "1 ano, curto prazo") — não é um número
 * novo. Mantém `objetivo` em "contemplacao_rapida" (objetivoForPrazo só vira
 * "investimento" a partir de 120 meses), o eixo mais comum e o mais seguro
 * pra assumir sem nenhum sinal do usuário. */
const DEFAULT_STUCK_PRAZO_MESES = 12;

/** FIX-305 — percentual de lance default quando `lance-value` nunca resolve
 * (hasLance="yes" real, mas o valor em R$ nunca é extraído). Mesmo percentual
 * do cenário "provável" já cravado em `scenarios.ts` (20% do crédito) — não é
 * um número novo, é o ponto médio de mercado já usado no produto. */
const DEFAULT_STUCK_LANCE_VALUE_PERCENT = 0.2;
/** Fallback defensivo quando `creditMax` (inesperadamente) ainda não existe —
 * não deveria ocorrer na prática: `credit` resolve bem antes de `lance-value`
 * ser alcançável (nextGate() exige creditMax definido pra sair de "credit"). */
const DEFAULT_STUCK_LANCE_VALUE_FALLBACK = 20_000;

function stuckGateDefaultPatch(gate: Gate, meta: ConversationMetadata): Partial<QualifyAnswers> {
	switch (gate) {
		case "timeframe":
			return {
				prazoMeses: DEFAULT_STUCK_PRAZO_MESES,
				objetivo: objetivoForPrazo(DEFAULT_STUCK_PRAZO_MESES),
			};
		case "lance":
			// "no" é uma resposta válida já suportada (não é um estado "hedge"
			// novo) — pula lance-value, segue pra lance-embutido. Não assume
			// "so_parcela" (pularia até o simulator-offer inteiro): mudança de
			// jornada grande demais pra assumir sem nenhum sinal do usuário.
			return { hasLance: "no" };
		case "lance-value": {
			const creditMax = meta.qualifyAnswers?.creditMax;
			const value = creditMax
				? Math.round(creditMax * DEFAULT_STUCK_LANCE_VALUE_PERCENT)
				: DEFAULT_STUCK_LANCE_VALUE_FALLBACK;
			return { lanceValue: value };
		}
		case "lance-embutido":
			// Consent-minimization: lance embutido é opt-in explícito (mexe na
			// simulação) — sem sinal claro, o default seguro é NÃO ativar.
			return { lanceEmbutido: false };
		default:
			return {};
	}
}

/**
 * FIX-305 — chamado pelo orquestrador (`orchestrator/analyze.ts`) ao fim de
 * cada turno de USUÁRIO em que o gate ativo NÃO mudou (mesmo gate antes e
 * depois do merge do analyzer) — turno "sem progresso". Só age nos
 * `STUCK_ESCAPE_GATES`; para os demais devolve `null` (nada a fazer). Pura:
 * não muta `meta`, devolve o PATCH a aplicar (sem I/O, sem Date.now()).
 *
 * Abaixo do teto: só incrementa o contador. No teto (`GATE_STUCK_ESCAPE_THRESHOLD`):
 * assume o default do gate (`stuckGateDefaultPatch`), marca `gateDefaultsAssumed`
 * e reseta o contador — o gate avança e ele nunca mais é lido.
 */
export function registerGateStuckTurn(
	meta: ConversationMetadata,
	gate: Gate,
): Partial<ConversationMetadata> | null {
	if (!STUCK_ESCAPE_GATES.has(gate)) return null;
	const turns = (meta.gateStuckTurns?.[gate] ?? 0) + 1;
	if (turns < GATE_STUCK_ESCAPE_THRESHOLD) {
		return { gateStuckTurns: { ...meta.gateStuckTurns, [gate]: turns } };
	}
	return {
		qualifyAnswers: { ...(meta.qualifyAnswers ?? {}), ...stuckGateDefaultPatch(gate, meta) },
		gateStuckTurns: { ...meta.gateStuckTurns, [gate]: 0 },
		gateDefaultsAssumed: { ...meta.gateDefaultsAssumed, [gate]: true },
	};
}

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
	// FIX-301 correção (rodada 10): "confused" é DISTINTO de "expressing_doubt".
	// expressing_doubt = hesitação sobre uma DECISÃO que o usuário entende
	// ("tenho que pensar", "depende") — não deve interromper o fluxo natural.
	// confused = o usuário não entendeu a PERGUNTA/CARD em si ("não entendi",
	// "como assim?") — aí sim reancora no mesmo gate (Lei 4, sem inventar menu).
	// Reusar expressing_doubt pra isso (tentativa original do FIX-301) quebrou
	// o FIX-266 (r9): "deixa eu pensar aqui" é expressing_doubt por design
	// (turn-analyzer.ts) e passou a ser hijackado pelo short-circuit de clarify.
	| "confused"
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

	// FIX-296 (rodada 10, loop-de-goal consórcio, 2026-07-12) — REVERSÃO
	// CONSCIENTE do FIX-53: o mockup novo (docs/design/specs/assets/2026-07-12-
	// aja-dois-cenarios.html, F1) pede rapport ANTES de dados — motivo→espelho+
	// objetivo→valor do bem→SÓ ENTÃO CPF/WhatsApp ("pra eu trazer as ofertas
	// reais das administradoras"). O invariante REAL nunca foi "identidade logo
	// após o desire": é "identidade SEMPRE antes do search" (a Bevi exige
	// CPF+celular+LGPD antes de simular, D1) — isso continua intacto abaixo, só
	// a posição relativa ao `credit` muda. "Palavra nova vence" — a razão do
	// FIX-53 era "dados antes do valor"; a intenção nova é confiança antes de
	// dados, sem abrir mão do pré-requisito de identidade pro search.
	const q = meta.qualifyAnswers ?? {};
	if (q.creditMax === undefined) return "credit";
	if (!meta.identityCollected) return "identify";

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

		// FIX-297 (rodada 10, 2026-07-12) — reveal em DOIS TEMPOS com
		// consentimento: a lista (comparison_table) já apareceu no search
		// (FIX-290 preservado), `experience` acabou de resolver — antes de
		// avançar, pergunta "Posso te mostrar a opção que eu recomendo?" e só
		// com resposta afirmativa o hero (recommendation_card) é liberado
		// (server-forced em orchestrator/index.ts, nunca dependente de tool-call
		// do LLM). PULA quando o usuário já recusou a conversa de lance
		// (hasLance="so_parcela", capturado oportunisticamente a qualquer
		// momento) — não há o que recomendar pra quem só quer a parcela fixa.
		//
		// FIX-308 (rodada 10, onda 4 — causa-raiz real da Madalena): acoplado a
		// `recoConsentAnswered` (resposta REAL), não mais a `recoConsentDispatched`
		// (a PERGUNTA ter sido feita). Antes, a cascata avançava pra
		// timeframe/lance/decisão assim que a pergunta saía, mesmo sem resposta
		// reconhecida — o fecho (contract_form/whatsapp_optin) chegava a disparar
		// ANTES do hero aparecer, porque nada mais barrava o avanço. Enquanto a
		// resposta não é reconhecida como consentimento (detectYesNoText/intent
		// em index.ts), a cascata FICA parada aqui — mesmo padrão dos gates de
		// coleta (credit/lance/lance-embutido, que também travam até o dado
		// chegar). decideShowGate() evita re-perguntar em pergunta/dúvida/
		// off-topic (o agente conversa à vontade enquanto o gate segura).
		if (q.hasLance !== "so_parcela" && !meta.recoConsentAnswered) return "reco-consent";

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
	// Contrato fechado é SEMPRE terminal — nada a reancorar, independente de
	// qual gate a cascata bruta de nextGate() calcularia (ex.: FIX-297 inseriu
	// "reco-consent" mais cedo no funil; sem este corte, um fixture pós-fecho
	// que não marcou aquele gate como resolvido vazava um gate "vivo" aqui).
	if (meta.contractClosed === true) return null;
	if (meta.revealCompleted && meta.decisionDispatched === true) {
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
 * FIX-296 — depois que o motivo chega (`motivationAsked` já rodou e o texto do
 * usuário trouxe `motivation`), o funil segura MAIS UM turno pra um beat de
 * ESPELHO + OBJETIVO ("entendo bem — quando o carro dá trabalho, atrapalha
 * tudo. Então o objetivo já fica claro: te colocar num Corolla novo…") — sem
 * NENHUM card estruturado junto (mesmo anti-CK-1 do `shouldAskMotive`: o
 * espelho não pode competir com um gate no mesmo balão). NÃO-bloqueante:
 * `motivationMirrored` é marcado no runner quando o beat ativa (mesmo padrão
 * de `motivationAsked`) — o gate seguinte (`credit`, pós FIX-296) dispara
 * normalmente no turno DEPOIS deste. Sem `motivation` capturado (usuário
 * ignorou a pergunta e mudou de assunto), não há o que espelhar — a função
 * devolve false e o funil segue direto pro próximo gate estrutural, sem
 * inserir um beat vazio. Função PURA (Camada 1).
 */
export function shouldMirrorMotivation(meta: ConversationMetadata): boolean {
	const q = meta.qualifyAnswers ?? {};
	return Boolean(meta.motivationAsked) && q.motivation !== undefined && !meta.motivationMirrored;
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
	// FIX-296 — depois que o motivo chega, o funil segura MAIS UM turno pro beat de
	// espelho+objetivo (shouldMirrorMotivation) — NENHUM gate estruturado compete com
	// ele (mesma resposta costuma ser uma QUEIXA — "cansei do carro velho, vive na
	// oficina" — que o analyzer classifica como expressing_doubt/off_topic; isso NÃO
	// é um desvio, é a resposta esperada, mas aqui ela ganha só o espelho, sem card —
	// reversão consciente do antigo FIX-275, que forçava o card de identidade no MESMO
	// turno). O gate real (credit, pós FIX-296) dispara no turno SEGUINTE, quando
	// shouldMirrorMotivation já for false.
	if (isUserTurn && shouldMirrorMotivation(meta)) return false;
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

	// "reco-consent" — FIX-297: "Posso te mostrar a opção que eu recomendo?"
	// Mesmo critério de decision/simulator-offer: afirmativo avança (libera o
	// hero), pergunta/dúvida deixa o agente conversar (o hero fica pendente,
	// nunca é forçado sem consentimento).
	if (gate === "reco-consent") {
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
		if (
			intent === "asking_question" ||
			intent === "expressing_doubt" ||
			intent === "confused" ||
			intent === "off_topic"
		) {
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
	if (intent === "confused") return false;
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

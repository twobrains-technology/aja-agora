import { InvalidToolInputError, type ToolChoice } from "ai";
import { db } from "@/db";
import { artifacts as artifactsTable } from "@/db/schema";
import { resolveAgent } from "@/lib/agent/agents";
import { selectExamplesForTurn } from "@/lib/agent/example-selector";
import { allowedTools, phaseFromMeta } from "@/lib/agent/orchestrator/tool-policy";
import type { ConversationMetadata, Persona } from "@/lib/agent/personas";
import { getPersona } from "@/lib/agent/personas-repo";
import {
	decideShowGate,
	type Gate,
	nextGate,
	shouldAskMotive,
	shouldMarkDoubtsAddressed,
	shouldMirrorMotivation,
	type UserIntent,
} from "@/lib/agent/qualify-state";
import { renderPersonaExamplesBlock } from "@/lib/agent/system-prompt";
import { isDiscoveryFailedResult, PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import {
	extractKnownCreditValue,
	type KnownGroupValue,
	loadKnownGroupCreditValues,
} from "@/lib/agent/tools/known-credit-values";
import type { ArtifactType } from "@/lib/chat/types";
import { loadAdministradoraLogoMap } from "@/lib/consorcio/administradora-logo-repo";
import { loadIdentity } from "@/lib/conversation/identity";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import type { MemoryContext } from "@/lib/memory/types";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import { evaluateArtifactGuards } from "./artifact-guard";
import {
	isCreditValueMentioned,
	resolveOfferForAdministradora,
	resolveOfferMentionForConversation,
} from "./choose-offer";
import { enrichContractFormPayload } from "./contract-form-prefill";
import {
	coerceDialPayload,
	offerSnapshotFromArtifact,
	type RecommendedOfferSnapshot,
} from "./dial-payload";
import { extractDiscoveryCount } from "./discovery-count";
import { coerceEmbeddedBidPayload } from "./embedded-bid-payload";
import { detectLeadFormArtifact, initializeLeadCollection } from "./lead-collection";
import {
	buildComparisonTableFromRevealGroups,
	coerceComparisonPayload,
	coerceRecommendationPayload,
	indexRevealGroups,
	type RevealGroupIndex,
	usableRevealGroupCount,
} from "./recommendation-payload";
import {
	EphemeralTextFilter,
	joinSeparator,
	normalizeGluedSentences,
	stripProcessPreamble,
} from "./sanitizer";
import { coerceScarcityPayload } from "./scarcity-payload";
import { coerceSimulationPayload } from "./simulation-payload";
import {
	logToolError,
	logToolInputError,
	logToolIO,
	type ToolCallRecord,
	type ToolResultRecord,
} from "./tool-io-log";
import { resolveTopicPickerPayload } from "./topic-catalog";
import { coerceTwoPathsPayload } from "./two-paths-payload";
import type { Channel, ChatMessage, ProducedArtifact, TurnEvent } from "./types";

export type RunAgentResult = {
	fullResponse: string;
	artifacts: ProducedArtifact[];
	handoffSignaled: boolean;
	isConcierge: boolean;
	nextGateToFire: Gate | null;
	prefixForNextGate: string | null;
	/** O MODELO já fez a pergunta deste gate, com as palavras dele. O adapter
	 * emite só o input (chips/slider/form) e não repete a pergunta canônica.
	 * Substitui o antigo `discardHeldQuestion` (FIX-326), que calava o modelo
	 * pra deixar o card falar — origem do tom robótico e repetitivo. */
	modelAskedGateQuestion?: boolean;
	/** FIX-186: a descoberta na Bevi falhou neste turno (após retry). O
	 * orchestrator materializa a mensagem amigável FIXA em vez de deixar o modelo
	 * narrar erro cru; e o gate de proposta (FIX-187) fica bloqueado. */
	discoveryFailedThisTurn?: boolean;
	/** FIX-262: o modelo chamou uma tool FORA do toolset da fase neste turno (AI
	 * SDK emitiu `tool-error`) — o runner assumiu o turno ANTES que a narração
	 * crua do modelo (tipicamente negação de uma oferta real) chegasse ao
	 * usuário. O orchestrator materializa o fallback determinístico. */
	toolErrorThisTurn?: boolean;
	/** FIX-262: o turno excedeu `TOOL_CALL_HARD_CAP` tool-calls — o runner
	 * abortou a geração e assumiu o turno (mesmo fallback do toolErrorThisTurn,
	 * finish reason distinto pra observabilidade). */
	toolCallCapExceededThisTurn?: boolean;
	/** FIX-286: grupos reais indexados de `search_groups`/`recommend_groups`
	 * NESTE turno, expostos mesmo quando o guard de tool-error/cap assume o
	 * turno — o orchestrator (index.ts) usa isto pra distinguir "o reveal já
	 * tinha dados reais em mãos quando a apresentação falhou" (materializa o
	 * card, Via A) de "nada foi buscado ainda" (fallback honesto, Via B). */
	revealGroupsById?: RevealGroupIndex;
};

const LEAD_STAGE_BY_TOOL: Record<string, "engajado" | "qualificado"> = {
	simulate_quota: "engajado",
	recommend_groups: "qualificado",
};

// FIX-262 (P1, veredito Fable r5 §N2): cap DURO de tool-calls por turno. O
// `stopWhen: stepCountIs(10)` (builder.ts) limita STEPS do modelo, não
// tool-calls — um step pode carregar várias chamadas paralelas/sentinelas, e
// foi assim que um turno real chegou a 34 tool-calls / 593s (4 fallbacks
// repetidos, ~20 buscas mudas). O fluxo legítimo mais longo (reveal completo:
// search_groups + recommend_groups + simulate_quota + 3 present_*) usa ~6
// chamadas — o cap dá folga generosa sem permitir o loop de auto-DoS.
export const TOOL_CALL_HARD_CAP = 12;

// FIX-270: tools que constituem "busca/consulta real ao catálogo" — só a
// presença de UMA delas neste turno lastreia uma claim de re-busca ("não
// apareceu grupo novo"). `get_group_details` fica de fora de propósito: busca
// detalhe de UM grupo já conhecido, não uma varredura nova do catálogo.
const CATALOG_SEARCH_TOOL_NAMES = new Set(["search_groups", "recommend_groups"]);

/** Extrai uma mensagem legível do `error` opaco do chunk `tool-error`
 * (tipicamente um `NoSuchToolError`, mas tratado defensivamente). */
function stringifyToolError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return "Tool chamada fora do toolset da fase (chunk tool-error do AI SDK).";
	}
}

/** Cards que constituem o reveal do passo 3+4 (âncora de revealCompleted). */
const REVEAL_ARTIFACTS = new Set([
	"comparison_table",
	"group_card",
	"recommendation_card",
	"simulation_result",
]);

/** BUG-SIMULATOR-OFFER-ENGOLIDO (2026-06-04): o guard anti-atropelo
 * (`!producedArtifact`) bloqueava o gate simulator-offer pra SEMPRE — o turno
 * do reveal produz cards e os turnos seguintes também (optin/decision), então
 * a oferta do simulador (docx passo 4: "na sequência" do reveal) nunca saía.
 * Exceção cirúrgica: o simulator-offer É elegível no MESMO turno que
 * apresentou os cards do reveal.
 *
 * FIX-320 (rodada 10, veredito Sonnet A.4): `nextGate()` calcula "experience"
 * como o PRIMEIRO gate pós-reveal (qualify-state.ts) — no MESMO turno em que
 * `revealCompleted` vira true. Sem esta mesma exceção, qualquer turno que
 * reapresentasse um REVEAL_ARTIFACT (ex.: "Quero ver todas" reabrindo
 * comparison_table) engolia a chance de "experience" disparar — e como toda a
 * cascata pós-reveal fica bloqueada atrás dele, o gate nunca encontrava um
 * turno "limpo" pra sair (achado ao vivo: nunca perguntado em nenhum dos 2
 * dossiês). Os demais gates seguem bloqueados. */
export function allowGateWithArtifacts(gate: Gate, artifactTypes: string[]): boolean {
	return (
		(gate === "simulator-offer" || gate === "experience") &&
		artifactTypes.some((t) => REVEAL_ARTIFACTS.has(t))
	);
}

function artifactTypeFor(toolName: string): ArtifactType {
	const short = toolName.replace("present_", "");
	return short as ArtifactType;
}

/** Âncora de oferta do turno — MESMA busca usada pelo `contemplation_dial`
 * (FIX-6/C2) e reaproveitada pelo `embedded_bid` (FIX-228): os dois cards
 * precisam da oferta REAL recém-confirmada, nunca do que a LLM digitou. */
function resolveOfferSnapshot(
	artifacts: ProducedArtifact[],
	meta: ConversationMetadata,
): RecommendedOfferSnapshot | null {
	const turnAnchor =
		artifacts.find((a) => a.type === "simulation_result") ??
		artifacts.find((a) => a.type === "recommendation_card") ??
		artifacts.find((a) => a.type === "group_card");
	return offerSnapshotFromArtifact(turnAnchor?.payload) ?? meta.recommendedOffer ?? null;
}

/** FIX-102: eco/degeneração NÃO-determinística da LLM (raro — 1 ocorrência em
 * todo o DB de homologação, ex.: "Boa, então a gente vai direto ao
 * ponto.Boa, então a gente vai direto ao ponto."). Causa cravada como
 * geração da LLM, não bug de append (ver card). Guarda defensiva
 * DETERMINÍSTICA: colapsa segmentos/parágrafos 100% idênticos consecutivos
 * antes de persistir/renderizar. Trata o sintoma, não a causa — não pega eco
 * de quick-reply (texto diferente, ex.: "Bora!Beleza"), fora de escopo desta
 * guarda por decisão de produto.
 * Card: docs/correcoes/done/fix-102-assistant-texto-duplicado-eco.md */
export function collapseEchoedSegments(text: string): string {
	if (!text) return text;
	const segments = text.split(/(?<=[.!?])/);
	if (segments.length < 2) return text;
	const out: string[] = [];
	for (const segment of segments) {
		const previous = out[out.length - 1];
		if (previous !== undefined && segment.trim().length > 0 && previous.trim() === segment.trim()) {
			continue;
		}
		out.push(segment);
	}
	return out.join("");
}

/**
 * FIX-182 (Mirella, 2026-07-01) — irmão do FIX-102. Em turnos multi-tool-call,
 * cada step gera sua própria narração de transição num BLOCO de texto separado
 * (id distinto no fullStream). O `fullResponse += part.text` colava esses blocos
 * numa sopa ilegível ("...na sua faixa:Deixa eu buscar...:Preciso...:Mirella,
 * tive um problema...") — 4 frases sem separador, num único registro no DB.
 *
 * Esta função decide, POR DELTA, se um separador `\n\n` entra ANTES do delta:
 * só quando começa um bloco NOVO (id diferente do anterior) e já há texto que
 * não termina em espaço/quebra. Deltas do MESMO bloco (streaming) nunca ganham
 * separador — a decisão é 100% pelo id do bloco, ZERO heurística de conteúdo
 * (sem falso-positivo em texto legítimo). A CURA determinística (governar a
 * fase, FIX-180) reduz a superfície na origem; este `\n\n` é a rede enquanto a
 * governança não cobre tudo. Card: docs/correcoes/done/fix-182-*.md.
 */
export function textBlockSeparator(
	prevBlockId: string | undefined,
	newBlockId: string | undefined,
	accumulated: string,
): string {
	if (newBlockId === undefined || prevBlockId === undefined) return "";
	if (newBlockId === prevBlockId) return "";
	if (accumulated.length === 0) return "";
	if (/\s$/.test(accumulated)) return "";
	return "\n\n";
}

export async function* runAgentTurn(args: {
	conversationId: string;
	channel: Channel;
	currentPersona: Persona;
	meta: ConversationMetadata;
	messages: ChatMessage[];
	isUserTurn: boolean;
	userIntent?: UserIntent;
	memoryContext?: MemoryContext | null;
	/**
	 * Quando passado, força o modelo a chamar essa tool neste turn (via
	 * AI SDK 6 `toolChoice`). Calculado pelo orchestrator em `index.ts`
	 * via `isLikelyNameResponse()` — fix BUG-SHORT-GREETING-AFTER-NAME
	 * Nível 1. Bypassa o cache de agents.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: ToolChoice<T> é genérico sobre o ToolSet do agent — repassamos como-está pro resolveAgent.
	forceToolChoice?: ToolChoice<any>;
	/**
	 * FIX-77: blocos de system dinâmicos por turno (knownName/experience/doubts)
	 * montados pelo orchestrator (buildSystemContext). ANTES iam prependados em
	 * `messages`; agora vão pro builder junto do examplesBlock (instructions, sem
	 * cacheControl) — sem warning de prompt-injection e sem duplicar a memória.
	 */
	systemContextBlocks?: string[];
}): AsyncGenerator<TurnEvent, RunAgentResult> {
	const {
		conversationId,
		channel,
		currentPersona,
		meta,
		messages,
		isUserTurn,
		userIntent = "neutral",
		memoryContext = null,
		forceToolChoice,
		systemContextBlocks = [],
	} = args;

	let fullResponse = "";
	const artifacts: ProducedArtifact[] = [];
	// FIX-7: tamanho da descoberta DESTE turno (tool-results de search/recommend).
	// Com opção única, o recommendation_card é suprimido — o detalhamento
	// (simulation_result) é o card único, sem duplicar o mesmo grupo na tela.
	let discoveryCount: number | null = null;
	// FIX-C3: retorno REAL do simulate_quota deste turno — fonte única dos
	// números do simulation_result (o modelo digitava o payload na mão e
	// alucinou receivedCredit = carta cheia na jornada BB de 2026-06-11).
	let lastQuotaSimulation: unknown = null;
	// FIX-186: a descoberta na Bevi falhou neste turno (marcador vindo do
	// runDiscovery no tool-result). Ao detectar: suprime a narração do modelo
	// (não vaza erro cru) e sinaliza pro orchestrator materializar o fallback +
	// pro artifact-guard (FIX-187) dropar qualquer proposta.
	let discoveryFailedThisTurn = false;
	// FIX-12 (recovery, regressão pós-FIX-285): o guard `premature-contract`
	// (artifact-guard.ts) suprime um contract_form pré-reveal — o modelo tentou
	// pular direto pro fechamento. O turno tem que reconduzir ao gate `identify`
	// MESMO quando `shouldAskMotive` está segurando o funil (FIX-274/285): a
	// prioridade aqui é reafirmar identidade, não perguntar "por que agora" — o
	// usuário nem chegou a ver o reveal. Sem esta força, o turno ficava
	// inteiramente mudo (nem artifact, nem gate).
	let prematureContractSuppressedThisTurn = false;
	// FIX-297: hero (recommendation_card) e a simulação que o aprofunda ficam
	// PENDENTES no reveal original (guard hero-awaits-reco-consent) — os
	// payloads já COAGIDOS server-side (mesma coerção do caminho permitido)
	// são guardados aqui pra persistir em meta.pendingRecommendationCard/
	// pendingSimulationResult (emissão determinística mais tarde, pós-consent).
	let pendingRecommendationPayload: Record<string, unknown> | null = null;
	let pendingSimulationPayload: Record<string, unknown> | null = null;
	// FIX-262: chunk `tool-error` observado neste turno (tool fora do toolset da
	// fase) — a partir daqui, nenhum texto do modelo chega ao usuário (evita a
	// negação de oferta real) e o orchestrator assume com fallback determinístico.
	let toolErrorThisTurn = false;
	// FIX-262: total de tool-calls PROCESSADAS neste turno (não só steps do
	// modelo — um step pode carregar várias chamadas). Acima do cap duro, o
	// runner aborta a geração e para de relayar qualquer coisa pro usuário.
	let toolCallCountThisTurn = 0;
	let toolCallCapExceededThisTurn = false;
	// FIX-191: grupos REAIS do recommend_groups/search_groups deste turno,
	// indexados por id — fonte única dos números do recommendation_card (hero) e
	// de cada cota do comparison_table (seletor). Mata o "36/mês" fabricado
	// (spec §2): o hero deixa de ser o único artifact do reveal sem coerção.
	const revealGroupsById: RevealGroupIndex = new Map();
	// FIX-287/FIX-292: cenário REAL já simulado por groupId — turno corrente
	// (todo simulate_quota que resolver neste turno, atualizado ao vivo abaixo)
	// + histórico da conversa (memoizado, carregado sob demanda — só quando o
	// turno realmente emite comparison_table/recommendation_card). search/
	// recommend só trazem o valor-ALVO que a Bevi aproxima na busca; este mapa
	// é a fonte única MULTI-CAMPO (creditValue + monthlyPayment + termMonths)
	// que corrige comparison_table/recommendation_card contra um
	// simulation_result já conhecido do MESMO grupo (ver recommendation-payload.ts).
	const turnKnownCreditValues = new Map<string, KnownGroupValue>();
	let knownCreditValuesPromise: Promise<Map<string, KnownGroupValue>> | null = null;
	const getKnownCreditValues = async (): Promise<ReadonlyMap<string, KnownGroupValue>> => {
		if (!knownCreditValuesPromise) {
			knownCreditValuesPromise = loadKnownGroupCreditValues(conversationId).catch((err) => {
				console.error(
					"[known-credit-values] falha ao carregar histórico de simulações, usando fallback",
					err,
				);
				return new Map<string, KnownGroupValue>();
			});
		}
		const historical = await knownCreditValuesPromise;
		// Turno corrente prevalece sobre histórico (dado mais fresco).
		return new Map([...historical, ...turnKnownCreditValues]);
	};
	// FIX-222: logo da administradora (cadastro `administradoras.logo_url`) —
	// carregado sob demanda (só quando o turno realmente emite recommendation_card
	// /comparison_table) e memoizado no turno. Falha de DB nunca derruba o turno:
	// cai no fallback gracioso do card (Map vazio).
	let administradoraLogosPromise: Promise<Map<string, string>> | null = null;
	const getAdministradoraLogos = (): Promise<Map<string, string>> => {
		if (!administradoraLogosPromise) {
			administradoraLogosPromise = loadAdministradoraLogoMap().catch((err) => {
				console.error("[administradora-logo] falha ao carregar logos, usando fallback", err);
				return new Map<string, string>();
			});
		}
		return administradoraLogosPromise;
	};
	const executedToolNames: string[] = [];
	let handoffSignal: { triggerId?: string; reason: string } | null = null;
	const stagesEmitted = new Set<string>();
	// FIX-270: fonte REAL de "documento recebido" — `meta.documentSlotsSent` só é
	// preenchido pelo handler de mídia inbound do WhatsApp após upload de fato
	// (document-inbound.ts); a web hoje não escreve nesse campo, então lá a claim
	// é sempre falsa até existir um evento real equivalente. Nunca a narrativa
	// do LLM (Lei 1).
	const hasReceivedDocuments = (meta.documentSlotsSent?.length ?? 0) > 0;

	const isConcierge = !meta.currentCategory;
	// FIX-19: policy de tools da fase atual — espelho do filtro aplicado no
	// builder (resolveAgent repassa o meta). Usada SÓ pro tripwire
	// [tool-policy-violation]; a 1ª linha de defesa é o toolset filtrado.
	const toolPolicyAllowed = new Set(allowedTools(meta, channel));

	// Examples filtrados por contexto do turno. Vão num system block separado
	// pra preservar o cache da Anthropic no system prompt estático (ver
	// example-selector.ts pra ranking e renderPersonaExamplesBlock pra formato).
	const row = await getPersona(currentPersona);
	const selected = selectExamplesForTurn(row.examples, {
		expertise: meta.expertiseLevel,
		category: meta.currentCategory,
		channel,
		intent: userIntent,
	});
	const examplesBlock = renderPersonaExamplesBlock(selected);

	// FIX-77: systemContext (knownName/experience/doubts) + examplesBlock vão pro
	// builder via `instructions` (campo `system` da SDK), NÃO prependados em
	// `messages` — system dentro de `messages` dispara o warning de prompt-injection
	// da AI SDK 6 a cada turno e duplicava a memória Letta. Ordem: systemContext
	// antes do examplesBlock (examples mais perto da fala do usuário, recency bias).
	const extraSystemBlocks = [...systemContextBlocks, examplesBlock].filter((b): b is string =>
		Boolean(b),
	);

	// BUG-CONVERSATION-ID-HALLUCINATION: conversationId/channel são passados ao
	// resolveAgent → buildAgent → buildConsorcioTools({ conversationId }) injeta
	// via closure nas tools sensíveis (save_contact_name etc.). Sem isso, modelo
	// alucinava "conv_001" e UPDATE no Postgres falhava silenciosamente.
	const agent = await resolveAgent(currentPersona, meta, {
		memoryContext,
		conversationId,
		channel,
		toolChoice: forceToolChoice,
		extraSystemBlocks,
	});

	// FIX-181: observabilidade de tool I/O (Lei 5) — o primitivo NATIVO do AI SDK 6
	// `onStepFinish` entrega toolCalls (args) + toolResults (output) por step. Sem
	// isto, "a IA inventou ou pegou de dado real?" fica indeterminável (o buraco que
	// tornou o 'Embracon' impossível de provar na conv 69a38af1). PII mascarada em
	// tool-io-log.ts; log server-side (console.log estruturado), nunca vaza pro cliente.
	let toolIoStep = 0;
	// FIX-262: sinal de aborto pro cap duro de tool-calls / tool-error fora de
	// fase — melhor esforço pra cortar a geração em background (custo/latência
	// do loop de 593s), além do runner parar de RELAYAR/processar qualquer
	// coisa pro usuário assim que o guard dispara (via `break` no consumo).
	const turnAbortController = new AbortController();
	const result = await agent.stream({
		messages,
		abortSignal: turnAbortController.signal,
		onStepFinish: (step: { toolCalls?: ToolCallRecord[]; toolResults?: ToolResultRecord[] }) => {
			logToolIO({
				conversationId,
				stepNumber: toolIoStep++,
				toolCalls: step.toolCalls ?? [],
				toolResults: step.toolResults ?? [],
			});
		},
	});

	// FIX-182: id do bloco de texto corrente. Blocos diferentes (steps diferentes
	// de um turno multi-tool) ganham `\n\n` entre si; deltas do mesmo bloco colam.
	let lastTextBlockId: string | undefined;
	// FIX-188: filtro de stream por frase — preâmbulo de processo ("deixa eu
	// buscar", "vou buscar", "um segundo", "deixa eu usar a ferramenta") é EFÊMERO
	// e NUNCA vira bolha (nem enviado ao vivo, nem persistido). Barreira em código
	// (Lei 1/4), a regra soft no prompt é só reforço. Pós-onda-1: erro já é
	// diretiva, então o filtro só cuida de preâmbulo de SUCESSO.
	// FIX-270: o getter é chamado a cada push/flush — `hasSearchToolCall` reflete
	// as tool-calls JÁ processadas até o ponto corrente do stream (causal: uma
	// claim "já busquei" só é verdadeira se a tool já rodou antes dela).
	// DESAMARRA (2026-07-13): o modelo fez a pergunta do gate com as palavras dele
	// neste turno → o card não repete a canônica (só mostra o input).
	let modelAskedGateQuestion = false;
	const ephemeralFilter = new EphemeralTextFilter(() => ({
		hasReceivedDocuments,
		hasSearchToolCall: executedToolNames.some((t) => CATALOG_SEARCH_TOOL_NAMES.has(t)),
	}));
	// Compõe o texto LIMPO em fullResponse (com separador anti-colagem, FIX-189) e
	// devolve o que deve ir pro stream. Fecha o buraco de "duas falas coladas".
	const composeClean = (raw: string, blockSep = ""): string => {
		// FIX-189: desgruda falas que o modelo colou no MESMO chunk ("corretos.Show").
		const clean = normalizeGluedSentences(raw);
		if (!clean) return "";
		const sep = blockSep || joinSeparator(fullResponse, clean);
		const out = sep + clean;
		fullResponse += out;
		return out;
	};
	for await (const part of result.fullStream) {
		switch (part.type) {
			case "text-delta": {
				// FIX-186: após a descoberta falhar no turno, SUPRIME todo texto do
				// modelo daqui pra frente — mata a narração de erro cru ("dificuldade
				// técnica pontual") e o empilhamento de preâmbulos "vou buscar". O
				// fallback humano é materializado deterministicamente pelo orchestrator.
				// FIX-262: mesma supressão quando o modelo chamou tool fora do
				// toolset (tool-error) ou estourou o cap de tool-calls — nos dois
				// casos a narração seguinte tende a negar uma oferta real ou repetir
				// o fallback cru do loop; nunca chega ao usuário.
				if (discoveryFailedThisTurn || toolErrorThisTurn || toolCallCapExceededThisTurn) break;
				const blockId = (part as { id?: string }).id;
				// FIX-182: fronteira de bloco (step diferente do turno multi-tool) →
				// fecha a frase pendente do bloco anterior, com separador entre blocos.
				// FIX-330: `flushPending()`, não `flush()` — essa fronteira NÃO é o
				// fim real do turno; liberar a pergunta segurada aqui deixava ela
				// escapar cedo demais quando o bloco SEGUINTE (ou o gate no fim do
				// turno) também termina em pergunta (achado ao vivo, P4).
				if (blockId !== lastTextBlockId && lastTextBlockId !== undefined) {
					const blockSep = textBlockSeparator(lastTextBlockId, blockId, fullResponse);
					const flushed = composeClean(ephemeralFilter.flushPending(), blockSep);
					if (flushed) yield { type: "text-delta", text: flushed };
				}
				lastTextBlockId = blockId;
				// FIX-188: só a frase COMPLETA e não-preâmbulo é liberada (por frase).
				const emitted = composeClean(ephemeralFilter.push(part.text));
				if (emitted) yield { type: "text-delta", text: emitted };
				break;
			}
			case "tool-result": {
				const output = (part as { output?: unknown }).output;
				// FIX-186: marcador de descoberta falhada (runDiscovery não re-lança
				// mais). Liga o sinal do turno — a partir daqui a narração é suprimida
				// e a proposta é bloqueada (FIX-187).
				if (isDiscoveryFailedResult(output)) discoveryFailedThisTurn = true;
				// FIX-7: conta as opções retornadas pela descoberta (single-option
				// guard). Tools fora da descoberta retornam null e não interferem.
				const count = extractDiscoveryCount(part.toolName, output);
				if (count !== null) discoveryCount = count;
				// FIX-C3: guarda o retorno real do simulate_quota pra coagir o
				// payload do simulation_result emitido neste mesmo turno.
				if (part.toolName === "simulate_quota") {
					lastQuotaSimulation = output ?? null;
					// FIX-287/FIX-292: groupId simulado neste turno → cenário REAL
					// conhecido (creditValue + monthlyPayment + termMonths) pra
					// qualquer comparison_table/recommendation_card SUBSEQUENTE do
					// mesmo turno (não retroage pro que já foi emitido ANTES desta
					// simulação — gap residual documentado no ADR do bloco).
					const known = extractKnownCreditValue("simulation_result", output);
					if (known) {
						const { groupId, ...value } = known;
						turnKnownCreditValues.set(groupId, value);
					}
				}
				// FIX-191: indexa os grupos reais da descoberta deste turno pra coagir
				// o hero (recommendation_card) e o seletor (comparison_table).
				if (part.toolName === "recommend_groups" || part.toolName === "search_groups") {
					indexRevealGroups(revealGroupsById, part.toolName, (part as { output?: unknown }).output);
				}
				break;
			}
			// FIX-257 (P1, veredito Fable r4 §P1 #1) + FIX-262 (P1, veredito Fable
			// r5, causa-raiz N1): o AI SDK (versão instalada) unificou o antigo chunk
			// "tool-input-error" dentro de "tool-error" — ambos os cenários (Zod
			// rejeita o input; ou o modelo chama tool FORA do toolset da fase,
			// NoSuchToolError) chegam aqui, distinguíveis só pelo tipo de `error`.
			// Sem case dedicado, a chamada caía no `output: null` mudo de
			// tool-io-log (nenhum tool-result pareado) — indistinguível de "rodou e
			// não achou nada". Foi esse buraco que alimentou a espiral de negação:
			// o modelo tratou "tool indisponível" como "não existe" e negou 3×
			// ofertas que estavam na própria tabela exibida.
			case "tool-error": {
				const errPart = part as {
					toolCallId?: string;
					toolName: string;
					input?: unknown;
					error?: unknown;
				};
				// Input inválido (Zod) é recuperável — o modelo pode corrigir e
				// retentar no próprio turno. Log nomeado, sem abortar (FIX-257).
				if (InvalidToolInputError.isInstance(errPart.error)) {
					logToolInputError({
						conversationId,
						stepNumber: toolIoStep,
						error: {
							toolCallId: errPart.toolCallId,
							toolName: errPart.toolName,
							input: errPart.input,
							errorText: stringifyToolError(errPart.error),
						},
					});
					break;
				}
				// Qualquer outro tool-error (ex.: NoSuchToolError — tool fora do
				// toolset da fase) é a causa-raiz do FIX-262: log BARULHENTO + assume
				// o turno, NENHUM texto do modelo (que tenderia à negação) chega ao
				// usuário — o orchestrator materializa o fallback determinístico
				// (mesmo padrão Lei 1/4 do FIX-186/discoveryFailedThisTurn).
				logToolError({
					conversationId,
					stepNumber: toolIoStep,
					error: {
						toolCallId: errPart.toolCallId,
						toolName: errPart.toolName,
						input: errPart.input,
						errorText: stringifyToolError(errPart.error),
					},
				});
				toolErrorThisTurn = true;
				// Melhor esforço: corta a geração em background (o modelo tende a
				// insistir na mesma tool indisponível — é essa insistência que vira
				// o loop de 34/593s do veredito). O `break` logo abaixo do switch
				// para de RELAYAR qualquer coisa pro usuário neste turno de qualquer
				// forma, mesmo se o abort não cortar a tempo.
				turnAbortController.abort();
				break;
			}
			case "tool-call": {
				// FIX-262: cap DURO de tool-calls por turno. Conta TODA tool-call
				// processada (não só steps do modelo) — acima do cap, para
				// completamente de processar/relayar (nem artifact, nem texto) e
				// aborta a geração. Nunca mais um turno de 34 chamadas/593s.
				toolCallCountThisTurn += 1;
				if (toolCallCountThisTurn > TOOL_CALL_HARD_CAP) {
					toolCallCapExceededThisTurn = true;
					turnAbortController.abort();
					console.error(
						`[tool-call-cap] turno excedeu ${TOOL_CALL_HARD_CAP} tool-calls (conv=${conversationId}) — abortando`,
					);
					break;
				}
				const toolName = part.toolName;
				const input = part.input as Record<string, unknown>;
				const toolCallId = part.toolCallId;
				executedToolNames.push(toolName);
				// FIX-188: fecha o texto pré-tool (preâmbulo de processo é DROPADO aqui)
				// ANTES de emitir o tool-call/artifact — o status real é o chip
				// determinístico, não uma fala do modelo. Exceção: handoff (agente
				// calado por design; o texto pendente some com o turno).
				// FIX-330: `flushPending()` — pré-tool-call NÃO é o fim real do
				// turno (mais tool-calls/texto podem vir depois); liberar a
				// pergunta segurada aqui é a MESMA classe de escape prematuro do
				// FIX-182 acima.
				if (toolName !== "suggest_handoff") {
					const flushed = composeClean(ephemeralFilter.flushPending());
					if (flushed) yield { type: "text-delta", text: flushed };
				}
				lastTextBlockId = undefined;
				// FIX-19: com o gating a montante (builder filtra o toolset pela
				// tool-policy da fase), uma chamada de tool FORA da policy significa
				// que a tool entrou no request indevidamente — bug da policy/builder,
				// não do modelo. Os guards abaixo seguram o estrago (segunda linha),
				// mas o log forte é o tripwire pra corrigir a tabela.
				if (!isConcierge && !toolPolicyAllowed.has(toolName)) {
					console.error(
						`[tool-policy-violation] tool=${toolName} fase=${phaseFromMeta(meta)} chamada fora da policy — toolset não foi filtrado a montante (conv=${conversationId})`,
					);
				}
				yield { type: "tool-call", toolName, input, toolCallId };

				if (toolName === "suggest_handoff") {
					const handoffInput = input as { triggerId?: string; reason?: string };
					handoffSignal = {
						triggerId: handoffInput.triggerId,
						reason: handoffInput.reason ?? "trigger satisfied",
					};
					break;
				}

				if (PRESENTATION_TOOLS.has(toolName)) {
					const artifactType = artifactTypeFor(toolName);
					// FIX-20: segunda linha de defesa em tabela declarativa — as regras
					// (whatsapp-optin/post-closure/premature-contract/reveal-loop/
					// single-option), a ordem e os formatos de log vivem em
					// artifact-guard.ts, com 1 teste por regra + teste de ordem.
					const guardVerdict = evaluateArtifactGuards({
						meta,
						artifactType,
						userIntent,
						isUserTurn,
						discoveryCount,
						// FIX-187: turno com descoberta falhada → guard dropa a família de
						// proposta (o tool-result da busca falhada já passou neste ponto).
						discoveryFailedThisTurn,
						conversationId,
						turnArtifactTypes: artifacts.map((a) => a.type),
					});
					if (!guardVerdict.allow) {
						console.log(guardVerdict.logLine);
						// FIX-24: além do console.log (que cassettes grepam), emite o
						// evento de telemetria pro turn-trace popular `suppressed[]`.
						yield { type: "suppression", artifactType, reason: guardVerdict.rule };
						// FIX-12 (recovery): marca pra forçar o gate identify no fim do
						// turno, mesmo se decideShowGate/shouldAskMotive quiserem segurar.
						if (guardVerdict.rule === "premature-contract") {
							prematureContractSuppressedThisTurn = true;
						}
						// FIX-297: hero suprimido por falta de consentimento — computa o
						// MESMO payload coagido que o caminho permitido usaria (Lei 1: os
						// números vêm do grupo real do turno, nunca do texto do modelo) e
						// guarda pra emissão determinística posterior (reco-consent).
						if (guardVerdict.rule === "hero-awaits-reco-consent") {
							if (artifactType === "recommendation_card") {
								const requestedCreditValue =
									meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax;
								pendingRecommendationPayload = coerceRecommendationPayload(
									input,
									revealGroupsById,
									await getAdministradoraLogos(),
									requestedCreditValue,
									await getKnownCreditValues(),
								);
							}
							if (artifactType === "simulation_result") {
								pendingSimulationPayload = coerceSimulationPayload(input, lastQuotaSimulation);
							}
						}
					} else {
						// FIX-6: o dial NUNCA mostra números divergentes da oferta
						// ativa — coage payload com o snapshot do reveal (ou com o
						// âncora emitido neste mesmo turno, se houver).
						let payload = input;
						// FIX-9: identidade já coletada no identify → form de contratação
						// vira confirmação (CPF mascarado, nunca em claro no payload).
						if (artifactType === "contract_form") {
							try {
								const identity = await loadIdentity(conversationId);
								payload = enrichContractFormPayload(input, identity);
							} catch {
								// falha de decrypt/DB não pode derrubar o turno — form vazio.
							}
							// FIX-251 (P0, veredito Fable FINAL §N-A): um what-if REJEITADO
							// (ex.: "quero a ITAÚ" → 161k) pode ter deixado meta.recommendedOffer
							// ancorado numa administradora que o usuário já abandonou — o
							// fechamento (contract-input.ts) usaria esse valor STALE mesmo
							// depois do usuário reconfirmar a oferta original por texto (sem
							// nova tool-call, então sem novo simulation_result pra re-ancorar).
							// Re-ancora AQUI pela administradora que o PRÓPRIO turno de
							// fechamento está anunciando (input.administradora) — resolvida
							// server-side contra os grupos REALMENTE exibidos no reveal
							// (findOfferByAdministradora), nunca a meta potencialmente stale.
							// "nunca aja sobre entidade não-ancorada" no ponto mais caro da
							// jornada: proposta REAL na Bevi.
							const formAdministradora =
								typeof input === "object" && input !== null
									? (input as Record<string, unknown>).administradora
									: undefined;
							if (typeof formAdministradora === "string" && formAdministradora.length > 0) {
								const resolved = await resolveOfferForAdministradora(
									conversationId,
									formAdministradora,
								);
								if (
									resolved &&
									typeof resolved.creditValue === "number" &&
									typeof resolved.termMonths === "number" &&
									typeof resolved.monthlyPayment === "number"
								) {
									const refreshed = await reloadMeta(conversationId);
									const stale =
										refreshed.recommendedAdministradora !== resolved.administradora ||
										refreshed.recommendedOffer?.creditValue !== resolved.creditValue;
									if (stale) {
										console.log(
											`[ancora-fechamento] FIX-251: recommendedOffer re-ancorado pra ${resolved.administradora} (creditValue=${resolved.creditValue}) — snapshot anterior divergia da administradora anunciada no fechamento (conv=${conversationId})`,
										);
										await persistMeta(conversationId, {
											...refreshed,
											recommendedAdministradora: resolved.administradora ?? formAdministradora,
											recommendedOffer: {
												...refreshed.recommendedOffer,
												administradora: resolved.administradora ?? formAdministradora,
												creditValue: resolved.creditValue,
												termMonths: resolved.termMonths,
												monthlyPayment: resolved.monthlyPayment,
												groupId: resolved.groupId,
											},
										});
									}
									// FIX-316 (rodada 10, onda 4 — veredito Fable, achado A1): até
									// aqui só o META era re-ancorado — o PAYLOAD do form (o que o
									// usuário efetivamente VÊ e preenche) continuava com
									// `input.administradora` cru do modelo. Achado ao vivo: form
									// exibia "Canopus" (o que o usuário pediu) mas a proposta final
									// (real_offer) fechava com "ITAÚ" (a âncora resolvida) — o
									// cliente preenchia um pré-cadastro pra uma administradora e
									// recebia reserva de outra. O form TEM que mostrar a MESMA
									// administradora que vai fechar — nunca o texto livre do modelo.
									payload = { ...(payload as Record<string, unknown>), administradora: resolved.administradora };
								} else {
									// FIX-316: resolução FALHOU (administradora citada não bate com
									// nenhum grupo real exibido) — o form NUNCA pode mostrar uma
									// administradora não-ancorada. Cai pro que já está ancorado
									// (recommendedAdministradora), nunca o texto livre do modelo.
									const refreshed = await reloadMeta(conversationId);
									if (refreshed.recommendedAdministradora) {
										payload = {
											...(payload as Record<string, unknown>),
											administradora: refreshed.recommendedAdministradora,
										};
									}
								}
							}
						}
						// FIX-27: opt-in com número JÁ capturado (lead form/identify) →
						// confirmação de 1 clique. knownPhone mascarado vem do meta (LGPD).
						// Sem contactPhone, o card cai no modo coleta normal.
						if (artifactType === "whatsapp_optin" && meta.contactPhone) {
							payload = {
								...(typeof input === "object" && input !== null ? input : {}),
								knownPhone: meta.contactPhone,
							};
						}
						// FIX-C3: números do card de simulação SEMPRE do retorno real do
						// simulate_quota — o modelo alucinava campos (receivedCredit =
						// carta cheia com embutido de 49%).
						if (artifactType === "simulation_result") {
							payload = coerceSimulationPayload(input, lastQuotaSimulation);
						}
						// FIX-191: o hero e o seletor deixam de ser digitados pela LLM —
						// cada cota é reescrita a partir do grupo REAL do turno (mata o
						// "36/mês"). Emite groupId/ofertaId/quotaId + availableSlots real
						// (CONTRATO com bloco-b); tipoOferta NUNCA vaza (crítério interno).
						if (artifactType === "recommendation_card") {
							// FIX-261: valor PEDIDO pelo usuário — mesma precedência do FIX-68
							// (analyze.ts "lastRequested"): creditClampedFrom (original, antes
							// do clamp de categoria) senão creditMax.
							const requestedCreditValue =
								meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax;
							payload = coerceRecommendationPayload(
								input,
								revealGroupsById,
								await getAdministradoraLogos(),
								requestedCreditValue,
								await getKnownCreditValues(),
							);
						}
						if (artifactType === "comparison_table") {
							payload = coerceComparisonPayload(
								input,
								revealGroupsById,
								await getAdministradoraLogos(),
								await getKnownCreditValues(),
							);
						}
						if (artifactType === "contemplation_dial") {
							const snapshot = resolveOfferSnapshot(artifacts, meta);
							// FIX-C5: defaults do perfil declarado na qualificação.
							// FIX-241: monthlySavings/fgtsValue ancoram no BOLSO, não no
							// prazo desejado (dial-payload.ts:computeMoneyAnchor).
							payload = coerceDialPayload(input, snapshot, {
								prazoMeses: meta.qualifyAnswers?.prazoMeses,
								lanceValue: meta.qualifyAnswers?.lanceValue,
								monthlySavings: meta.qualifyAnswers?.monthlySavings,
								fgtsValue: meta.qualifyAnswers?.fgtsValue,
							});
						}
						// FIX-228: mesma âncora de oferta do contemplation_dial — os
						// números do embedded_bid vêm da oferta REAL do turno, nunca da LLM.
						if (artifactType === "embedded_bid") {
							const snapshot = resolveOfferSnapshot(artifacts, meta);
							payload = coerceEmbeddedBidPayload(input, snapshot);
						}
						// FIX-229: mesma âncora — monthlyPayment/administradora vêm do
						// grupo real; NUNCA propaga métrica de chance (docs/05).
						if (artifactType === "two_paths") {
							const snapshot = resolveOfferSnapshot(artifacts, meta);
							payload = coerceTwoPathsPayload(input, snapshot);
						}
						// FIX-230: número placebo 1-6 derivado no servidor do groupId
						// REAL (hash determinístico) — a LLM nunca escolhe o número.
						if (artifactType === "scarcity") {
							payload = coerceScarcityPayload(input, revealGroupsById);
						}
						// FIX-300: `topics` chega como ids do catálogo (schema já rejeita
						// qualquer outro valor) — resolve pro COPY canônico do chip aqui,
						// nunca repassa o que a LLM mandou.
						if (artifactType === "topic_picker") {
							payload = resolveTopicPickerPayload(
								input as { prompt?: string; topics: string[]; includeBackButton?: boolean },
							);
						}
						artifacts.push({
							type: artifactType,
							payload,
						});
						yield { type: "artifact", artifactType, payload, toolCallId };
					}
				}

				const stage = LEAD_STAGE_BY_TOOL[toolName];
				if (stage && !stagesEmitted.has(stage)) {
					stagesEmitted.add(stage);
					yield { type: "lead-stage", stage };
				}
				break;
			}
		}
		// FIX-262: assim que o guard dispara (tool fora do toolset da fase, ou
		// cap de tool-calls estourado), para de CONSUMIR o stream imediatamente —
		// nenhuma parte seguinte (texto/tool-call/artifact) é processada ou
		// relayada pro usuário neste turno.
		if (toolErrorThisTurn || toolCallCapExceededThisTurn) break;
	}

	// FIX-262: guard determinístico assumiu o turno (tool-error fora de fase ou
	// cap de tool-calls estourado) — mesmo padrão do discoveryFailedThisTurn
	// logo abaixo: NADA do que o modelo gerou é persistido/relayado, o
	// orchestrator materializa o fallback fixo e finaliza (Lei 1/4).
	if (toolErrorThisTurn || toolCallCapExceededThisTurn) {
		console.log(
			`[tool-error-recovery] guard: ${
				toolCallCapExceededThisTurn
					? "cap de tool-calls excedido"
					: "tool-error fora do toolset da fase"
			} — fallback determinístico assume o turno (conv=${conversationId})`,
		);
		return {
			fullResponse: "",
			artifacts: [],
			handoffSignaled: false,
			isConcierge,
			nextGateToFire: null,
			prefixForNextGate: null,
			toolErrorThisTurn,
			toolCallCapExceededThisTurn,
			revealGroupsById,
		};
	}

	// FIX-186: a descoberta falhou neste turno → NÃO persiste o texto do modelo
	// (a narração foi suprimida; o preâmbulo pré-falha ficou EFÊMERO no filtro e é
	// descartado aqui — nem vaza no stream, FIX-188), NÃO avalia reveal/gates. O
	// orchestrator materializa a mensagem amigável FIXA e finaliza o turno (Lei 1).
	if (discoveryFailedThisTurn) {
		console.log(
			`[discovery-failed] guard: descoberta falhou no turno — fallback determinístico (conv=${conversationId})`,
		);
		return {
			fullResponse: "",
			artifacts: [],
			handoffSignaled: false,
			isConcierge,
			nextGateToFire: null,
			prefixForNextGate: null,
			discoveryFailedThisTurn: true,
		};
	}

	// FIX-326 (rodada 10, veredito Sonnet A.5/A.6 — P4, teto explícito da r10):
	// o flush abaixo libera a ÚLTIMA pergunta que o MODELO fez no turno
	// (FIX-298) — mas o cálculo REAL de qual gate vai disparar
	// (`nextGateToFire`, mais abaixo nesta função) só acontece DEPOIS. Sem
	// isso, quando um gate com pergunta PRÓPRIA dispara no mesmo turno
	// (experience/timeframe/reco-consent/etc.), a pergunta do modelo e a
	// pergunta do gate colam no mesmo balão (achado sistemático, múltiplas
	// recoletas ao vivo). Prevê aqui, com as MESMAS funções puras usadas no
	// cálculo real mais abaixo (nunca duplica a lógica, só antecipa a
	// chamada) e dado 100% local — sem esperar os `persistMeta` que só
	// acontecem depois do flush — se um gate com pergunta própria vai
	// disparar. Se sim, descarta a pergunta segurada do modelo: só a
	// pergunta CANÔNICA do gate sobrevive (ela é sempre a estruturalmente
	// correta; a do modelo é só uma reação de texto livre).
	if (!isConcierge) {
		const previewProducedArtifact = artifacts.length > 0;
		const previewArtifactTypes = artifacts.map((a) => a.type);
		const previewMayEvaluateGates =
			!previewProducedArtifact || previewArtifactTypes.some((t) => REVEAL_ARTIFACTS.has(t));
		if (previewMayEvaluateGates) {
			// Replica as mutações de meta que ESTA função já sabe que vai
			// persistir mais abaixo, ANTES do cálculo real de nextGateToFire mas
			// DEPOIS deste bloco — as que `nextGate()`/`decideShowGate()` leem:
			// revealCompleted/searchDispatched (reveal completa NESTE turno),
			// decisionDispatched (card de decisão aparece NESTE turno),
			// doubtsAddressed (FIX-328 — shouldMarkDoubtsAddressed, achado ao
			// vivo pelo veredito Sonnet A.7: sem isso, um turno que resolve
			// "doubts" por texto livre previa "doubts-wait" — isento — quando o
			// cálculo real já avança pra "reco-consent", que TEM pergunta
			// própria, reproduzindo a MESMA colisão que este bloco existe pra
			// evitar).
			const previewRevealCompletesNow =
				!meta.revealCompleted &&
				(artifacts.some((a) => REVEAL_ARTIFACTS.has(a.type)) ||
					Boolean(pendingRecommendationPayload) ||
					Boolean(pendingSimulationPayload));
			const previewDecisionDispatchesNow =
				!meta.decisionDispatched && artifacts.some((a) => a.type === "decision_prompt");
			const previewUserReplied = fullResponse.length > 0;
			const previewDoubtsAddressedNow = shouldMarkDoubtsAddressed({
				meta,
				producedArtifact: previewProducedArtifact,
				userReplied: previewUserReplied,
			});
			// FIX-329 (rodada 10, veredito Sonnet A.8 — achado provado por sonda
			// do juiz): `pendingFollowUp` (gate `consent`/"Entender mais antes",
			// hoje vestigial — nada no funil novo mais SETA esse campo desde o
			// FIX-274 — mas defesa-em-profundidade pra conversas legadas que
			// ainda o carreguem persistido) é limpo em runtime na MESMA janela.
			// Sem replicar, `nextGate()` previa "doubts-wait" (isento) enquanto o
			// cálculo real, com o campo já limpo, avança pro próximo gate real.
			const previewPendingFollowUpClearsNow =
				isUserTurn && !previewProducedArtifact && Boolean(meta.pendingFollowUp) && previewUserReplied;
			// FIX-328 (rodada 10, veredito Sonnet A.7 — hipótese de código, não
			// reproduzida ao vivo, mas mesma classe do doubtsAddressed acima):
			// FIX-68 re-snapshota `discoveredCreditTarget` quando o reveal
			// re-completa numa faixa NOVA — sem replicar isso aqui,
			// `revealValueTargetChanged()` (tool-policy.ts, lido por
			// `nextGate()` ANTES do check de `experience`) poderia usar o valor
			// ANTIGO e prever "search" (isento) quando o cálculo real, já
			// resincronizado, avança pra "experience" (tem pergunta própria).
			const previewDiscoveredCreditTargetResync =
				meta.revealCompleted === true &&
				artifacts.some((a) => REVEAL_ARTIFACTS.has(a.type)) &&
				typeof meta.qualifyAnswers?.creditMax === "number" &&
				meta.qualifyAnswers.creditMax !== meta.discoveredCreditTarget
					? meta.qualifyAnswers.creditMax
					: undefined;
			const previewMeta: ConversationMetadata = {
				...meta,
				...(previewRevealCompletesNow
					? { revealCompleted: true, searchDispatched: true }
					: {}),
				...(previewDecisionDispatchesNow ? { decisionDispatched: true } : {}),
				...(previewDoubtsAddressedNow ? { doubtsAddressed: true } : {}),
				...(previewDiscoveredCreditTargetResync !== undefined
					? { discoveredCreditTarget: previewDiscoveredCreditTargetResync }
					: {}),
				...(previewPendingFollowUpClearsNow ? { pendingFollowUp: false } : {}),
			};
			const { conversations: previewConversationsTable } = await import("@/db/schema");
			const { eq: previewEq } = await import("drizzle-orm");
			const previewConv = await db.query.conversations.findFirst({
				where: previewEq(previewConversationsTable.id, conversationId),
				columns: { contactName: true },
			});
			const previewGate = nextGate(previewMeta, {
				hasContactName: Boolean(previewConv?.contactName),
			});
			const GATES_WITHOUT_OWN_QUESTION: ReadonlySet<Gate> = new Set([
				"name",
				"doubts-wait",
				"search",
				"decision",
			]);
			if (!GATES_WITHOUT_OWN_QUESTION.has(previewGate)) {
				const previewShouldShow = decideShowGate({
					gate: previewGate,
					intent: userIntent,
					meta: previewMeta,
					isUserTurn,
				});
				const previewPassesArtifactGuard =
					!previewProducedArtifact || allowGateWithArtifacts(previewGate, previewArtifactTypes);
				// DESAMARRA (2026-07-13): antes, aqui a pergunta do modelo era
				// DESCARTADA (`discardHeldQuestion`) porque o card ia perguntar. O
				// modelo ficava mudo e o usuário ouvia sempre a mesma frase canônica.
				// Agora a pergunta do MODELO vence: ela é emitida, e o card se cala
				// (só mostra o input). A regra "1 pergunta por balão" segue de pé —
				// mudou só quem faz a pergunta.
				if (previewShouldShow && previewPassesArtifactGuard && ephemeralFilter.hasHeldQuestion()) {
					modelAskedGateQuestion = true;
				}
			}
		}
	}

	// FIX-188: libera a última frase pendente do stream (sucesso), também filtrada
	// — a cauda sem pontuação final ("...Vou buscar os grupos agora") é avaliada
	// antes de virar bolha.
	{
		const tail = composeClean(ephemeralFilter.flush());
		if (tail) yield { type: "text-delta", text: tail };
	}

	// FIX-102 + FIX-188 + FIX-189 + FIX-270: colapsa eco/degeneração da LLM,
	// garante (belt-and-suspenders) que nenhum preâmbulo/estado fabricado
	// persista e desgruda falas coladas — o filtro já limpou ao vivo com o
	// estado PARCIAL do stream; esta é a rede final com o estado COMPLETO do
	// turno (executedToolNames fechado), antes de persistência/prefixo do gate.
	fullResponse = normalizeGluedSentences(
		stripProcessPreamble(collapseEchoedSegments(fullResponse), {
			hasReceivedDocuments,
			hasSearchToolCall: executedToolNames.some((t) => CATALOG_SEARCH_TOOL_NAMES.has(t)),
		}),
	).replace(/^\s+/, "");

	try {
		const finishReason = await result.finishReason;
		// FIX-261 (rodada 5, veredito Fable r4): achado "turno saiu truncado no
		// meio do nome ('Perfeito, Madal')" — investigação (fork) não achou bug
		// de split/chunk client nem server (web/adapter.ts não faz split algum).
		// Candidato mais provável: finishReason anômalo (ex. "length", limite de
		// tokens) cortando a geração ANTES do fim natural — antes só logava sem
		// contexto suficiente pra confirmar. A cauda do texto entra no log pra
		// a PRÓXIMA rodada provar/descartar a hipótese com evidência real (não
		// especular um retry sem confirmar a causa — regra epistêmica).
		if (finishReason !== "stop" && finishReason !== "tool-calls") {
			console.warn(
				`[orchestrator] Agent stream ended with unexpected finishReason="${finishReason}" persona=${currentPersona} tail="${fullResponse.slice(-80)}"`,
			);
		}
	} catch {}

	if (handoffSignal && !isConcierge) {
		console.log(
			`[handoff] persona=${currentPersona} reason="${handoffSignal.reason}" — pausing flow`,
		);
		const refreshed = await reloadMeta(conversationId);
		await persistMeta(conversationId, {
			...refreshed,
			handoffSuggested: true,
			handoffReason: handoffSignal.reason,
		});
		yield {
			type: "handoff",
			reason: handoffSignal.reason,
			triggerId: handoffSignal.triggerId,
		};
		return {
			fullResponse: "",
			artifacts: [],
			handoffSignaled: true,
			isConcierge,
			nextGateToFire: null,
			prefixForNextGate: null,
		};
	}

	let cacheUsage: { cacheRead: number; cacheWrite: number } | null = null;
	try {
		const pmeta = await result.providerMetadata;
		const anthropicMeta = pmeta?.anthropic as
			| { cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
			| undefined;
		if (anthropicMeta) {
			const written = anthropicMeta.cacheCreationInputTokens ?? 0;
			const read = anthropicMeta.cacheReadInputTokens ?? 0;
			if (written > 0 || read > 0) {
				console.log(`[cache] write=${written} read=${read} (persona=${currentPersona})`);
			}
			cacheUsage = { cacheRead: read, cacheWrite: written };
		}
	} catch {}
	// FIX-24: além do console.log (cassettes grepam), emite o evento de telemetria
	// pro turn-trace popular `cacheRead`/`cacheWrite`. Fora do try pra não engolir
	// um throw do consumidor no ponto do yield.
	if (cacheUsage) {
		yield { type: "usage", ...cacheUsage };
	}

	const groupCards = artifacts.filter((a) => a.type === "group_card");
	if (groupCards.length >= 2) {
		const nonGroupCards = artifacts.filter((a) => a.type !== "group_card");
		const consolidated: ProducedArtifact = {
			type: "comparison_table",
			payload: { groups: groupCards.map((a) => a.payload) },
		};
		artifacts.length = 0;
		artifacts.push(...nonGroupCards, consolidated);
		console.log(
			`[orchestrator] Guard: consolidated ${groupCards.length} group_cards into comparison_table`,
		);
	}

	// FIX-290 (P0 sistêmico, veredito r9pos3 Sonnet §3): recommendation_card e
	// comparison_table são "INSEPARÁVEIS" (directives.ts:348) — mas até aqui
	// isso era só regra-no-prompt. Se o modelo chamou present_recommendation_card
	// e parou (nunca chamou present_comparison_table) num turno com 2+ grupos
	// reais, força a emissão server-side aqui — mesmo padrão do FIX-286
	// (buildRecommendationCardFromRevealGroup) pro hero, reaproveitando os
	// MESMOS grupos indexados neste turno (revealGroupsById). Caso de borda: 1
	// grupo único NUNCA força a tabela (regra do reveal — os dois só pulam
	// juntos quando há 1 grupo só).
	//
	// FIX-297: `pendingRecommendationPayload` conta como "o modelo chamou
	// present_recommendation_card" — o guard hero-awaits-reco-consent suprime a
	// EMISSÃO do hero, não a INTENÇÃO do modelo; a tabela continua obrigatória
	// no mesmo turno (nunca some, invariante do FIX-290 preservado mesmo com o
	// hero pendente).
	if (
		(artifacts.some((a) => a.type === "recommendation_card") || pendingRecommendationPayload) &&
		!artifacts.some((a) => a.type === "comparison_table") &&
		usableRevealGroupCount(revealGroupsById) >= 2
	) {
		const payload = buildComparisonTableFromRevealGroups(
			revealGroupsById,
			await getAdministradoraLogos(),
			await getKnownCreditValues(),
		);
		artifacts.push({ type: "comparison_table", payload });
		yield {
			type: "artifact",
			artifactType: "comparison_table",
			payload,
			toolCallId: crypto.randomUUID(),
		};
		console.log(
			`[orchestrator] FIX-290: comparison_table forçado server-side (recommendation_card sem par neste turno, conv=${conversationId})`,
		);
	}

	// Persistir mesmo se turn for só-tools — admin precisa ver que o agent respondeu.
	// Sem isso, turns como save_contact_name / present_value_picker viram ghost no histórico
	// (bug BUG-ADMIN-MESSAGE-MISSING).
	if (fullResponse || executedToolNames.length > 0) {
		const content = fullResponse || `[tool: ${executedToolNames.join(", ")}]`;
		const messageId = await saveMessage(
			conversationId,
			"assistant",
			content,
			channel,
			currentPersona,
		);

		// BUG-LEAD-HISTORY-INCOMPLETE: artifacts emitidos pelo agente
		// (group_card, simulation_result, lead_form, etc.) precisam ficar
		// vinculados à message do turno. Sem isso o histórico do lead no
		// admin perde todos os cards/comparativos. Vale pros 3 canais
		// (web, whatsapp, simulador) porque todos passam por aqui.
		if (artifacts.length > 0) {
			await db.insert(artifactsTable).values(
				artifacts.map((a) => ({
					messageId,
					type: a.type,
					payload: a.payload as Record<string, unknown>,
					createdAt: simulatorNow(),
				})),
			);
		}
	}

	if (detectLeadFormArtifact(artifacts) && !meta.leadCollection) {
		const refreshed = await reloadMeta(conversationId);
		// Pula stages cujos dados já foram capturados conversacionalmente
		// via save_contact_name / save_contact_whatsapp (Fase 6).
		const initial = await initializeLeadCollection(conversationId);
		await persistMeta(conversationId, {
			...refreshed,
			leadCollection: initial,
		});
	}

	// PF-07: marca whatsappOptinShown=true após emitir o artifact pela 1a vez.
	// Próxima chamada da tool no mesmo conversation cai no guard acima.
	if (artifacts.some((a) => a.type === "whatsapp_optin") && !meta.whatsappOptinShown) {
		const refreshed = await reloadMeta(conversationId);
		await persistMeta(conversationId, {
			...refreshed,
			whatsappOptinShown: true,
		});
	}

	// BUG-REVEAL-LOOP: marca revealCompleted quando o passo 3+4 (opções + plano)
	// foi apresentado. Habilita o gate "decision" (nextGate) no próximo turno de
	// avanço do usuário → present_decision_prompt → passo 5. QUALQUER card de
	// reveal serve de âncora — o reveal pode sair como comparison_table (2+),
	// group_card (1), recommendation_card (destacado) ou simulation_result. Limitar
	// a recommendation/simulation deixava a flag desligada quando o agent abria o
	// reveal com group_card/comparison (visto no run real 2026-06-02).
	if (
		(artifacts.some((a) => REVEAL_ARTIFACTS.has(a.type)) ||
			pendingRecommendationPayload ||
			pendingSimulationPayload) &&
		!meta.revealCompleted
	) {
		const refreshed = await reloadMeta(conversationId);
		// FIX-297: hero (recommendation_card) e a simulação que o aprofunda podem
		// ter sido SUPRIMIDOS deste turno (pendentes até reco-consent) — a âncora
		// de administradora/oferta usa o payload PENDENTE quando o artifact
		// visível não existe, senão o contexto do dial/decisão ficaria pobre
		// (group_card, se houver, ou nada) enquanto o hero espera consentimento.
		const recommendationPayload =
			artifacts.find((a) => a.type === "recommendation_card")?.payload ??
			pendingRecommendationPayload ??
			undefined;
		const simulationPayload =
			artifacts.find((a) => a.type === "simulation_result")?.payload ??
			pendingSimulationPayload ??
			undefined;
		const groupCardPayload = artifacts.find((a) => a.type === "group_card")?.payload;
		// Captura a administradora do plano destacado pro contexto do card de
		// decisão / passo 5. Prioridade: recommendation > simulation > group_card.
		const anchorPayload = recommendationPayload ?? simulationPayload ?? groupCardPayload;
		const administradora =
			typeof anchorPayload?.administradora === "string"
				? anchorPayload.administradora
				: refreshed.recommendedAdministradora;
		// FIX-6: snapshot dos números da oferta âncora — fonte única do dial.
		// BUG-SNAPSHOT-ANCHOR-POBRE (E2E real 2026-06-11): o snapshot precisa do
		// artifact RICO — só o simulation_result carrega lanceScenario/embeddedBid
		// (lance real + mês de referência + teto de embutido, FIX-C2). Usar o
		// recommendation_card aqui deixava o dial sem calibração (31% vs 24%).
		const snapshotAnchorPayload = simulationPayload ?? recommendationPayload ?? groupCardPayload;
		const offerSnapshot = offerSnapshotFromArtifact(snapshotAnchorPayload);
		await persistMeta(conversationId, {
			...refreshed,
			revealCompleted: true,
			// Também marca searchDispatched: se o agent free-rodou search_groups (sem
			// passar pelo dispatch do orquestrador), isso impede o index.ts de
			// re-disparar OUTRO reveal — trata o que já apareceu como "a busca".
			searchDispatched: true,
			recommendedAdministradora: administradora,
			// FIX-68: snapshot do valor-alvo desta descoberta — baseline pra detectar
			// uma TROCA de faixa no próximo turno (tool-policy.revealValueTargetChanged).
			...(typeof refreshed.qualifyAnswers?.creditMax === "number"
				? { discoveredCreditTarget: refreshed.qualifyAnswers.creditMax }
				: {}),
			...(offerSnapshot ? { recommendedOffer: offerSnapshot } : {}),
			// FIX-297: hero e simulação pendentes (guard hero-awaits-reco-consent) —
			// sobrevivem no meta pra emissão determinística quando reco-consent
			// resolver, muitos turnos depois (revealGroupsById já não existe fora
			// deste turno).
			...(pendingRecommendationPayload
				? { pendingRecommendationCard: pendingRecommendationPayload }
				: {}),
			...(pendingSimulationPayload ? { pendingSimulationResult: pendingSimulationPayload } : {}),
		});
	}

	// FIX-68: re-descoberta pós-reveal (o usuário trocou de faixa e a nova busca
	// produziu cards) — re-snapshota o valor-alvo pra FECHAR o ciclo: a partir daí
	// um afirmativo curto sobre a faixa NOVA ("ta otimo" no 130k) tem
	// creditMax == discoveredCreditTarget → tool-policy/artifact-guard voltam a
	// segurar a busca (anti BUG-REVEAL-LOOP), em vez de reabrir pra sempre.
	if (meta.revealCompleted === true && artifacts.some((a) => REVEAL_ARTIFACTS.has(a.type))) {
		const refreshed = await reloadMeta(conversationId);
		const target = refreshed.qualifyAnswers?.creditMax;
		if (typeof target === "number" && target !== refreshed.discoveredCreditTarget) {
			await persistMeta(conversationId, { ...refreshed, discoveredCreditTarget: target });
		}
	}

	// FIX-6 (what-if): re-simulação legítima atualiza o snapshot da oferta —
	// o dial sempre acompanha o ÚLTIMO detalhamento que o usuário viu.
	// BUG-ADMIN-DESSINCRONIZADA (2026-06-12): a administradora anda JUNTO com o
	// snapshot — senão a directive do fechamento e a proposta real
	// (contract-input.ts: administradoraPreferida) ficam presas na âncora do
	// reveal antigo ("vai direto pra Âncora!" com simulação decidida na Itaú).
	if (meta.revealCompleted) {
		const newSim = artifacts.find((a) => a.type === "simulation_result");
		const snap = offerSnapshotFromArtifact(newSim?.payload);
		if (snap) {
			// FIX-252 ("pro teto" #3, veredito Fable FINAL): o groupId que a LLM
			// mandou simular pode não ser o que o usuário pediu por nome/valor (ex.:
			// "a de 92 mil" resolvendo pro grupo de 100k — achado do FIX-249
			// "PARCIAL"). Quando o texto do turno resolve DETERMINISTICAMENTE pra um
			// grupo JÁ EXIBIDO diferente do que a LLM simulou, a âncora usa o
			// resolvido — nunca o palpite da LLM (Lei "nunca aja sobre entidade
			// não-ancorada"). resolveOfferByMention nunca inventa: sem match claro
			// (ou ambíguo), snap segue intacto.
			const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
			const mentioned = lastUserText
				? await resolveOfferMentionForConversation(conversationId, lastUserText)
				: null;
			const anchor =
				mentioned &&
				mentioned.groupId !== snap.groupId &&
				typeof mentioned.creditValue === "number" &&
				typeof mentioned.termMonths === "number" &&
				typeof mentioned.monthlyPayment === "number"
					? {
							...snap,
							administradora: mentioned.administradora ?? snap.administradora,
							creditValue: mentioned.creditValue,
							termMonths: mentioned.termMonths,
							monthlyPayment: mentioned.monthlyPayment,
							groupId: mentioned.groupId,
						}
					: snap;
			if (anchor !== snap) {
				console.log(
					`[ancora-fechamento] FIX-252: what-if simulou ${snap.groupId} mas o texto do usuário resolvia pro grupo ${anchor.groupId} (${anchor.administradora}) — âncora corrigida (conv=${conversationId})`,
				);
			}
			const refreshed = await reloadMeta(conversationId);

			// FIX-265 (menor #2, veredito Fable r5, N6): what-if puramente
			// EXPLORATÓRIO (a LLM simulou um crédito que o usuário NÃO pediu — nem
			// por nome/valor já exibido [`mentioned` acima], nem por menção direta
			// do valor no texto) nunca vira a âncora do fechamento/dial — mantém o
			// snapshot anterior (a simulação ainda aparece como card informativo,
			// só não confirma). Só se aplica quando `mentioned` não resolveu nada
			// (sem `mentioned`, a rota determinística já vetou o grupo — sempre
			// confiável, Lei 1/4).
			const currentCredit = refreshed.recommendedOffer?.creditValue;
			const isExploratoryWhatIf =
				!mentioned &&
				typeof currentCredit === "number" &&
				currentCredit > 0 &&
				Math.abs(anchor.creditValue - currentCredit) / currentCredit > 0.15 &&
				!isCreditValueMentioned(lastUserText, anchor.creditValue);

			if (isExploratoryWhatIf) {
				console.log(
					`[snapshot-whatif] FIX-265: what-if ${anchor.creditValue} não respaldado pelo texto do usuário — snapshot mantido em ${currentCredit} (conv=${conversationId})`,
				);
			} else {
				await persistMeta(conversationId, {
					...refreshed,
					recommendedOffer: anchor,
					recommendedAdministradora: anchor.administradora ?? refreshed.recommendedAdministradora,
				});
			}
		}
	}

	// BUG-REVEAL-LOOP (hardening): marca decisionDispatched quando o card de decisão
	// aparece — inclusive quando o MODELO o emite por conta (free-run web), não só
	// quando o orquestrador o dirige (index.ts). Sem isso o guard de idempotência do
	// decision_prompt nunca era exercitado na web (achado do QA crítico 2026-06-02).
	if (artifacts.some((a) => a.type === "decision_prompt") && !meta.decisionDispatched) {
		const refreshed = await reloadMeta(conversationId);
		await persistMeta(conversationId, { ...refreshed, decisionDispatched: true });
	}

	// FIX-244 (rodada 2, Fable r1, gap #9): marca contractFormDispatched quando
	// o formulário de contratação aparece — mesmo hardening do decisionDispatched
	// acima. O handler contract-submit (route.ts) exige essa flag antes de
	// aceitar o fechamento (defesa em profundidade, mesma família do FIX-12).
	if (artifacts.some((a) => a.type === "contract_form") && !meta.contractFormDispatched) {
		const refreshed = await reloadMeta(conversationId);
		await persistMeta(conversationId, { ...refreshed, contractFormDispatched: true });
	}

	const producedArtifact = artifacts.length > 0;
	const turnArtifactTypes = artifacts.map((a) => a.type);
	let nextGateToFire: Gate | null = null;
	let prefixForNextGate: string | null = null;
	// Guard anti-atropelo: turno com artifact não emite gate — EXCETO o
	// simulator-offer no turno do reveal (allowGateWithArtifacts; docx passo 4).
	const mayEvaluateGates =
		!producedArtifact || turnArtifactTypes.some((t) => REVEAL_ARTIFACTS.has(t));
	if (!isConcierge && mayEvaluateGates) {
		const userReplied = fullResponse.length > 0;
		// FIX-206: o clique "Tenho dúvidas" roda a explicação como turno de SERVIDOR
		// (isUserTurn=false) — e ESSE turno já endereça as dúvidas, igual à resposta do
		// usuário no caminho de texto. shouldMarkDoubtsAddressed cobre os DOIS casos,
		// fazendo nextGate convergir pro consent no MESMO turno (mata o beco sem saída
		// onde o funil parava em doubts-wait mudo e o usuário tinha de digitar "vai").
		if (shouldMarkDoubtsAddressed({ meta, producedArtifact, userReplied })) {
			meta.doubtsAddressed = true;
			await persistMeta(conversationId, meta);
		}
		// pendingFollowUp ("Entender mais antes") só é limpo quando o USUÁRIO responde
		// a dúvida por texto — o directive que PERGUNTA é server-authored e mantém o
		// gate suprimido de propósito (o agente perguntou, tem gancho, não trava).
		if (isUserTurn && !producedArtifact && meta.pendingFollowUp && userReplied) {
			meta.pendingFollowUp = false;
			await persistMeta(conversationId, meta);
		}

		const refreshed = await reloadMeta(conversationId);
		// PF-08: lê contactName atual pra pausar gates enquanto nome não capturado.
		const { db } = await import("@/db");
		const { conversations } = await import("@/db/schema");
		const { eq } = await import("drizzle-orm");
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
			columns: { contactName: true },
		});
		const gate = nextGate(refreshed, { hasContactName: Boolean(conv?.contactName) });
		const shouldShow =
			decideShowGate({
				gate,
				intent: userIntent,
				meta: refreshed,
				isUserTurn,
			}) ||
			// FIX-12 (recovery): contract_form pré-reveal suprimido → o gate identify
			// tem que aparecer neste MESMO turno, nunca ficar mudo esperando o motivo
			// (shouldAskMotive) ou um sinal de avanço do usuário.
			(prematureContractSuppressedThisTurn && gate === "identify");
		// FIX-274 — quando o beat do motivo segura o funil (shouldShow=false acima
		// porque shouldAskMotive), marca motivationAsked: o LLM pergunta "por que
		// agora" NESTE turno e, no PRÓXIMO, o funil avança mesmo se o motivo não vier
		// (não-bloqueante, mesmo padrão de desireAsked). shouldShow já foi calculado
		// com o estado ANTERIOR — a marcação só afeta o turno seguinte.
		if (isUserTurn && shouldAskMotive(refreshed)) {
			await persistMeta(conversationId, { ...refreshed, motivationAsked: true });
		}
		// FIX-296 — mesmo padrão acima, um turno depois: quando o motivo já
		// chegou e o beat de espelho+objetivo segura o funil (shouldShow=false
		// por shouldMirrorMotivation), marca motivationMirrored — o gate real
		// (credit) dispara normalmente no turno SEGUINTE.
		if (isUserTurn && shouldMirrorMotivation(refreshed)) {
			await persistMeta(conversationId, { ...refreshed, motivationMirrored: true });
		}
		const passesArtifactGuard =
			!producedArtifact || allowGateWithArtifacts(gate, turnArtifactTypes);
		if (shouldShow && passesArtifactGuard) {
			nextGateToFire = gate;
			// Com artifacts no turno, o texto já foi escrito no stream — sem prefixo.
			// FIX-17: o gate "name" também NÃO leva prefix — gateInteractive('name') é
			// null no WhatsApp; com prefix, o adapter limparia o textBuffer e a
			// pergunta do nome (texto do agente) se perderia no canal.
			if (fullResponse && gate !== "search" && gate !== "name" && !producedArtifact) {
				prefixForNextGate = fullResponse;
			}
		} else if (gate !== "doubts-wait" && isUserTurn && !producedArtifact) {
			console.log(`[gate-skip] gate=${gate} intent=${userIntent} — staying conversational`);
		}
	}

	return {
		fullResponse,
		artifacts,
		handoffSignaled: false,
		isConcierge,
		nextGateToFire,
		prefixForNextGate,
		modelAskedGateQuestion,
	};
}

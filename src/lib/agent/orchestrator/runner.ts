import type { ToolChoice } from "ai";
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
	shouldMarkDoubtsAddressed,
	type UserIntent,
} from "@/lib/agent/qualify-state";
import { renderPersonaExamplesBlock } from "@/lib/agent/system-prompt";
import { isDiscoveryFailedResult, PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import type { ArtifactType } from "@/lib/chat/types";
import { loadAdministradoraLogoMap } from "@/lib/consorcio/administradora-logo-repo";
import { loadIdentity } from "@/lib/conversation/identity";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import type { MemoryContext } from "@/lib/memory/types";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import { evaluateArtifactGuards } from "./artifact-guard";
import { enrichContractFormPayload } from "./contract-form-prefill";
import {
	coerceDialPayload,
	offerSnapshotFromArtifact,
	type RecommendedOfferSnapshot,
} from "./dial-payload";
import { extractDiscoveryCount } from "./discovery-count";
import { coerceEmbeddedBidPayload } from "./embedded-bid-payload";
import { coerceScarcityPayload } from "./scarcity-payload";
import { coerceTwoPathsPayload } from "./two-paths-payload";
import { detectLeadFormArtifact, initializeLeadCollection } from "./lead-collection";
import {
	coerceComparisonPayload,
	coerceRecommendationPayload,
	indexRevealGroups,
	type RevealGroupIndex,
} from "./recommendation-payload";
import {
	EphemeralTextFilter,
	joinSeparator,
	normalizeGluedSentences,
	stripProcessPreamble,
} from "./sanitizer";
import { coerceSimulationPayload } from "./simulation-payload";
import { logToolIO, type ToolCallRecord, type ToolResultRecord } from "./tool-io-log";
import type { Channel, ChatMessage, ProducedArtifact, TurnEvent } from "./types";

export type RunAgentResult = {
	fullResponse: string;
	artifacts: ProducedArtifact[];
	handoffSignaled: boolean;
	isConcierge: boolean;
	nextGateToFire: Gate | null;
	prefixForNextGate: string | null;
	/** FIX-186: a descoberta na Bevi falhou neste turno (após retry). O
	 * orchestrator materializa a mensagem amigável FIXA em vez de deixar o modelo
	 * narrar erro cru; e o gate de proposta (FIX-187) fica bloqueado. */
	discoveryFailedThisTurn?: boolean;
};

const LEAD_STAGE_BY_TOOL: Record<string, "engajado" | "qualificado"> = {
	simulate_quota: "engajado",
	recommend_groups: "qualificado",
};

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
 * apresentou os cards do reveal. Os demais gates seguem bloqueados. */
export function allowGateWithArtifacts(gate: Gate, artifactTypes: string[]): boolean {
	return gate === "simulator-offer" && artifactTypes.some((t) => REVEAL_ARTIFACTS.has(t));
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
	// FIX-191: grupos REAIS do recommend_groups/search_groups deste turno,
	// indexados por id — fonte única dos números do recommendation_card (hero) e
	// de cada cota do comparison_table (seletor). Mata o "36/mês" fabricado
	// (spec §2): o hero deixa de ser o único artifact do reveal sem coerção.
	const revealGroupsById: RevealGroupIndex = new Map();
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
	const result = await agent.stream({
		messages,
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
	const ephemeralFilter = new EphemeralTextFilter();
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
				if (discoveryFailedThisTurn) break;
				const blockId = (part as { id?: string }).id;
				// FIX-182: fronteira de bloco (step diferente do turno multi-tool) →
				// fecha a frase pendente do bloco anterior, com separador entre blocos.
				if (blockId !== lastTextBlockId && lastTextBlockId !== undefined) {
					const blockSep = textBlockSeparator(lastTextBlockId, blockId, fullResponse);
					const flushed = composeClean(ephemeralFilter.flush(), blockSep);
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
				}
				// FIX-191: indexa os grupos reais da descoberta deste turno pra coagir
				// o hero (recommendation_card) e o seletor (comparison_table).
				if (part.toolName === "recommend_groups" || part.toolName === "search_groups") {
					indexRevealGroups(revealGroupsById, part.toolName, (part as { output?: unknown }).output);
				}
				break;
			}
			case "tool-call": {
				const toolName = part.toolName;
				const input = part.input as Record<string, unknown>;
				const toolCallId = part.toolCallId;
				executedToolNames.push(toolName);
				// FIX-188: fecha o texto pré-tool (preâmbulo de processo é DROPADO aqui)
				// ANTES de emitir o tool-call/artifact — o status real é o chip
				// determinístico, não uma fala do modelo. Exceção: handoff (agente
				// calado por design; o texto pendente some com o turno).
				if (toolName !== "suggest_handoff") {
					const flushed = composeClean(ephemeralFilter.flush());
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
							payload = coerceRecommendationPayload(
								input,
								revealGroupsById,
								await getAdministradoraLogos(),
							);
						}
						if (artifactType === "comparison_table") {
							payload = coerceComparisonPayload(
								input,
								revealGroupsById,
								await getAdministradoraLogos(),
							);
						}
						if (artifactType === "contemplation_dial") {
							const snapshot = resolveOfferSnapshot(artifacts, meta);
							// FIX-C5: defaults do perfil declarado na qualificação.
							payload = coerceDialPayload(input, snapshot, {
								prazoMeses: meta.qualifyAnswers?.prazoMeses,
								lanceValue: meta.qualifyAnswers?.lanceValue,
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

	// FIX-188: libera a última frase pendente do stream (sucesso), também filtrada
	// — a cauda sem pontuação final ("...Vou buscar os grupos agora") é avaliada
	// antes de virar bolha.
	{
		const tail = composeClean(ephemeralFilter.flush());
		if (tail) yield { type: "text-delta", text: tail };
	}

	// FIX-102 + FIX-188 + FIX-189: colapsa eco/degeneração da LLM, garante (belt-and-
	// suspenders) que nenhum preâmbulo persista e desgruda falas coladas — o filtro
	// já limpou ao vivo, esta é a rede final antes de persistência/prefixo do gate.
	fullResponse = normalizeGluedSentences(
		stripProcessPreamble(collapseEchoedSegments(fullResponse)),
	).replace(/^\s+/, "");

	try {
		const finishReason = await result.finishReason;
		if (finishReason !== "stop" && finishReason !== "tool-calls") {
			console.warn(
				`[orchestrator] Agent stream ended with unexpected finishReason="${finishReason}" persona=${currentPersona}`,
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
	if (artifacts.some((a) => REVEAL_ARTIFACTS.has(a.type)) && !meta.revealCompleted) {
		const refreshed = await reloadMeta(conversationId);
		// Captura a administradora do plano destacado pro contexto do card de
		// decisão / passo 5. Prioridade: recommendation > simulation > group_card.
		const anchor =
			artifacts.find((a) => a.type === "recommendation_card") ??
			artifacts.find((a) => a.type === "simulation_result") ??
			artifacts.find((a) => a.type === "group_card");
		const administradora =
			typeof anchor?.payload?.administradora === "string"
				? anchor.payload.administradora
				: refreshed.recommendedAdministradora;
		// FIX-6: snapshot dos números da oferta âncora — fonte única do dial.
		// BUG-SNAPSHOT-ANCHOR-POBRE (E2E real 2026-06-11): o snapshot precisa do
		// artifact RICO — só o simulation_result carrega lanceScenario/embeddedBid
		// (lance real + mês de referência + teto de embutido, FIX-C2). Usar o
		// recommendation_card aqui deixava o dial sem calibração (31% vs 24%).
		const snapshotAnchor =
			artifacts.find((a) => a.type === "simulation_result") ??
			artifacts.find((a) => a.type === "recommendation_card") ??
			artifacts.find((a) => a.type === "group_card");
		const offerSnapshot = offerSnapshotFromArtifact(snapshotAnchor?.payload);
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
			const refreshed = await reloadMeta(conversationId);
			await persistMeta(conversationId, {
				...refreshed,
				recommendedOffer: snap,
				recommendedAdministradora: snap.administradora ?? refreshed.recommendedAdministradora,
			});
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
		const shouldShow = decideShowGate({
			gate,
			intent: userIntent,
			meta: refreshed,
			isUserTurn,
		});
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
	};
}

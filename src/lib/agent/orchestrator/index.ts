import { eq } from "drizzle-orm";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations } from "@/db/schema";
import { pendingGateAfterTurn } from "@/lib/agent/gate-reengage";
import type { ConversationMetadata, Persona } from "@/lib/agent/personas";
import { LANCE_EMBUTIDO_DEFAULT_PERCENT } from "@/lib/agent/qualify-config";
import { nextGate, type UserIntent } from "@/lib/agent/qualify-state";
import type { ArtifactType } from "@/lib/chat/types";
import { loadAdministradoraLogoMap } from "@/lib/consorcio/administradora-logo-repo";
import { loadConversationHistory, saveMessage } from "@/lib/conversation/messages";
import { metaOf, persistMeta, reloadMeta } from "@/lib/conversation/meta";
import {
	loadMemoryContextForTurn,
	memorySystemMessageFromContext,
	resolveIdentityForTurn,
	storeMemoriesForTurn,
} from "@/lib/memory/orchestrator-bridge";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import { getOrCreateConversation } from "@/lib/whatsapp/session";
import { analyzeAndMerge } from "./analyze";
import { listShownOffersForConversation, resolveOfferMentionForConversation } from "./choose-offer";
import { isLikelyNameResponse } from "./detect-name-turn";
import { computeMoneyAnchor, offerSnapshotFromArtifact } from "./dial-payload";
import {
	buildAdvanceToContractDirective,
	buildDecisionPromptDirective,
	buildDiscoveryFailedFallback,
	buildFirstRevealCardIntro,
	buildFirstRevealRecoveryFallback,
	buildLanceSoParcelaDirective,
	buildScarcityDirective,
	buildSearchSummaryDirective,
	buildSimulatorDialDirective,
	buildToolErrorRecoveryExactnessFallback,
	buildToolErrorRecoveryFallback,
	buildToolErrorRecoveryFallbackRepeat,
	buildToolErrorRecoveryResolvedFallback,
	buildWhatsappOptinDirective,
	isExactnessOrCriteriaQuestion,
	TWO_PATHS_FOLLOWUP_TEXT,
} from "./directives";
import { runLeadCollectionTurn } from "./lead-collection";
import {
	buildRecommendationCardFromRevealGroup,
	pickBestRankedGroup,
} from "./recommendation-payload";
import { decideRouting, resolveIntraCategorySwitch } from "./routing";
import { runAgentTurn } from "./runner";
import {
	buildDecisionPromptCard,
	buildEmbeddedBidCard,
	buildScarcityCard,
	buildTwoPathsCard,
	buildWhatsappOptinCard,
} from "./server-cards";
import { buildSystemContext } from "./system-context";
import { revealValueTargetChanged } from "./tool-policy";
import { planTransition, yieldTransitionAbort } from "./transition";
import type { Channel, ChatMessage, TurnEvent, TurnInput } from "./types";
import { shouldEmitWhatsappOptin } from "./whatsapp-optin-guard";

export type { TurnEvent, TurnInput } from "./types";

// FIX-260 (rodada 5, veredito Fable r4): heurística determinística de sim/não
// em texto livre — usada SÓ pra consumir os gates lance-embutido/
// simulator-offer quando a resposta vem digitada (nunca por clique, que já
// tem handler próprio em route.ts). Lei 4: invariante de gate vira código,
// não regra-no-prompt. `intent` (do analyzer) filtra pergunta/dúvida/off-topic
// ANTES do regex — mesmo critério que decideShowGate já usa pra esses gates.
const YES_TEXT_MARKERS =
	/\b(sim|quero|considero|considerar|pode ser|topo|bora|vamos|manda ver|isso mesmo|show|beleza|claro|positivo|certo|ok)\b/i;
const NO_TEXT_MARKERS = /\bn[ãa]o\b/i;

function detectYesNoText(text: string, intent: UserIntent): boolean | null {
	if (
		intent === "asking_question" ||
		intent === "expressing_doubt" ||
		intent === "off_topic" ||
		intent === "wants_more_options"
	) {
		return null;
	}
	const t = text.trim();
	if (!t) return null;
	if (NO_TEXT_MARKERS.test(t)) return false;
	if (YES_TEXT_MARKERS.test(t)) return true;
	return null;
}

/** FIX-246 (rodada 3, Fable r2 — causa-raiz do veredito 4/10): emite um card
 * SERVER-SIDE determinístico no caminho de TEXTO LIVRE (whatsapp + web) —
 * espelha `pipeServerArtifact` do adapter web, mas em generator (o consumidor
 * de cada canal já sabe tratar `TurnEvent` do tipo "artifact" uniformemente).
 * Nunca depende de o LLM chamar `present_X`. */
async function* emitServerCard(args: {
	conversationId: string;
	channel: Channel;
	persona: Persona;
	artifactType: ArtifactType;
	payload: Record<string, unknown>;
}): AsyncGenerator<TurnEvent> {
	const { conversationId, channel, persona, artifactType, payload } = args;
	const messageId = await saveMessage(
		conversationId,
		"assistant",
		`[card: ${artifactType}]`,
		channel,
		persona,
	);
	await db.insert(artifactsTable).values({
		messageId,
		type: artifactType,
		payload,
		createdAt: simulatorNow(),
	});
	yield { type: "artifact", artifactType, payload, toolCallId: crypto.randomUUID() };
}

export async function* runTurn(input: TurnInput): AsyncGenerator<TurnEvent> {
	const {
		channel,
		conversationId: providedConversationId,
		userText,
		isUserTurn,
		contactName,
		skipAnalyzer,
		skipLeadCollection,
		userIntent: providedIntent,
		userKey,
		suppressGateEvent,
	} = input;

	const conversationId = providedConversationId;
	if (!conversationId) {
		throw new Error("[orchestrator] conversationId is required");
	}

	if (channel === "whatsapp" && contactName) {
		const existing = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		if (existing && contactName !== existing.contactName) {
			await db
				.update(conversations)
				.set({ contactName, updatedAt: simulatorNow() })
				.where(eq(conversations.id, conversationId));
		}
	}

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	const currentPersona: Persona = meta.currentPersona ?? "concierge";
	const knownName = contactName ?? conv?.contactName ?? null;

	if (isUserTurn && meta.handoffSuggested) {
		await saveMessage(conversationId, "user", userText, channel);
		yield { type: "handoff", reason: meta.handoffReason ?? "trigger satisfied" };
		yield { type: "finish", reason: "handoff-pending" };
		return;
	}

	if (isUserTurn && !skipLeadCollection && meta.leadCollection) {
		yield* runLeadCollectionTurn({ conversationId, channel, text: userText, meta, userKey });
		yield { type: "finish", reason: "lead-collection" };
		return;
	}

	let newlyExtractedExperience: ConversationMetadata["experiencePrev"] | null = null;
	let analyzedIntent = providedIntent ?? "neutral";

	if (isUserTurn && !skipAnalyzer) {
		// FIX-260 (rodada 5, veredito Fable r4): snapshot do gate ativo ANTES do
		// merge do analyzer — mesmo padrão do FIX-236 (activeGateAtTurnStart em
		// analyze.ts) pra restringir a captura de texto livre ao gate REALMENTE
		// pendente neste turno (nunca herda "sim" de outro contexto).
		const activeGateAtTurnStart = nextGate(meta, { hasContactName: Boolean(knownName) });
		const {
			analysis,
			metaChanged,
			newlyExtractedExperience: extracted,
		} = await analyzeAndMerge(userText, currentPersona, meta);
		newlyExtractedExperience = extracted;
		analyzedIntent = analysis.userIntent;

		if (metaChanged) {
			await persistMeta(conversationId, meta);
			yield { type: "meta-update", meta };
		}

		// FIX-260: gate lance-embutido respondido por TEXTO LIVRE não era
		// CONSUMIDO — só o clique (route.ts) setava qualifyAnswers.lanceEmbutido;
		// nextGate() devolvia "lance-embutido" pra sempre e o disparo automático
		// (abaixo) reemitia o card embedded_bid + a educação a cada turno (loop
		// até o usuário clicar).
		if (
			activeGateAtTurnStart === "lance-embutido" &&
			meta.qualifyAnswers?.lanceEmbutido === undefined
		) {
			const answer = detectYesNoText(userText, analyzedIntent);
			if (answer !== null) {
				meta.qualifyAnswers = {
					...(meta.qualifyAnswers ?? {}),
					lanceEmbutido: answer,
					lanceEmbutidoPercent: answer ? LANCE_EMBUTIDO_DEFAULT_PERCENT : undefined,
				};
				await persistMeta(conversationId, meta);
			}
		}

		// FIX-260: "Quero ver sim!" (texto) no gate simulator-offer pulava o dial
		// — simulatorOfferDispatched já marcado na EMISSÃO faz nextGate() avançar
		// direto pro "decision" na resposta seguinte, sem nunca chamar o directive
		// do dial (só o clique, route.ts, disparava present_contemplation_dial).
		// Mesma janela do clique "Quero ver!": já mostrado, ainda sem decision,
		// ainda sem resposta registrada (idempotência via simulatorOfferAnswered).
		if (
			meta.simulatorOfferDispatched === true &&
			meta.decisionDispatched !== true &&
			meta.simulatorOfferAnswered !== true &&
			detectYesNoText(userText, analyzedIntent) === true
		) {
			meta.simulatorOfferAnswered = true;
			await persistMeta(conversationId, meta);
			await saveMessage(conversationId, "user", userText, channel);
			// FIX-241 (âncora de dinheiro): mesmo cálculo do clique — quando o
			// usuário declarou poupança mensal, narra o mês em que o BOLSO
			// alcança o lance.
			const moneyAnchor =
				computeMoneyAnchor(meta.recommendedOffer, {
					monthlySavings: meta.qualifyAnswers?.monthlySavings,
					lanceValue: meta.qualifyAnswers?.lanceValue,
					fgtsValue: meta.qualifyAnswers?.fgtsValue,
				}) ?? undefined;
			yield* runTurn({
				channel,
				conversationId,
				userText: buildSimulatorDialDirective({
					administradora: meta.recommendedAdministradora,
					moneyAnchor,
				}),
				isUserTurn: false,
				contactName: knownName,
				skipAnalyzer: true,
				skipLeadCollection: true,
			});
			return;
		}

		const decision = decideRouting(userText, meta, analysis);
		if (decision.kind === "transition") {
			if (decision.usedFallback) {
				console.log(
					`[orchestrator] Analyzer missed category — regex fallback detected "${decision.toCategory}" in: "${userText.slice(0, 80)}"`,
				);
			}
			await saveMessage(conversationId, "user", userText, channel);
			yield* runTransitionAndContinue({
				conversationId,
				fromPersona: currentPersona,
				toCategory: decision.toCategory,
				expertiseHint: analysis.detectedSubTopic,
				channel,
				contactName: knownName,
			});
			return;
		}

		const intraCategoryTarget = await resolveIntraCategorySwitch(meta, analysis);
		if (intraCategoryTarget) {
			console.log(
				`[orchestrator] Intra-category swap: ${meta.currentPersona} → expertise="${analysis.detectedSubTopic}" in category=${intraCategoryTarget}`,
			);
			await saveMessage(conversationId, "user", userText, channel);
			yield* runTransitionAndContinue({
				conversationId,
				fromPersona: currentPersona,
				toCategory: intraCategoryTarget,
				expertiseHint: analysis.detectedSubTopic,
				channel,
				contactName: knownName,
			});
			return;
		}

		// FIX-239 (Fable r1, D3.4, gap P1 #6b): re-pedido de avanço em TEXTO
		// LIVRE depois que o card de decisão já foi mostrado uma vez ("quero
		// seguir com esse plano") batia no guard isDecisionDup
		// (artifact-guard.ts) — o LLM anunciava "deixa eu confirmar com você:"
		// e o present_decision_prompt duplicado era suprimido, virando turno
		// morto (promessa sem entrega, família FIX-206/207). Roteamento
		// DETERMINÍSTICO: ready_to_proceed pós-decisão avança direto pro passo
		// 5 — mesma directive do clique "Tenho interesse" (route.ts).
		if (
			meta.decisionDispatched === true &&
			meta.contractClosed !== true &&
			analysis.userIntent === "ready_to_proceed"
		) {
			await saveMessage(conversationId, "user", userText, channel);
			yield* runTurn({
				channel,
				conversationId,
				userText: buildAdvanceToContractDirective({
					administradora: meta.recommendedAdministradora,
				}),
				isUserTurn: false,
				contactName: knownName,
				skipAnalyzer: true,
				skipLeadCollection: true,
			});
			return;
		}
	}

	if (isUserTurn) {
		await saveMessage(conversationId, "user", userText, channel);
	}

	// FIX-258 (P1, veredito Fable r4 §P1 #1 — FIX-252 "NÃO", rota nome→grupo
	// ausente ANTES da tool-call): resolve a menção textual do usuário (nome de
	// administradora ou valor aproximado, ex. "quero a ITAÚ"/"a de 92 mil")
	// CONTRA os grupos JÁ EXIBIDOS em tela — antes de montar o prompt/deixar a
	// LLM decidir sozinha. resolveOfferMentionForConversation nunca inventa
	// (null sem match claro ou ambíguo); a diretiva só entra no systemContext
	// quando há match real. Rota determinística, Lei 1/4.
	const mentionedOffer = isUserTurn
		? await resolveOfferMentionForConversation(conversationId, userText)
		: null;

	// FIX-263 (P1, veredito Fable r5, seam PARCIAL): confirmação TEXTUAL de uma
	// oferta JÁ EXIBIDA nunca re-ancorava `recommendedOffer`/`recommendedAdministradora`
	// — só o clique (choose_offer, route.ts) fazia isso. Resultado ao vivo: o
	// usuário confirmou ITAÚ 92.902 por texto 3×, mas o hero/aviso de troca de
	// marca no fechamento seguiu nomeando a ÂNCORA (snapshot stale) — porque
	// NADA persistia a resolução textual quando o turno não produzia um novo
	// simulation_result (FIX-252 só re-ancora nesse caso, dentro do runner).
	// Mesma re-ancoragem determinística do clique, aqui pro caminho de TEXTO —
	// só pós-reveal (há algo mostrado pra re-ancorar) e só com os 3 números da
	// oferta mencionada completos (nunca ancora parcial, Lei 3).
	if (
		isUserTurn &&
		mentionedOffer &&
		meta.revealCompleted === true &&
		typeof mentionedOffer.creditValue === "number" &&
		typeof mentionedOffer.termMonths === "number" &&
		typeof mentionedOffer.monthlyPayment === "number" &&
		mentionedOffer.groupId !== meta.recommendedOffer?.groupId
	) {
		meta.recommendedAdministradora =
			mentionedOffer.administradora ?? meta.recommendedAdministradora;
		meta.recommendedOffer = {
			...meta.recommendedOffer,
			administradora: mentionedOffer.administradora ?? meta.recommendedOffer?.administradora,
			creditValue: mentionedOffer.creditValue,
			termMonths: mentionedOffer.termMonths,
			monthlyPayment: mentionedOffer.monthlyPayment,
			groupId: mentionedOffer.groupId,
		};
		await persistMeta(conversationId, meta);
		console.log(
			`[ancora-fechamento] FIX-263: confirmação textual re-ancorou recommendedOffer pra ${meta.recommendedAdministradora} (groupId=${mentionedOffer.groupId}, conv=${conversationId})`,
		);
	}

	// FIX-293 (rodada r9 onda 4, veredito r9pos3 §3 P2 UX, probe-i2-justificativa
	// turnos 8-9): a MESMA pergunta de exatidão/critério do FIX-282 (linha
	// ~570 abaixo) acontecia de LONGE mais vezes FORA do caminho de
	// tool-error/cap — usuário pergunta em texto livre normal, sem nenhum
	// guard interceptando o turno. Checar isExactnessOrCriteriaQuestion só
	// DEPOIS de `runAgentTurn` (como o FIX-282 faz) não resolveria esse caso:
	// o `result` ali vem de `yield* runAgentTurn(...)`, que STREAMA cada
	// text-delta pro consumidor em tempo real — na hora que `result` existe,
	// o texto livre do modelo (o "cheio/pausado" fabricado do veredito) já
	// chegou ao usuário. O short-circuit determinístico por isso tem que
	// acontecer ANTES de invocar a LLM (Lei 4: invariante crítico em código,
	// não filtro depois) — nunca chama `runAgentTurn` pra esse padrão de
	// pergunta. Mesma resposta do FIX-282 (buildToolErrorRecoveryExactnessFallback),
	// mesmo escopo estreito de isExactnessOrCriteriaQuestion (falso-negativo
	// preferível a falso-positivo) — só dispara com reveal já completo e
	// `recommendedOffer` conhecido (antes disso não há o que justificar).
	if (
		isUserTurn &&
		meta.revealCompleted === true &&
		isExactnessOrCriteriaQuestion(userText) &&
		typeof meta.recommendedOffer?.creditValue === "number"
	) {
		const fallback = buildToolErrorRecoveryExactnessFallback({
			name: knownName,
			offer: meta.recommendedOffer,
			rawCreditValue: meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax,
		});
		yield { type: "text-delta", text: fallback };
		await saveMessage(conversationId, "assistant", fallback, channel, currentPersona);
		yield { type: "finish", reason: "exactness-criteria-answered" };
		return;
	}

	const history = await loadConversationHistory(conversationId);
	const systemContext = buildSystemContext({
		knownName,
		newlyExtractedExperience,
		meta,
		mentionedOffer,
	});

	// ─── Memory layer (Letta sidecar) ───────────────────────────────────────
	// Resolve identity, carrega contexto persistente e prepend ao prompt.
	// Em qualquer erro/timeout/circuit-open, retorna null silenciosamente —
	// orquestrador segue sem memória. Ver ADR 2026-05-16.
	const userTurnCount = history.filter((m) => m.role === "user").length;
	const identity = resolveIdentityForTurn({
		channel,
		conv,
		userKey: userKey ?? undefined,
		userTurnCount,
	});
	const memoryContext = await loadMemoryContextForTurn({ identity, userText });
	const memorySystemMessage = memorySystemMessageFromContext(memoryContext);

	// Debug hook (R9 do QA plan): quando AJA_DEBUG_MEMORY=1, persiste o hint
	// injetado no meta pra E2E inspecionar via SQL. Nunca em produção.
	if (process.env.AJA_DEBUG_MEMORY === "1") {
		const debugMeta = await reloadMeta(conversationId);
		await persistMeta(conversationId, {
			...debugMeta,
			lettaDebugHint: memorySystemMessage?.content ?? null,
		});
	}

	// FIX-77: os blocos de system dinâmicos (systemContext + a memória Letta) NÃO
	// vão mais em `messages` — system dentro de `messages` dispara o warning de
	// prompt-injection da AI SDK a cada turno. systemContext vai pro builder via
	// `instructions` (systemContextBlocks → runner → resolveAgent). A memória já
	// chega ao prompt via memoryContext → buildAgent (memoryText): prependá-la
	// aqui ALÉM disso duplicava a Letta no mesmo request. Em turno de sistema
	// (directive) só o knownName entra — espelha o comportamento anterior, sem o
	// bloco de experience/doubts (que só faz sentido respondendo o usuário).
	const systemContextBlocks: string[] = isUserTurn
		? systemContext.map((m) => m.content)
		: knownName
			? [`Nome do usuario: "${knownName}"`]
			: [];
	const messagesForAgent: ChatMessage[] = isUserTurn
		? [...history]
		: [...history, { role: "user", content: userText }];

	// NÍVEL 1 do fix BUG-SHORT-GREETING-AFTER-NAME: quando o turn atual é
	// "user respondeu nome" (turno anterior do agent perguntou nome E user
	// mandou ≤4 palavras só de letras E contactName ainda NULL), forçar
	// `save_contact_name` via toolChoice. Detecção isolada em
	// `detect-name-turn.ts` (unit test puro).
	//
	// Background: Anthropic Claude Sonnet 4-6 escapava da regra dura no
	// prompt em variantes curtas ("Prazer, Paulo!" sem tool). Forçar via
	// toolChoice é defesa em código — não depende de obediência do modelo.
	let forceToolChoice: { type: "tool"; toolName: "save_contact_name" } | undefined;
	if (isUserTurn && currentPersona !== "concierge" && !skipLeadCollection) {
		// Pega o último turn do assistant no histórico salvo (já inclui o
		// turn anterior ao user-text atual).
		const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
		const previousAssistantText = lastAssistant?.content;
		const shouldForce = isLikelyNameResponse({
			previousAssistantText,
			currentUserText: userText,
			conversationContactName: knownName,
		});
		if (shouldForce) {
			forceToolChoice = { type: "tool", toolName: "save_contact_name" };
			console.log(
				`[orchestrator] force save_contact_name via toolChoice (conv=${conversationId}, user="${userText.slice(0, 40)}")`,
			);
		}
	}

	const result = yield* runAgentTurn({
		conversationId,
		channel,
		currentPersona,
		meta,
		messages: messagesForAgent,
		isUserTurn,
		userIntent: analyzedIntent,
		memoryContext,
		forceToolChoice,
		systemContextBlocks,
	});

	// FIX-186 (Kairo 2026-07-01): a descoberta na Bevi falhou neste turno (após
	// retry silencioso). O runner suprimiu a narração crua do modelo; AQUI o
	// orchestrator materializa a mensagem amigável FIXA + convite a ação e fecha
	// o turno — determinístico (Lei 1), no padrão do yieldTransitionAbort. Nunca
	// deixa o LLM decidir o que falar no erro; nunca emite proposta (FIX-187).
	if (result.discoveryFailedThisTurn) {
		const fallback = buildDiscoveryFailedFallback({ name: knownName });
		yield { type: "text-delta", text: fallback };
		await saveMessage(conversationId, "assistant", fallback, channel, currentPersona);
		yield { type: "finish", reason: "discovery-failed" };
		return;
	}

	// FIX-262 (P1, veredito Fable r5, causa-raiz N1/N2): o runner detectou uma
	// tool chamada fora do toolset da fase (tool-error) ou o turno estourou o
	// cap duro de tool-calls — nos dois casos a narração do modelo foi
	// suprimida (tenderia a negar uma oferta real). O orchestrator materializa
	// o fallback FIXO que reafirma as opções já mostradas, nunca as nega
	// (Lei 1: código dispõe, mesmo padrão do discoveryFailedThisTurn acima).
	//
	// FIX-266 (P1, veredito Fable r6, "o que segura o 7" #1): o fallback
	// enlatado pedia "me diz o nome" mesmo quando `mentionedOffer` (resolvido
	// acima, ANTES do turno, contra os grupos JÁ EXIBIDOS) já apontava pra
	// exatamente a oferta que o usuário citou — contenção sem resolução.
	// Quando resolve, reafirma os dados dela em vez de pedir de novo. Quando
	// não resolve e o ÚLTIMO turno do assistant já foi esse mesmo fallback
	// genérico, troca pra variante que lista as opções concretas — nunca
	// repete a frase idêntica 2× seguidas.
	if (result.toolErrorThisTurn || result.toolCallCapExceededThisTurn) {
		// FIX-286 (P0, veredito Sonnet r9pos2 §3): a família FIX-262/266/282
		// abaixo foi desenhada e testada só pro cenário de REPETIÇÃO pós-reveal
		// (`meta.revealCompleted === true` — "as opções que já apareceram
		// continuam valendo" É verdade nesse caso). Quando o guard interrompe a
		// PRIMEIRA apresentação do turno (`!meta.revealCompleted`), essa frase
		// é uma MENTIRA — nada tinha aparecido ainda. `result.revealGroupsById`
		// (exposto pelo runner mesmo no early-return do guard) diz se
		// `search_groups`/`recommend_groups` já retornaram grupos reais neste
		// turno: com ranking real (`recommend_groups` rodou, `pickBestRankedGroup`
		// acha o de maior score — a mesma escolha server-computed que
		// `present_recommendation_card` teria mostrado), materializa o
		// `recommendation_card` (Via A, reaproveita `coerceRecommendationPayload`,
		// mesma coerção do caminho feliz); sem ranking suficiente (ex.: só
		// `search_groups` rodou), honesto D10 de retry (Via B) — nunca "já
		// apareceram".
		if (!meta.revealCompleted) {
			const bestGroup = result.revealGroupsById
				? pickBestRankedGroup(result.revealGroupsById)
				: null;
			if (bestGroup) {
				const requestedCreditValue =
					meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax;
				const logos = await loadAdministradoraLogoMap().catch(() => new Map<string, string>());
				const payload = buildRecommendationCardFromRevealGroup(
					bestGroup,
					logos,
					requestedCreditValue,
				);
				const intro = buildFirstRevealCardIntro({ name: knownName });
				yield { type: "text-delta", text: intro };
				await saveMessage(conversationId, "assistant", intro, channel, currentPersona);
				yield* emitServerCard({
					conversationId,
					channel,
					persona: currentPersona,
					artifactType: "recommendation_card",
					payload,
				});
				const refreshed = await reloadMeta(conversationId);
				if (!refreshed.revealCompleted) {
					const offerSnapshot = offerSnapshotFromArtifact(payload);
					await persistMeta(conversationId, {
						...refreshed,
						revealCompleted: true,
						searchDispatched: true,
						recommendedAdministradora:
							typeof payload.administradora === "string"
								? payload.administradora
								: refreshed.recommendedAdministradora,
						...(typeof refreshed.qualifyAnswers?.creditMax === "number"
							? { discoveredCreditTarget: refreshed.qualifyAnswers.creditMax }
							: {}),
						...(offerSnapshot ? { recommendedOffer: offerSnapshot } : {}),
					});
				}
				yield { type: "finish", reason: "reveal-recovered" };
				return;
			}
			const recoveryFallback = buildFirstRevealRecoveryFallback({ name: knownName });
			yield { type: "text-delta", text: recoveryFallback };
			await saveMessage(conversationId, "assistant", recoveryFallback, channel, currentPersona);
			yield {
				type: "finish",
				reason: result.toolCallCapExceededThisTurn
					? "tool-call-cap-exceeded"
					: "tool-error-recovered",
			};
			return;
		}

		let fallback: string;
		// FIX-282 (P1, veredito Sonnet r9pos, G-B/I2): a pergunta do usuário
		// sobre EXATIDÃO/CRITÉRIO da oferta já mostrada ("é de 120 mil como
		// pedi? por que essa e não outra?") tem resposta factual pronta em
		// `meta.recommendedOffer` — checa ANTES do fallback genérico/resolvido
		// (que são cegos ao conteúdo da pergunta) pra nunca deixar essa
		// pergunta específica sem resposta honesta. `isUserTurn` mesma guarda
		// de `mentionedOffer` — directive interno nunca aciona isto.
		if (
			isUserTurn &&
			isExactnessOrCriteriaQuestion(userText) &&
			typeof meta.recommendedOffer?.creditValue === "number"
		) {
			fallback = buildToolErrorRecoveryExactnessFallback({
				name: knownName,
				offer: meta.recommendedOffer,
				rawCreditValue: meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax,
			});
		} else if (mentionedOffer) {
			fallback = buildToolErrorRecoveryResolvedFallback({ name: knownName, offer: mentionedOffer });
		} else {
			const generic = buildToolErrorRecoveryFallback({ name: knownName });
			const lastAssistantText =
				[...history].reverse().find((m) => m.role === "assistant")?.content ?? null;
			fallback =
				lastAssistantText === generic
					? buildToolErrorRecoveryFallbackRepeat({
							name: knownName,
							offers: await listShownOffersForConversation(conversationId),
						})
					: generic;
		}
		yield { type: "text-delta", text: fallback };
		await saveMessage(conversationId, "assistant", fallback, channel, currentPersona);
		yield {
			type: "finish",
			reason: result.toolCallCapExceededThisTurn
				? "tool-call-cap-exceeded"
				: "tool-error-recovered",
		};
		return;
	}

	// Fire-and-forget — extrai fatos do turno e persiste no Letta.
	// Não awaitamos: turno responde mais rápido; se store falhar, próximo turno
	// re-extrai do meta corrente.
	void storeMemoriesForTurn({
		identity,
		artifacts: result.artifacts,
		meta,
		channel,
		userText,
		conversationId,
	});

	if (result.handoffSignaled) {
		yield { type: "finish", reason: "handoff" };
		return;
	}

	if (result.isConcierge) {
		yield { type: "welcome-categories" };
	}

	if (result.nextGateToFire === "search") {
		const refreshed = await reloadMeta(conversationId);
		// FIX-76: na troca de faixa (revealValueTargetChanged) a busca é uma
		// re-descoberta LEGÍTIMA da faixa nova — não pode ser barrada pelo guard de
		// idempotência do reveal original. Sem essa exceção, a retomada com
		// valor-alvo novo abortava em "search-already-dispatched" e o modelo
		// preenchia o vácuo com alucinação de "instabilidade" + valor stale.
		if (refreshed.searchDispatched && !revealValueTargetChanged(refreshed)) {
			yield { type: "finish", reason: "search-already-dispatched" };
			return;
		}
		const category = refreshed.currentCategory;
		if (!category) {
			yield { type: "finish", reason: "search-no-category" };
			return;
		}
		const directive = buildSearchSummaryDirective({ category, meta: refreshed });
		yield* runTurn({
			channel,
			conversationId,
			userText: directive,
			isUserTurn: false,
			contactName: knownName,
			skipAnalyzer: true,
			skipLeadCollection: true,
		});
		// FIX-280 (loop r9, baseline Sonnet 3/10, G4): opt-in de WhatsApp — mesma
		// receita do FIX-246/253 (scarcity/decision_prompt), emissão SERVER-SIDE
		// determinística logo após o reveal, no ÚNICO ponto que dispara os cards
		// do passo 3+4 (search summary directive acima). Nunca mais depende de o
		// LLM "decidir" chamar a tool — mesmo estado, mesmo resultado sempre,
		// diferente do bug original (mario-sem-lance chamava, madalena não, no
		// mesmo ponto do funil).
		const postReveal = await reloadMeta(conversationId);
		// FIX-291 (b): `searchDispatched` NÃO é mais marcado preemptivamente ANTES
		// do runTurn acima — o runner (runner.ts) já grava searchDispatched=true
		// JUNTO com revealCompleted, só quando artifacts REAIS aparecem. Marcar
		// antes travava uma busca que falhasse (teto agregado do FIX-291a
		// estourado, erro duro etc.) em searchDispatched=true PRA SEMPRE: o guard
		// "search-already-dispatched" (acima) nunca mais deixava retentar a busca
		// num turno seguinte, mesmo sem jamais ter mostrado dado real.
		if (!postReveal.revealCompleted) {
			console.log(
				`[discovery-degraded] guard: busca falhou/degradou — searchDispatched NAO marcado, retry liberado num turno seguinte (conv=${conversationId})`,
			);
			return;
		}
		if (shouldEmitWhatsappOptin(postReveal)) {
			await persistMeta(conversationId, { ...postReveal, whatsappOptinShown: true });
			const stage = postReveal.contactPhone ? "confirm" : "open";
			yield* runTurn({
				channel,
				conversationId,
				userText: buildWhatsappOptinDirective(stage),
				isUserTurn: false,
				contactName: knownName,
				skipAnalyzer: true,
				skipLeadCollection: true,
			});
			yield* emitServerCard({
				conversationId,
				channel,
				persona: currentPersona,
				artifactType: "whatsapp_optin",
				payload: buildWhatsappOptinCard(postReveal).payload,
			});
		}
		return;
	}

	// BUG-REVEAL-LOOP: pós-reveal, quando o usuário sinaliza avanço, o sistema
	// dirige o card de decisão ("Esse plano faz sentido?") UMA vez — fim do passo
	// 4 da jornada → abre o passo 5 (contratar). Espelha o search reveal acima:
	// directive determinístico + guard de idempotência (decisionDispatched). Sem
	// isso o agent re-disparava o reveal em loop e nunca cruzava pra plataforma nova.
	if (result.nextGateToFire === "decision") {
		const refreshed = await reloadMeta(conversationId);
		if (refreshed.decisionDispatched) {
			yield { type: "finish", reason: "decision-already-dispatched" };
			return;
		}
		await persistMeta(conversationId, { ...refreshed, decisionDispatched: true });
		// FIX-272 (rodada 8, veredito Fable r7, D4 residual — "outra emenda"): a
		// resposta do turno PRINCIPAL (às vezes termina em pergunta, ex. "...outro
		// prazo?") colava SEM espaço no lead-in do directive seguinte (scarcity OU
		// so_parcela, logo abaixo) — mesma classe do FIX-268, que só fechava a
		// costura MAIS ADIANTE (entre scarcity e decision_prompt). Fecha o balão
		// aberto incondicionalmente ANTES de entrar em QUALQUER ramo deste bloco
		// (no-op se já não houver balão aberto) — cobre os dois caminhos de uma vez.
		yield { type: "text-boundary" };
		// FIX-233 — 3ª saída do gate `lance` ("só a parcela") chega aqui pulando
		// lance-value/lance-embutido/simulator-offer; o card certo é
		// present_two_paths (dois caminhos), não present_decision_prompt.
		const isSoParcela = refreshed.qualifyAnswers?.hasLance === "so_parcela";
		// FIX-237 (Fable r1, D2.1 gap #3): scarcity era ÓRFÃO. Dispara depois da
		// estratégia de lance resolvida, ANTES do card de decisão — só no
		// caminho normal (o so_parcela vai direto pro two_paths, sem o gancho
		// de escassez, spec `04-copy-fluxos.md` Fluxo B).
		// FIX-246 (rodada 3, Fable r2): o directive SÓ escreve o texto — o card
		// é emissão SERVER-SIDE determinística (emitServerCard), nunca depende
		// de tool-call do LLM.
		if (!isSoParcela) {
			yield* runTurn({
				channel,
				conversationId,
				userText: buildScarcityDirective(),
				isUserTurn: false,
				contactName: knownName,
				skipAnalyzer: true,
				skipLeadCollection: true,
			});
			const scarcityCard = buildScarcityCard(refreshed);
			if (scarcityCard) {
				yield* emitServerCard({
					conversationId,
					channel,
					persona: currentPersona,
					artifactType: "scarcity",
					payload: scarcityCard.payload,
				});
			}
			// FIX-268 (rodada 7, veredito Fable r6, residual D4 — "texto
			// picotado no turno de decisão"): quando scarcityCard é null (sem
			// groupId ancorado), NENHUM artifact separa o texto do directive de
			// scarcity do texto do directive de decision logo abaixo — os dois
			// caem no MESMO balão, colados sem espaçamento ("...só pra você
			// saber:Boa! Então deixa eu confirmar com você:"). Força o boundary
			// incondicionalmente (no-op quando o artifact já fechou o balão).
			yield { type: "text-boundary" };
		}
		const directive = isSoParcela ? buildLanceSoParcelaDirective() : buildDecisionPromptDirective();
		yield* runTurn({
			channel,
			conversationId,
			userText: directive,
			isUserTurn: false,
			contactName: knownName,
			skipAnalyzer: true,
			skipLeadCollection: true,
		});
		if (isSoParcela) {
			yield* emitServerCard({
				conversationId,
				channel,
				persona: currentPersona,
				artifactType: "two_paths",
				payload: buildTwoPathsCard(refreshed).payload,
			});
			yield { type: "text-delta", text: TWO_PATHS_FOLLOWUP_TEXT };
			await saveMessage(
				conversationId,
				"assistant",
				TWO_PATHS_FOLLOWUP_TEXT,
				channel,
				currentPersona,
			);
		} else {
			// FIX-253 (rodada 4, veredito Fable FINAL §3): present_decision_prompt
			// saiu do toolset (tool-policy.ts) — o card sai SERVER-SIDE
			// determinístico aqui, no ÚNICO ramo que dirige a decisão. Nunca mais
			// depende do LLM chamar a tool (mesma receita do scarcity acima).
			yield* emitServerCard({
				conversationId,
				channel,
				persona: currentPersona,
				artifactType: "decision_prompt",
				payload: buildDecisionPromptCard(refreshed).payload,
			});
		}
		return;
	}

	if (result.nextGateToFire) {
		// FIX-233 (handoff agente-vendas-consorcio, 2026-07-09): gate `desire` é
		// NÃO bloqueante — marcado na EMISSÃO (mesmo padrão de consentOffered/
		// simulatorOfferDispatched), nunca na resposta. Pulou ou não, o funil
		// nunca mais re-emite este gate.
		if (result.nextGateToFire === "desire") {
			const refreshed = await reloadMeta(conversationId);
			if (!refreshed.desireAsked) {
				await persistMeta(conversationId, { ...refreshed, desireAsked: true });
			}
		}
		// docx passo 4: a oferta do simulador acontece UMA vez (padrão consent).
		// Marcado na emissão. FIX-260: um afirmativo digitado no turno seguinte
		// é interceptado MAIS ACIMA (antes deste bloco rodar) e dispara o
		// directive do dial — só chega aqui negativo/ambíguo, que avança pro
		// decision (comportamento correto, intacto).
		if (result.nextGateToFire === "simulator-offer") {
			const refreshed = await reloadMeta(conversationId);
			if (!refreshed.simulatorOfferDispatched) {
				await persistMeta(conversationId, { ...refreshed, simulatorOfferDispatched: true });
			}
		}
		// FIX-253 (rodada 4, veredito Fable FINAL §2/§3, "pro teto" #2): o
		// caminho de TEXTO LIVRE do gate lance ("não tenho o valor... mas junto 4
		// mil/mês") despachava a pergunta de lance-embutido SEM o card
		// embedded_bid — só o clique (route.ts) emitia. `suppressGateEvent`
		// (FIX-254) protege o caminho de CLIQUE de double-dispatch: quando o
		// chamador (route.ts) já vai emitir o card+pergunta explicitamente
		// depois deste turno de directive, este bloco fica inteiramente calado.
		if (!suppressGateEvent) {
			if (result.nextGateToFire === "lance-embutido") {
				const refreshed = await reloadMeta(conversationId);
				yield* emitServerCard({
					conversationId,
					channel,
					persona: currentPersona,
					artifactType: "embedded_bid",
					payload: buildEmbeddedBidCard(refreshed).payload,
				});
			}
			yield {
				type: "gate",
				gate: result.nextGateToFire,
				prefix: result.prefixForNextGate ?? undefined,
			};
		}
	}

	// FIX-207 (watchdog): marca/limpa o gate pendente do funil. Se este turno de
	// USUÁRIO terminou com um gate real suprimido (nenhum card disparado), grava
	// pendingGateSince — o worker gate-reengage-poll reabre o funil se o usuário
	// sumir (a cauda não-determinística que o FIX-206 não cobre). Qualquer avanço
	// (gate disparado, turno server-authored, estado terminal) LIMPA o marcador.
	// Governança determinística em código (Lei 4), não regra-no-prompt.
	{
		const watchMeta = await reloadMeta(conversationId);
		const pendingGate = pendingGateAfterTurn({
			meta: watchMeta,
			gateFired: Boolean(result.nextGateToFire),
			isUserTurn,
			hasContactName: Boolean(knownName),
		});
		if (pendingGate) {
			// Reseta o relógio de inatividade a cada turno de usuário que deixa o
			// funil pendente (só turno de usuário chega aqui — server retorna null).
			await persistMeta(conversationId, {
				...watchMeta,
				pendingGateSince: simulatorNow().getTime(),
				pendingGate,
			});
		} else if (watchMeta.pendingGateSince !== undefined) {
			const cleared = { ...watchMeta };
			delete cleared.pendingGateSince;
			delete cleared.pendingGate;
			await persistMeta(conversationId, cleared);
		}
	}

	yield { type: "finish", reason: "ok" };
}

async function* runTransitionAndContinue(args: {
	conversationId: string;
	fromPersona: Persona;
	toCategory: Parameters<typeof planTransition>[0]["toCategory"];
	expertiseHint?: string | null;
	channel: TurnInput["channel"];
	contactName: string | null;
}): AsyncGenerator<TurnEvent> {
	const { conversationId, fromPersona, toCategory, expertiseHint, channel, contactName } = args;
	const plan = await planTransition({ conversationId, fromPersona, toCategory, expertiseHint });
	if (plan.kind === "abort") {
		yield* yieldTransitionAbort(plan.apologyText);
		return;
	}
	yield {
		type: "transition",
		fromPersona: plan.fromPersona,
		toPersona: plan.toPersona,
		toPersonaName: plan.toPersonaName,
		toCategory: plan.toCategory,
		bridgeText: plan.bridgeText,
	};
	yield* runTurn({
		channel,
		conversationId,
		userText: plan.directive,
		isUserTurn: false,
		contactName,
		skipAnalyzer: true,
		skipLeadCollection: true,
	});
}

export async function runTurnFromText(args: {
	channel: TurnInput["channel"];
	from?: string;
	conversationId?: string;
	userText: string;
	isUserTurn: boolean;
	contactName?: string | null;
	skipAnalyzer?: boolean;
	skipLeadCollection?: boolean;
}): Promise<TurnInput> {
	const { from, conversationId, channel, ...rest } = args;
	if (conversationId) {
		return { ...rest, conversationId, channel };
	}
	if (channel === "whatsapp" && from) {
		const { id } = await getOrCreateConversation(from);
		return { ...rest, conversationId: id, channel };
	}
	throw new Error("[orchestrator] either conversationId or (channel=whatsapp + from) required");
}

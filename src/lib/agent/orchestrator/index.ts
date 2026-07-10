import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { pendingGateAfterTurn } from "@/lib/agent/gate-reengage";
import type { ConversationMetadata, Persona } from "@/lib/agent/personas";
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
import { isLikelyNameResponse } from "./detect-name-turn";
import {
	buildAdvanceToContractDirective,
	buildDecisionPromptDirective,
	buildDiscoveryFailedFallback,
	buildLanceSoParcelaDirective,
	buildScarcityDirective,
	buildSearchSummaryDirective,
} from "./directives";
import { runLeadCollectionTurn } from "./lead-collection";
import { decideRouting, resolveIntraCategorySwitch } from "./routing";
import { runAgentTurn } from "./runner";
import { buildSystemContext } from "./system-context";
import { revealValueTargetChanged } from "./tool-policy";
import { planTransition, yieldTransitionAbort } from "./transition";
import type { ChatMessage, TurnEvent, TurnInput } from "./types";

export type { TurnEvent, TurnInput } from "./types";

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

	const history = await loadConversationHistory(conversationId);
	const systemContext = buildSystemContext({
		knownName,
		newlyExtractedExperience,
		meta,
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
		await persistMeta(conversationId, { ...refreshed, searchDispatched: true });
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
		// FIX-233 — 3ª saída do gate `lance` ("só a parcela") chega aqui pulando
		// lance-value/lance-embutido/simulator-offer; o card certo é
		// present_two_paths (dois caminhos), não present_decision_prompt.
		const isSoParcela = refreshed.qualifyAnswers?.hasLance === "so_parcela";
		// FIX-237 (Fable r1, D2.1 gap #3): scarcity era ÓRFÃO. Dispara depois da
		// estratégia de lance resolvida, ANTES do card de decisão — só no
		// caminho normal (o so_parcela vai direto pro two_paths, sem o gancho
		// de escassez, spec `04-copy-fluxos.md` Fluxo B).
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
		}
		const directive = isSoParcela
			? buildLanceSoParcelaDirective()
			: buildDecisionPromptDirective({
					administradora: refreshed.recommendedAdministradora,
				});
		yield* runTurn({
			channel,
			conversationId,
			userText: directive,
			isUserTurn: false,
			contactName: knownName,
			skipAnalyzer: true,
			skipLeadCollection: true,
		});
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
		if (result.nextGateToFire === "consent") {
			const refreshed = await reloadMeta(conversationId);
			if (!refreshed.consentOffered) {
				await persistMeta(conversationId, { ...refreshed, consentOffered: true });
			}
		}
		// docx passo 4: a oferta do simulador acontece UMA vez (padrão consent).
		// Marcado na emissão — afirmativo digitado depois avança pro decision.
		if (result.nextGateToFire === "simulator-offer") {
			const refreshed = await reloadMeta(conversationId);
			if (!refreshed.simulatorOfferDispatched) {
				await persistMeta(conversationId, { ...refreshed, simulatorOfferDispatched: true });
			}
		}
		yield {
			type: "gate",
			gate: result.nextGateToFire,
			prefix: result.prefixForNextGate ?? undefined,
		};
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

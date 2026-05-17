import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import type { ConversationMetadata, Persona } from "@/lib/agent/personas";
import { loadConversationHistory, saveMessage } from "@/lib/conversation/messages";
import { metaOf, persistMeta, reloadMeta } from "@/lib/conversation/meta";
import {
	loadMemoryContextForTurn,
	memorySystemMessageFromContext,
	resolveIdentityForTurn,
	storeMemoriesForTurn,
} from "@/lib/memory/orchestrator-bridge";
import { getOrCreateConversation } from "@/lib/whatsapp/session";
import { analyzeAndMerge } from "./analyze";
import { buildSearchSummaryDirective } from "./directives";
import { runLeadCollectionTurn } from "./lead-collection";
import { decideRouting, resolveIntraCategorySwitch } from "./routing";
import { runAgentTurn } from "./runner";
import { buildSystemContext } from "./system-context";
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
				.set({ contactName, updatedAt: new Date() })
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

	const memoryPrefix: ChatMessage[] = memorySystemMessage ? [memorySystemMessage] : [];

	// Debug hook (R9 do QA plan): quando AJA_DEBUG_MEMORY=1, persiste o hint
	// injetado no meta pra E2E inspecionar via SQL. Nunca em produção.
	if (process.env.AJA_DEBUG_MEMORY === "1") {
		const debugMeta = await reloadMeta(conversationId);
		await persistMeta(conversationId, {
			...debugMeta,
			lettaDebugHint: memorySystemMessage?.content ?? null,
		});
	}
	const messagesForAgent: ChatMessage[] = isUserTurn
		? [...memoryPrefix, ...systemContext, ...history]
		: [
				...memoryPrefix,
				...(knownName
					? [{ role: "system" as const, content: `Nome do usuario: "${knownName}"` }]
					: []),
				...history,
				{ role: "user", content: userText },
			];

	const result = yield* runAgentTurn({
		conversationId,
		channel,
		currentPersona,
		meta,
		messages: messagesForAgent,
		isUserTurn,
		userIntent: analyzedIntent,
	});

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
		if (refreshed.searchDispatched) {
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

	if (result.nextGateToFire) {
		if (result.nextGateToFire === "consent") {
			const refreshed = await reloadMeta(conversationId);
			if (!refreshed.consentOffered) {
				await persistMeta(conversationId, { ...refreshed, consentOffered: true });
			}
		}
		yield {
			type: "gate",
			gate: result.nextGateToFire,
			prefix: result.prefixForNextGate ?? undefined,
		};
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

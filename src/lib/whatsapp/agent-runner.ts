import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { resolveAgent } from "@/lib/agent/agents";
import type { ConversationMetadata, Persona } from "@/lib/agent/personas";
import { type Gate, nextGate } from "@/lib/agent/qualify-state";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { sendInteractiveMessage, sendTextMessage } from "./api";
import { buildSearchSummaryDirective } from "./directives";
import {
	artifactToWhatsApp,
	creditRangeQuestionToWhatsApp,
	experienceQuestionToWhatsApp,
	formatTextForWhatsApp,
	handoffConfirmationToWhatsApp,
	lanceQuestionToWhatsApp,
	qualifyConsentToWhatsApp,
	splitMessage,
	timeframeQuestionToWhatsApp,
	welcomeButtonsToWhatsApp,
} from "./formatter";
import { metaOf, persistMeta, reloadMeta } from "./meta-helpers";
import { loadConversationHistory, saveMessage } from "./session";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const typingDelay = (chars: number) => Math.min(1500, 200 + chars * 6);
const ARTIFACT_PAUSE_MS = 500;
// WhatsApp interactive (list/buttons) messages render slower than plain text,
// so a text sent ~800ms after a list can arrive on screen FIRST. Wait longer
// before queuing anything after an interactive send to preserve visual order.
const POST_INTERACTIVE_PAUSE_MS = 1800;

// ---- Gates (state-machine driver) ----

export async function fireGate(
	from: string,
	conversationId: string,
	gate: Gate,
	meta: ConversationMetadata,
	prefix?: string,
): Promise<void> {
	switch (gate) {
		case "experience": {
			const r = experienceQuestionToWhatsApp(prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "consent": {
			// Mark as offered the first time we fire — nextGate uses this to avoid
			// re-prompting after each free-text doubt the user asks.
			if (!meta.consentOffered) {
				await persistMeta(conversationId, { ...meta, consentOffered: true });
			}
			const r = qualifyConsentToWhatsApp(prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "credit": {
			const category = meta.currentCategory;
			if (!category) return;
			const r = creditRangeQuestionToWhatsApp(category, prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "timeframe": {
			const category = meta.currentCategory;
			if (!category) return;
			const r = timeframeQuestionToWhatsApp(category, prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "lance": {
			const r = lanceQuestionToWhatsApp(prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "doubts-wait":
		case "search":
			return;
	}
}

export async function fireSummaryAndSearch(
	from: string,
	conversationId: string,
	meta: ConversationMetadata,
): Promise<void> {
	if (meta.searchDispatched) return;
	const category = meta.currentCategory;
	if (!category) return;

	// Set BEFORE the work so concurrent re-entry sees the flag and bails out.
	await persistMeta(conversationId, { ...meta, searchDispatched: true });

	const directive = buildSearchSummaryDirective({ category, meta });
	await runAgentDirective(from, conversationId, directive);
}

// ---- Agent turn ----

export type UserIntent =
	| "ready_to_proceed"
	| "asking_question"
	| "providing_info"
	| "expressing_doubt"
	| "off_topic"
	| "neutral";

/**
 * Decides whether to dispatch the next qualify gate (button) at the end of a turn.
 * The state machine still tracks WHICH gate is next; this function only decides
 * if NOW is the right moment to interrupt the conversation with structured UI.
 *
 * Rule of thumb: only fire when the user is collaborating or first contact.
 * Stay silent when they're asking, doubting, or off-topic — let the agent reply
 * conversationally and re-engage on a later turn.
 */
function decideShowGate(args: {
	gate: Gate;
	intent: UserIntent;
	meta: ConversationMetadata;
	isUserTurn: boolean;
}): boolean {
	const { gate, intent, meta, isUserTurn } = args;
	if (gate === "doubts-wait") return false;
	// Server-authored turns (button click, transition) are always followed by a gate
	// — that's the whole point of the directive flow.
	if (!isUserTurn) return true;

	// "search" dispara busca + cards — a acao mais invasiva do sistema.
	// Exige sinal EXPLICITO do usuario. Nunca dispara em neutral/asking/doubt/off-topic.
	if (gate === "search") {
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

// `isUserTurn` distinguishes a real user reply from a server-authored directive
// (button click etc.) — only user turns clear doubtsAddressed/pendingFollowUp.
export async function executeAgentTurn(args: {
	from: string;
	conversationId: string;
	currentPersona: Persona;
	meta: ConversationMetadata;
	messages: ChatMessage[];
	isUserTurn: boolean;
	userIntent?: UserIntent;
}): Promise<void> {
	const {
		from,
		conversationId,
		currentPersona,
		meta,
		messages,
		isUserTurn,
		userIntent = "neutral",
	} = args;

	let fullResponse = "";
	const artifacts: Array<{ type: string; payload: Record<string, unknown> }> = [];
	let handoffSignal: { triggerId?: string; reason: string } | null = null;

	const isConcierge = !meta.currentCategory;
	const agent = await resolveAgent(currentPersona, meta);
	const result = await agent.stream({ messages });

	for await (const part of result.fullStream) {
		switch (part.type) {
			case "text-delta":
				fullResponse += part.text;
				break;
			case "tool-call": {
				if (part.toolName === "suggest_handoff") {
					const input = part.input as { triggerId?: string; reason?: string };
					handoffSignal = {
						triggerId: input.triggerId,
						reason: input.reason ?? "trigger satisfied",
					};
					break;
				}
				const shortName = part.toolName.replace("present_", "");
				if (PRESENTATION_TOOLS.has(part.toolName)) {
					artifacts.push({
						type: shortName,
						payload: part.input as Record<string, unknown>,
					});
				}
				break;
			}
		}
	}

	// Per AI SDK 6 docs: check finishReason after fullStream consumption.
	// "stop" = natural end, "tool-calls" = stopped to wait for tool result.
	// Anything else (length truncation, content filter, error) means the response
	// may be incomplete — log so we can spot it in production.
	try {
		const finishReason = await result.finishReason;
		if (finishReason !== "stop" && finishReason !== "tool-calls") {
			console.warn(
				`[whatsapp-processor] Agent stream ended with unexpected finishReason="${finishReason}" persona=${currentPersona}`,
			);
		}
	} catch {
		// finishReason is best-effort — not all providers expose it reliably.
	}

	// Handoff is exclusive: when the agent flags a trigger, drop AI text + artifacts
	// and let the system handle the confirmation. Prevents the salad seen in
	// production where Helena verbalized handoff AND advanced gates in the same turn.
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
		const r = handoffConfirmationToWhatsApp();
		if (r.interactive) await sendInteractiveMessage(from, r.interactive);
		return;
	}

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
		}
	} catch {
		// providerMetadata is best-effort.
	}

	// Guard against agent slipping and emitting multiple group_cards.
	const groupCards = artifacts.filter((a) => a.type === "group_card");
	if (groupCards.length >= 2) {
		const nonGroupCards = artifacts.filter((a) => a.type !== "group_card");
		const consolidated = {
			type: "comparison_table",
			payload: { groups: groupCards.map((a) => a.payload) },
		};
		artifacts.length = 0;
		artifacts.push(...nonGroupCards, consolidated);
		console.log(
			`[whatsapp-processor] Guard: consolidated ${groupCards.length} group_cards into comparison_table`,
		);
	}

	if (fullResponse) {
		await saveMessage(conversationId, "assistant", fullResponse);
	}

	const producedArtifact = artifacts.length > 0;
	let nextGateToFire: Gate | null = null;
	let prefixForNextGate: string | null = null;
	if (!isConcierge && !producedArtifact) {
		if (isUserTurn) {
			const userReplied = fullResponse.length > 0;
			if (meta.experiencePrev === "doubts" && !meta.doubtsAddressed && userReplied) {
				meta.doubtsAddressed = true;
				await persistMeta(conversationId, meta);
			}
			if (meta.pendingFollowUp && userReplied) {
				meta.pendingFollowUp = false;
				await persistMeta(conversationId, meta);
			}
		}

		const refreshed = await reloadMeta(conversationId);
		const gate = nextGate(refreshed);
		const shouldShow = decideShowGate({
			gate,
			intent: userIntent,
			meta: refreshed,
			isUserTurn,
		});
		if (shouldShow) {
			nextGateToFire = gate;
			// "search" has its own rich summary template; keep AI text separate.
			if (fullResponse && gate !== "search") {
				prefixForNextGate = formatTextForWhatsApp(fullResponse);
			}
		} else if (gate !== "doubts-wait" && isUserTurn) {
			console.log(`[gate-skip] gate=${gate} intent=${userIntent} — staying conversational`);
		}
	}

	let hasSent = false;
	let lastWasInteractive = false;
	const pauseBeforeNext = () =>
		sleep(lastWasInteractive ? POST_INTERACTIVE_PAUSE_MS : ARTIFACT_PAUSE_MS);

	// Send the agent's text FIRST so the user reads the framing before the
	// interactive card lands. Sending the table/card first dumps options before
	// the agent has finished talking — feels jarring.
	if (fullResponse && !prefixForNextGate) {
		const formatted = formatTextForWhatsApp(fullResponse);
		const chunks = splitMessage(formatted);
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			if (hasSent) {
				const wait = lastWasInteractive ? POST_INTERACTIVE_PAUSE_MS : typingDelay(chunk.length);
				await sleep(wait);
			}
			await sendTextMessage(from, chunk);
			lastWasInteractive = false;
			hasSent = true;
		}
	}

	// Then artifacts (cards / comparison_table / simulation) below the text.
	for (const artifact of artifacts) {
		const waResponse = artifactToWhatsApp(artifact.type, artifact.payload);
		if (!waResponse) continue;
		if (hasSent) await pauseBeforeNext();
		if (waResponse.type === "text" && waResponse.text) {
			await sendTextMessage(from, waResponse.text);
			lastWasInteractive = false;
		} else if (waResponse.type === "interactive" && waResponse.interactive) {
			await sendInteractiveMessage(from, waResponse.interactive);
			lastWasInteractive = true;
		}
		hasSent = true;
	}

	if (isConcierge) {
		if (hasSent) await pauseBeforeNext();
		const buttons = welcomeButtonsToWhatsApp();
		if (buttons.interactive) {
			await sendInteractiveMessage(from, buttons.interactive);
			lastWasInteractive = true;
		}
	}

	if (nextGateToFire) {
		if (hasSent) await pauseBeforeNext();
		const refreshed = await reloadMeta(conversationId);
		if (nextGateToFire === "search") {
			await fireSummaryAndSearch(from, conversationId, refreshed);
		} else {
			await fireGate(
				from,
				conversationId,
				nextGateToFire,
				refreshed,
				prefixForNextGate ?? undefined,
			);
		}
	}

	const expertiseTag = meta.expertiseLevel ? `, expertise=${meta.expertiseLevel}` : "";
	console.log(
		`[whatsapp-processor] Processed: ${from} | persona=${currentPersona}${expertiseTag} | ${artifacts.length} artifacts, ${fullResponse.length} chars`,
	);
}

// Directive goes in the LAST user-role message — Anthropic needs a user turn at
// the end to generate a response. Not persisted, only lives in this turn's input.
export async function runAgentDirective(
	from: string,
	conversationId: string,
	directive: string,
): Promise<void> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	const currentPersona: Persona = meta.currentPersona ?? "concierge";
	const knownName = conv?.contactName ?? null;

	const history = await loadConversationHistory(conversationId);
	const persistentContext: ChatMessage[] = [];
	if (knownName) {
		persistentContext.push({
			role: "system",
			content: `Nome do usuario: "${knownName}"`,
		});
	}

	const directiveTurn: ChatMessage = { role: "user", content: directive };

	await executeAgentTurn({
		from,
		conversationId,
		currentPersona,
		meta,
		messages: [...persistentContext, ...history, directiveTurn],
		isUserTurn: false,
	});
}

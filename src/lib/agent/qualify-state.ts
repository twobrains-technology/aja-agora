import type { ConversationMetadata } from "./personas";

export type Gate =
	| "experience"
	| "doubts-wait"
	| "consent"
	| "credit"
	| "timeframe"
	| "lance"
	| "search";

export type UserIntent =
	| "ready_to_proceed"
	| "asking_question"
	| "providing_info"
	| "expressing_doubt"
	| "off_topic"
	| "neutral";

export function nextGate(
	meta: ConversationMetadata,
	opts?: { hasContactName?: boolean },
): Gate {
	// PF-08: pausa todos os gates até captura conversacional de nome.
	// Sem isso, o gate de experience dispara junto com a pergunta de nome
	// e usuário recebe 2 perguntas simultâneas. doubts-wait = no-op visual.
	if (opts && opts.hasContactName === false) return "doubts-wait";
	if (!meta.experiencePrev) return "experience";
	if (meta.experiencePrev === "doubts" && !meta.doubtsAddressed) return "doubts-wait";
	if (meta.pendingFollowUp) return "doubts-wait";
	if (!meta.qualifyConsented) {
		// Consent is offered exactly once. After that, user must click the buttons
		// or volunteer qualify data (which auto-sets qualifyConsented). Re-firing
		// after every free-text answer felt like spam.
		if (meta.consentOffered) return "doubts-wait";
		return "consent";
	}

	const q = meta.qualifyAnswers ?? {};
	if (q.creditMax === undefined) return "credit";
	if (q.prazoMeses === undefined) return "timeframe";
	if (!q.hasLance) return "lance";

	return "search";
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

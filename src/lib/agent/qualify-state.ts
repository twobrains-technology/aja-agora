import type { ConversationMetadata } from "./personas";

export type Gate =
	| "experience"
	| "doubts-wait"
	| "consent"
	| "credit"
	| "timeframe"
	| "lance"
	| "search";

export function nextGate(meta: ConversationMetadata): Gate {
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

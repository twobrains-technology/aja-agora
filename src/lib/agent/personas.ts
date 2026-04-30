// Persona id (free-form slug, e.g. "concierge", "imovel", "helena-premium").
// Persona row carries role + category that drive routing/agent build.
export type Persona = string;

// The 3 specialist categories the consórcio platform supports.
// Concierge persona has category=null.
export type Category = "imovel" | "auto" | "servicos";

export type ExpertiseLevel = "leigo" | "expert" | "neutro";
export type ExperiencePrev = "first" | "returning" | "doubts";

export type QualifyAnswers = {
	creditMin?: number;
	creditMax?: number;
	/** 0 = imediato (lance forte). */
	prazoMeses?: number;
	hasLance?: "yes" | "maybe" | "no";
};

export type ConversationMetadata = {
	currentPersona?: Persona;
	currentCategory?: Category;
	expertiseLevel?: ExpertiseLevel;
	previousPersona?: Persona;
	personasSeen?: Category[];
	awaitingName?: boolean;
	experiencePrev?: ExperiencePrev;
	qualifyConsented?: boolean;
	/** Set after specialist answers the user's question on the doubts path. */
	doubtsAddressed?: boolean;
	/** Set when user clicks "Entender mais antes"; cleared after their reply lands. */
	pendingFollowUp?: boolean;
	/** Idempotency guard — prevents re-firing the summary + search reveal. */
	searchDispatched?: boolean;
	/** Set when AI calls suggest_handoff. Pauses gates/search until user confirms or declines. */
	handoffSuggested?: boolean;
	handoffReason?: string;
	qualifyAnswers?: QualifyAnswers;
};

export const ROUTABLE_CATEGORIES = [
	"imovel",
	"auto",
	"servicos",
] as const satisfies readonly Category[];

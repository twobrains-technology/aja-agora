// TIPOS DO FUNIL QUE SOBREVIVERAM AO CORTE.
//
// O motor do funil (o funil antigo, o funil antigo, a cascata de perguntas) foi
// apagado em 20/10/2026. Estes dois tipos ficaram porque são VOCABULÁRIO de
// dado já gravado no banco e lido por telas: o `Gate` ainda rotula turnos
// antigos em `metadata`, e o `UserIntent` é o rótulo do analyzer que alimenta
// painel e busca de oferta. Nada aqui decide o que o agente fala.
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
	| "decision"
	| "contract";

export type UserIntent =
	| "ready_to_proceed"
	| "declines"
	| "wants_more_options"
	| "asking_question"
	| "providing_info"
	| "expressing_doubt"
	| "confused"
	| "off_topic"
	| "neutral";

export const USER_INTENT_VALUES = [
	"ready_to_proceed",
	"declines",
	"wants_more_options",
	"asking_question",
	"providing_info",
	"expressing_doubt",
	"confused",
	"off_topic",
	"neutral",
] as const satisfies readonly UserIntent[];

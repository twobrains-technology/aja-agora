// FIX-300 (P6, loop-de-goal r10 — vetor de card alucinado): o `present_topic_picker`
// aceitava `topics: string[]` 100% livre — o Qwen chamou a tool no gate `decision`
// com chips "a"/"b" e um `prompt` inventado, e o Zod validou porque qualquer string
// passa (Lei 2 violada: allowlist, não blocklist). Este catálogo é a fonte ÚNICA das
// dúvidas clicáveis — o schema em `tools/ai-sdk.ts` só aceita um `id` daqui, nunca
// texto livre; o COPY do chip vem SEMPRE do catálogo, nunca do modelo.
//
// Catálogo do mockup (docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html,
// array F1, seção `badges`) + "cartas variam" (dúvida real, narrada no mesmo mockup).

export interface CanonicalTopic {
	id: string;
	label: string;
}

export const CANONICAL_TOPICS: readonly CanonicalTopic[] = [
	{ id: "lance", label: "o que é lance?" },
	{ id: "sorteio", label: "como funciona o sorteio?" },
	{ id: "contemplacao", label: "e quando eu for contemplado(a)?" },
	{ id: "cartas-variam", label: "por que as cartas variam?" },
];

/** Tupla não-vazia dos ids — formato exigido por `z.enum(...)`. */
export const CANONICAL_TOPIC_IDS = CANONICAL_TOPICS.map((t) => t.id) as [string, ...string[]];

const LABEL_BY_ID = new Map(CANONICAL_TOPICS.map((t) => [t.id, t.label]));

export function topicLabelById(id: string): string | null {
	return LABEL_BY_ID.get(id) ?? null;
}

/**
 * Resolve o input bruto do tool-call (`topics` já validado pelo Zod como ids do
 * catálogo) pro payload que o componente `TopicPicker` renderiza — chips com o
 * COPY canônico, nunca o texto que o modelo mandou. Ids que por algum motivo não
 * resolvem (não deveria acontecer pós-Zod, mas defensivo) são descartados.
 */
export function resolveTopicPickerPayload(input: {
	prompt?: string;
	topics: string[];
	includeBackButton?: boolean;
}): { prompt?: string; topics: string[]; includeBackButton: boolean } {
	const topics = input.topics
		.map((id) => topicLabelById(id))
		.filter((label): label is string => label !== null);
	return {
		prompt: input.prompt,
		topics,
		includeBackButton: input.includeBackButton ?? true,
	};
}

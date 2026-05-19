import { z } from "zod";

const isoDateOrNull = z
	.union([z.literal(""), z.string().datetime({ offset: true })])
	.nullable()
	.transform((v) => (v ? v : null));

export const personaCampaignSchema = z
	.object({
		id: z.string().min(1),
		title: z.string().min(1, "Título obrigatório").max(100),
		body: z.string().min(1, "Descrição obrigatória").max(1000),
		startsAt: isoDateOrNull,
		endsAt: isoDateOrNull,
		enabled: z.boolean(),
		mentionPriority: z.enum(["low", "medium", "high"]),
	})
	.refine((c) => !c.startsAt || !c.endsAt || new Date(c.startsAt) <= new Date(c.endsAt), {
		message: "Data inicial deve ser anterior à final",
		path: ["endsAt"],
	});

export const personaHandoffTriggerSchema = z.object({
	id: z.string().min(1),
	condition: z.string().min(1, "Condição obrigatória").max(500),
	enabled: z.boolean(),
});

export const personaForbiddenTopicSchema = z.object({
	id: z.string().min(1),
	topic: z.string().min(1, "Tópico obrigatório").max(200),
	responseWhenAsked: z.string().min(1, "Resposta orientada obrigatória").max(500),
	enabled: z.boolean(),
});

// Enums espelhados de qualify-state.ts e personas.ts — Zod precisa do literal,
// não da `type`. Mantidos sync com as definições canônicas.
const expertiseLevelEnum = z.enum(["leigo", "expert", "neutro"]);
const categoryEnum = z.enum(["imovel", "auto", "moto", "servicos"]);
const channelEnum = z.enum(["web", "whatsapp"]);
const userIntentEnum = z.enum([
	"ready_to_proceed",
	"asking_question",
	"providing_info",
	"expressing_doubt",
	"off_topic",
	"neutral",
]);

export const personaExampleSchema = z.object({
	id: z.string().min(1),
	context: z.string().max(80).optional().nullable(),
	userMessage: z.string().min(3, "Mensagem do cliente obrigatória").max(500),
	assistantResponse: z.string().min(3, "Resposta da persona obrigatória").max(800),

	// Condições opcionais — ausente/vazia = sempre aplica.
	whenExpertise: z.array(expertiseLevelEnum).min(1).optional(),
	whenCategory: z.array(categoryEnum).min(1).optional(),
	whenChannel: channelEnum.optional(),
	whenIntent: z.array(userIntentEnum).min(1).optional(),

	tags: z.array(z.string().min(1).max(40)).max(10).optional(),

	enabled: z.boolean().optional(),
	origin: z.enum(["manual", "diagnosis"]).optional(),
	sourceConversationId: z.string().uuid().nullable().optional(),
});

export const updatePersonaSchema = z
	.object({
		displayName: z.string().min(1).max(50).optional(),
		voiceTone: z.string().min(1).max(2000).optional(),
		isActive: z.boolean().optional(),
		expertise: z.string().max(50).nullable().optional(),
		examples: z.array(personaExampleSchema).max(50).optional(),
		activeCampaigns: z.array(personaCampaignSchema).max(20).optional(),
		handoffTriggers: z.array(personaHandoffTriggerSchema).max(20).optional(),
		forbiddenTopics: z.array(personaForbiddenTopicSchema).max(20).optional(),
		/**
		 * Optimistic concurrency control. Quando presente, o updatePersona
		 * rejeita com ConflictError se a versão atual no DB não bate.
		 * Frontend deve passar a versão lida quando abriu o form pra
		 * detectar lost update entre admins concorrentes.
		 */
		expectedVersion: z.number().int().nonnegative().optional(),
	})
	.refine(
		(data) =>
			Object.keys(data).filter((k) => k !== "expectedVersion").length > 0,
		{ message: "Pelo menos um campo precisa ser informado" },
	);

export const createPersonaSchema = z.object({
	displayName: z.string().min(1, "Nome obrigatório").max(50),
	category: z.enum(["imovel", "auto", "moto", "servicos"], { message: "Selecione uma categoria" }),
	expertise: z
		.string()
		.max(50)
		.optional()
		.nullable()
		.transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
	voiceTone: z.string().min(1, "Tom de voz obrigatório").max(2000),
	examples: z.array(personaExampleSchema).max(50).default([]),
	activeTools: z.array(z.string()).max(20).default([]),
	isActive: z.boolean().default(true),
	activeCampaigns: z.array(personaCampaignSchema).max(20).default([]),
	handoffTriggers: z.array(personaHandoffTriggerSchema).max(20).default([]),
	forbiddenTopics: z.array(personaForbiddenTopicSchema).max(20).default([]),
});

export const previewPersonaSchema = z.object({
	displayName: z.string().min(1).max(50),
	voiceTone: z.string().min(1).max(2000),
	isActive: z.boolean(),
	examples: z.array(personaExampleSchema).max(50).optional(),
	expertise: z.string().max(50).nullable().optional(),
	activeCampaigns: z.array(personaCampaignSchema).max(20),
	handoffTriggers: z.array(personaHandoffTriggerSchema).max(20),
	forbiddenTopics: z.array(personaForbiddenTopicSchema).max(20),
	sampleMessage: z.string().min(1).max(500),
});

// Preview pra rascunho de persona ainda não persistida. Carrega tudo
// que o agente precisa pra rodar (não há baseline no DB).
export const previewPersonaDraftSchema = z.object({
	displayName: z.string().min(1).max(50),
	category: z.enum(["imovel", "auto", "moto", "servicos"]),
	expertise: z
		.string()
		.max(50)
		.optional()
		.nullable()
		.transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
	voiceTone: z.string().min(1).max(2000),
	examples: z.array(personaExampleSchema).max(50).default([]),
	activeCampaigns: z.array(personaCampaignSchema).max(20).default([]),
	handoffTriggers: z.array(personaHandoffTriggerSchema).max(20).default([]),
	forbiddenTopics: z.array(personaForbiddenTopicSchema).max(20).default([]),
	sampleMessage: z.string().min(1).max(500),
});

export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>;
export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;
export type PreviewPersonaInput = z.infer<typeof previewPersonaSchema>;
export type PreviewPersonaDraftInput = z.infer<typeof previewPersonaDraftSchema>;

// Slugify pra gerar id automaticamente a partir do displayName.
// Exemplos: "Helena Premium" -> "helena-premium", "Helena Terrenos!" -> "helena-terrenos".
export function slugifyDisplayName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

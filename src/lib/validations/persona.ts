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

export const updatePersonaSchema = z
	.object({
		displayName: z.string().min(1).max(50).optional(),
		voiceTone: z.string().min(1).max(2000).optional(),
		isActive: z.boolean().optional(),
		expertise: z.string().max(50).nullable().optional(),
		activeCampaigns: z.array(personaCampaignSchema).max(20).optional(),
		handoffTriggers: z.array(personaHandoffTriggerSchema).max(20).optional(),
		forbiddenTopics: z.array(personaForbiddenTopicSchema).max(20).optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "Pelo menos um campo precisa ser informado",
	});

export const createPersonaSchema = z.object({
	displayName: z.string().min(1, "Nome obrigatório").max(50),
	category: z.enum(["imovel", "auto", "servicos"], { message: "Selecione uma categoria" }),
	expertise: z
		.string()
		.max(50)
		.optional()
		.nullable()
		.transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
	voiceTone: z.string().min(1, "Tom de voz obrigatório").max(2000),
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
	activeCampaigns: z.array(personaCampaignSchema).max(20),
	handoffTriggers: z.array(personaHandoffTriggerSchema).max(20),
	forbiddenTopics: z.array(personaForbiddenTopicSchema).max(20),
	sampleMessage: z.string().min(1).max(500),
});

// Preview pra rascunho de persona ainda não persistida. Carrega tudo
// que o agente precisa pra rodar (não há baseline no DB).
export const previewPersonaDraftSchema = z.object({
	displayName: z.string().min(1).max(50),
	category: z.enum(["imovel", "auto", "servicos"]),
	expertise: z
		.string()
		.max(50)
		.optional()
		.nullable()
		.transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
	voiceTone: z.string().min(1).max(2000),
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

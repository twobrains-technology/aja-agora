// Schemas do output do diagnóstico (LLM-as-doctor).
//
// 3 arrays paralelos em vez de discriminated union por `kind`: o Anthropic
// JSON Schema lida mal com unions discriminadas, e arrays paralelos deixam o
// LLM mais focado em cada tipo de correção. Cada sugestão carrega `rationale`
// curto pro admin entender por que aceitar/descartar.

import { z } from "zod";

// Enums espelhados de qualify-state.ts/personas.ts (Zod precisa do literal).
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

export const suggestedExampleSchema = z.object({
	whenExpertise: z.array(expertiseLevelEnum).min(1).optional(),
	whenCategory: z.array(categoryEnum).min(1).optional(),
	whenChannel: channelEnum.optional(),
	whenIntent: z.array(userIntentEnum).min(1).optional(),
	userMessage: z.string().min(3).describe("Mensagem realista do usuário (1-2 frases)."),
	assistantResponse: z
		.string()
		.min(3)
		.describe("Resposta corrigida que a persona deveria ter dado (1-2 frases)."),
	rationale: z.string().min(3).describe("Por que esse exemplo corrige o padrão (1 frase)."),
});

export const suggestedForbiddenTopicSchema = z.object({
	topic: z.string().min(3).describe("Tópico que a persona não deve abordar."),
	responseWhenAsked: z
		.string()
		.min(3)
		.describe("Orientação curta de como redirecionar quando o tópico aparecer."),
	rationale: z.string().min(3),
});

export const suggestedHandoffTriggerSchema = z.object({
	condition: z.string().min(3).describe("Condição em linguagem natural pra escalar pra humano."),
	rationale: z.string().min(3),
});

export const diagnosisResultSchema = z.object({
	rootCause: z
		.string()
		.min(10)
		.describe("Causa raiz em 1-2 frases, citando evidência do transcript."),
	suggestedExamples: z
		.array(suggestedExampleSchema)
		.describe("Até 3 exemplos few-shot pra adicionar à persona."),
	suggestedForbiddenTopics: z
		.array(suggestedForbiddenTopicSchema)
		.describe("Até 2 tópicos a proibir."),
	suggestedHandoffTriggers: z
		.array(suggestedHandoffTriggerSchema)
		.describe("Até 2 triggers de handoff."),
});

export type SuggestedExample = z.infer<typeof suggestedExampleSchema>;
export type SuggestedForbiddenTopic = z.infer<typeof suggestedForbiddenTopicSchema>;
export type SuggestedHandoffTrigger = z.infer<typeof suggestedHandoffTriggerSchema>;
export type DiagnosisResult = z.infer<typeof diagnosisResultSchema>;

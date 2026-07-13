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
	// FIX-183: "quero ver todos/mais opções" — deve casar com UserIntent (qualify-state.ts).
	"wants_more_options",
	"asking_question",
	"providing_info",
	"expressing_doubt",
	// FIX-301 (rodada 10): distinto de expressing_doubt — ver qualify-state.ts.
	"confused",
	"off_topic",
	"neutral",
]);

export const suggestedExampleSchema = z.object({
	// .min(1) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	whenExpertise: z.array(expertiseLevelEnum).optional(),
	// .min(1) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	whenCategory: z.array(categoryEnum).optional(),
	whenChannel: channelEnum.optional(),
	// .min(1) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	whenIntent: z.array(userIntentEnum).optional(),
	// .min(3) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	userMessage: z.string().describe("Mensagem realista do usuário (1-2 frases)."),
	// .min(3) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	assistantResponse: z
		.string()
		.describe("Resposta corrigida que a persona deveria ter dado (1-2 frases)."),
	// .min(3) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	rationale: z.string().describe("Por que esse exemplo corrige o padrão (1 frase)."),
});

export const suggestedForbiddenTopicSchema = z.object({
	// .min(3) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	topic: z.string().describe("Tópico que a persona não deve abordar."),
	// .min(3) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	responseWhenAsked: z
		.string()
		.describe("Orientação curta de como redirecionar quando o tópico aparecer."),
	// .min(3) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	rationale: z.string(),
});

export const suggestedHandoffTriggerSchema = z.object({
	// .min(3) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	condition: z.string().describe("Condição em linguagem natural pra escalar pra humano."),
	// .min(3) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	rationale: z.string(),
});

export const diagnosisResultSchema = z.object({
	// .min(10) ignorado pelo AI SDK 6→JSON Schema; validado por prompt + pós-processamento
	rootCause: z.string().describe("Causa raiz em 1-2 frases, citando evidência do transcript."),
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

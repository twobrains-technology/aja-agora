import { z } from "zod";

// `score` sem min/max: API da Anthropic rejeita `minimum`/`maximum` em number — clamp vive no pipeline.
export const evalDimensionSchema = z.object({
	score: z.number().describe("Nota de 0 a 1 (inclusivo)."),
	reasoning: z.string().min(1),
});

export const evalFlagsSchema = z.object({
	hallucination: z.boolean(),
	missedHandoff: z.boolean(),
	incompleteDiscovery: z.boolean(),
	lowEngagement: z.boolean(),
});

export const evalDimensionsSchema = z.object({
	engajamento: evalDimensionSchema,
	discovery: evalDimensionSchema,
	continuidade: evalDimensionSchema,
	naturalidade: evalDimensionSchema,
	assertividade: evalDimensionSchema,
	conversao: evalDimensionSchema,
});

// `overallScore` sem min/max e arrays sem `maxItems`: API da Anthropic rejeita esses
// constraints em outputs estruturados. Clamp do score e cap dos arrays (3) vivem no pipeline.
export const evalResultSchema = z.object({
	dimensions: evalDimensionsSchema,
	flags: evalFlagsSchema,
	overallScore: z.number().describe("Nota geral de 0 a 1 (inclusivo)."),
	topIssues: z.array(z.string()).describe("Até 3 problemas mais graves; strings curtas."),
	topStrengths: z.array(z.string()).describe("Até 3 pontos fortes; strings curtas."),
});

export type EvalDimension = z.infer<typeof evalDimensionSchema>;
export type EvalFlags = z.infer<typeof evalFlagsSchema>;
export type EvalDimensions = z.infer<typeof evalDimensionsSchema>;
export type EvalResult = z.infer<typeof evalResultSchema>;

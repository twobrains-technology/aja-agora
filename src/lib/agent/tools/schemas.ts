import { z } from "zod";

// ---- Tool input schemas ----
// Single source of truth for:
// 1. AI SDK tool() parameter definitions (LLM sees these)
// 2. Runtime validation of tool calls
// 3. TypeScript type inference

export const searchGroupsInput = z.object({
	category: z
		.enum(["imovel", "auto", "servicos"])
		.describe("Categoria do bem: imóvel, automóvel ou serviços"),
	creditMin: z
		.number()
		.min(0)
		.optional()
		.describe("Valor mínimo de crédito em reais"),
	creditMax: z
		.number()
		.positive()
		.optional()
		.describe("Valor máximo de crédito em reais"),
});

export const simulateQuotaInput = z.object({
	groupId: z.string().min(1).describe("ID do grupo para simulação"),
	creditValue: z
		.number()
		.positive()
		.describe("Valor do crédito desejado em reais"),
});

export const getRatesInput = z.object({
	administradora: z
		.string()
		.optional()
		.describe("Nome da administradora (opcional, retorna todas se vazio)"),
	category: z
		.enum(["imovel", "auto", "servicos"])
		.optional()
		.describe("Categoria do bem"),
});

export const getGroupDetailsInput = z.object({
	groupId: z.string().min(1).describe("ID do grupo"),
});

// ---- Inferred types (for use in adapter and tools) ----

export type SearchGroupsInput = z.infer<typeof searchGroupsInput>;
export type SimulateQuotaInput = z.infer<typeof simulateQuotaInput>;
export type GetRatesInput = z.infer<typeof getRatesInput>;
export type GetGroupDetailsInput = z.infer<typeof getGroupDetailsInput>;

import { z } from "zod";

// ---- Tool input schemas ----
// Single source of truth for:
// 1. AI SDK tool() parameter definitions (LLM sees these)
// 2. Runtime validation of tool calls
// 3. TypeScript type inference

// FIX-257 (P1, veredito Fable r4 §P1 #1): creditMin/creditMax/creditValue vêm
// de texto livre do usuário — a LLM às vezes manda "92902" (string) em vez de
// 92902. `z.number()` estrito rejeitava a chamada ANTES de rodar `execute`
// (AI SDK marca o tool-call `invalid`), e o log só via `output: null` —
// indistinguível de "a tool rodou e não achou nada" (raiz da espiral de
// negação: o agente negava ofertas que o próprio usuário via na tela).
// `z.coerce.number()` aceita os dois formatos; entrada genuinamente
// não-numérica ("abc") continua falhando — não tem número pra inventar ali.
export const searchGroupsInput = z.object({
	category: z
		.enum(["imovel", "auto", "moto"])
		.describe("Categoria do bem: imóvel, automóvel ou moto"),
	creditMin: z.coerce.number().min(0).optional().describe("Valor mínimo de crédito em reais"),
	creditMax: z.coerce.number().positive().optional().describe("Valor máximo de crédito em reais"),
});

export const simulateQuotaInput = z.object({
	groupId: z.string().min(1).describe("ID do grupo para simulação"),
	creditValue: z.coerce.number().positive().describe("Valor do crédito desejado em reais"),
});

export const getRatesInput = z.object({
	administradora: z
		.string()
		.optional()
		.describe("Nome da administradora (opcional, retorna todas se vazio)"),
	category: z.enum(["imovel", "auto", "moto"]).optional().describe("Categoria do bem"),
});

export const getGroupDetailsInput = z.object({
	groupId: z.string().min(1).describe("ID do grupo"),
});

// ---- Inferred types (for use in adapter and tools) ----

export type SearchGroupsInput = z.infer<typeof searchGroupsInput>;
export type SimulateQuotaInput = z.infer<typeof simulateQuotaInput>;
export type GetRatesInput = z.infer<typeof getRatesInput>;
export type GetGroupDetailsInput = z.infer<typeof getGroupDetailsInput>;

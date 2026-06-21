import { z } from "zod";

// Schemas Zod da mesa de operação (backoffice de cadastros).
// Spec: docs/visao/mesa-de-operacao.md §3. ADR: docs/correcoes/decisions/2026-06-21-bloco-mesa-a.md.

// ── FIX-61: Administradora ───────────────────────────────────────────────────
// Entidade interna (dossiê de operação). NÃO é fonte de oferta/grupo (Bevi fonte
// única). codigoBevi casa por código com beviProposals.administradora.
export const createAdministradoraSchema = z.object({
	nome: z
		.string()
		.trim()
		.min(2, "Nome deve ter pelo menos 2 caracteres")
		.max(80, "Nome deve ter no máximo 80 caracteres"),
	codigoBevi: z
		.string()
		.trim()
		.max(60, "Código Bevi deve ter no máximo 60 caracteres")
		.optional()
		.transform((v) => (v === "" || v === undefined ? undefined : v)),
});

export const updateAdministradoraSchema = z
	.object({
		nome: z
			.string()
			.trim()
			.min(2, "Nome deve ter pelo menos 2 caracteres")
			.max(80, "Nome deve ter no máximo 80 caracteres")
			.optional(),
		codigoBevi: z
			.string()
			.trim()
			.max(60, "Código Bevi deve ter no máximo 60 caracteres")
			.nullable()
			.optional()
			.transform((v) => (v === "" ? null : v)),
		isActive: z.boolean().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "Pelo menos um campo precisa ser informado",
	});

export type CreateAdministradoraInput = z.infer<typeof createAdministradoraSchema>;
export type UpdateAdministradoraInput = z.infer<typeof updateAdministradoraSchema>;

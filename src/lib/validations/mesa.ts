import { z } from "zod";
import { normalizePhoneBR } from "@/lib/leads/phone";

// Schemas Zod da mesa de operação (backoffice de cadastros).
// Spec: docs/visao/mesa-de-operacao.md §3. ADR: docs/decisoes/blocos/2026-06-21-bloco-mesa-a.md.

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

// ── FIX-62: Documento da administradora (PDF) ────────────────────────────────
// Metadados do upload (o binário do PDF chega separado via multipart/form-data).
export const administradoraDocTipos = ["manual", "tabela", "outro"] as const;

export const createAdministradoraDocSchema = z.object({
	administradoraId: z.string().uuid("administradoraId inválido"),
	titulo: z
		.string()
		.trim()
		.min(2, "Título deve ter pelo menos 2 caracteres")
		.max(160, "Título deve ter no máximo 160 caracteres"),
	tipo: z.enum(administradoraDocTipos).default("manual"),
});

export type CreateAdministradoraDocInput = z.infer<typeof createAdministradoraDocSchema>;

// ── FIX-63: Atendente de mesa ────────────────────────────────────────────────
// Cadastro SIMPLES: nome + whatsapp (E.164 com DDI, sem '+'), sem login/email
// (≠ user role=attendant). whatsapp = chave de roteamento do copiloto (bloco C).
// Reusa o normalizador de telefone BR do projeto e prefixa o DDI 55 (ADR Decisão 4).
const nomeSchema = z
	.string()
	.trim()
	.min(2, "Nome deve ter pelo menos 2 caracteres")
	.max(100, "Nome deve ter no máximo 100 caracteres");

const whatsappE164Schema = z
	.string()
	.min(1, "WhatsApp obrigatório")
	.refine((v) => normalizePhoneBR(v) !== null, {
		message: "WhatsApp inválido. Informe DDD + número (ex: 62999998888)",
	})
	.transform((v) => `55${normalizePhoneBR(v)}`);

export const createMesaAttendantSchema = z.object({
	nome: nomeSchema,
	whatsapp: whatsappE164Schema,
});

export const updateMesaAttendantSchema = z
	.object({
		nome: nomeSchema.optional(),
		whatsapp: whatsappE164Schema.optional(),
		isActive: z.boolean().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "Pelo menos um campo precisa ser informado",
	});

export type CreateMesaAttendantInput = z.infer<typeof createMesaAttendantSchema>;
export type UpdateMesaAttendantInput = z.infer<typeof updateMesaAttendantSchema>;

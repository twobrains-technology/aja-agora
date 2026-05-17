import { z } from "zod";

/**
 * Single source of truth for the lead capture form.
 *
 * Adding a new field (e.g., CPF) is a 3-step change:
 * 1. Add the validation rule below to `leadSchema`.
 * 2. Add a row to `LEAD_FIELDS` describing how to render the input.
 * 3. Add a column to the `leads` table in `db/schema.ts` + run a migration.
 *
 * The `LeadForm` component renders inputs from `LEAD_FIELDS`, the API route
 * validates with `leadSchema`, and the DB persists. Same schema everywhere.
 *
 * Modelo WhatsApp-first: phone obrigatório, email opcional. Email vazio é
 * transformado em undefined pra não vazar string vazia pro DB.
 */

const brPhoneRegex = /^\d{10,11}$/;

export const leadSchema = z.object({
	name: z
		.string()
		.min(2, "Nome deve ter pelo menos 2 caracteres")
		.max(100, "Nome deve ter no máximo 100 caracteres"),
	phone: z
		.string()
		.min(1, "WhatsApp é obrigatório")
		.transform((v) => v.replace(/\D/g, ""))
		.pipe(z.string().regex(brPhoneRegex, "Telefone inválido. Use DDD + número (ex: 11999998888)")),
	email: z
		.union([z.string().email("Email inválido"), z.literal("")])
		.optional()
		.transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type LeadFields = z.infer<typeof leadSchema>;

export type LeadFieldConfig = {
	key: keyof LeadFields;
	label: string;
	type: "text" | "tel" | "email";
	inputMode?: "text" | "numeric" | "email";
	placeholder: string;
	autoFocus?: boolean;
	required: boolean;
};

export const LEAD_FIELDS: LeadFieldConfig[] = [
	{
		key: "name",
		label: "Nome",
		type: "text",
		placeholder: "Seu nome",
		autoFocus: true,
		required: true,
	},
	{
		key: "phone",
		label: "WhatsApp",
		type: "tel",
		inputMode: "numeric",
		placeholder: "(11) 98765-4321",
		required: true,
	},
	{
		key: "email",
		label: "Email",
		type: "email",
		inputMode: "email",
		placeholder: "seu@email.com",
		required: false,
	},
];

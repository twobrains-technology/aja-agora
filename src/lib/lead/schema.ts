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
 */

const brPhoneRegex = /^\d{10,11}$/;

export const leadSchema = z.object({
	name: z
		.string()
		.min(2, "Nome deve ter pelo menos 2 caracteres")
		.max(100, "Nome deve ter no máximo 100 caracteres"),
	phone: z
		.string()
		.transform((v) => v.replace(/\D/g, ""))
		.pipe(z.string().regex(brPhoneRegex, "Telefone inválido. Use DDD + número (ex: 11999998888)")),
	email: z.string().email("Email inválido"),
});

export type LeadFields = z.infer<typeof leadSchema>;

export type LeadFieldConfig = {
	key: keyof LeadFields;
	label: string;
	type: "text" | "tel" | "email";
	inputMode?: "text" | "numeric" | "email";
	placeholder: string;
	autoFocus?: boolean;
};

export const LEAD_FIELDS: LeadFieldConfig[] = [
	{
		key: "name",
		label: "Nome",
		type: "text",
		placeholder: "Seu nome completo",
		autoFocus: true,
	},
	{
		key: "phone",
		label: "Telefone",
		type: "tel",
		inputMode: "numeric",
		placeholder: "11999998888",
	},
	{
		key: "email",
		label: "Email",
		type: "email",
		inputMode: "email",
		placeholder: "seu@email.com",
	},
];

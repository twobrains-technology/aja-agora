import { z } from "zod";

const brPhoneRegex = /^\d{10,13}$/;

export const createAttendantSchema = z.object({
	name: z
		.string()
		.min(2, "Nome deve ter pelo menos 2 caracteres")
		.max(100, "Nome deve ter no maximo 100 caracteres"),
	email: z.string().email("Email invalido"),
	phone: z
		.string()
		.transform((v) => v.replace(/\D/g, ""))
		.pipe(
			z
				.string()
				.regex(brPhoneRegex, "Telefone invalido. Use DDI + DDD + numero (ex: 5511999998888)"),
		),
});

export const updateAttendantSchema = z
	.object({
		name: z
			.string()
			.min(2, "Nome deve ter pelo menos 2 caracteres")
			.max(100, "Nome deve ter no maximo 100 caracteres")
			.optional(),
		phone: z
			.string()
			.transform((v) => v.replace(/\D/g, ""))
			.pipe(
				z
					.string()
					.regex(brPhoneRegex, "Telefone invalido. Use DDI + DDD + numero (ex: 5511999998888)"),
			)
			.optional(),
		isActive: z.boolean().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "Pelo menos um campo precisa ser informado",
	});

export const setPasswordSchema = z.object({
	token: z.string().min(32, "Token invalido"),
	password: z
		.string()
		.min(8, "Senha deve ter pelo menos 8 caracteres")
		.max(128, "Senha deve ter no maximo 128 caracteres"),
});

export type CreateAttendantInput = z.infer<typeof createAttendantSchema>;
export type UpdateAttendantInput = z.infer<typeof updateAttendantSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

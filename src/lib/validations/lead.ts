import { z } from "zod";

const brPhoneRegex = /^\d{10,11}$/;

export const leadSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Nome deve ter no maximo 100 caracteres"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(brPhoneRegex, "Telefone invalido. Use DDD + numero (ex: 11999998888)")),
  email: z.string().email("Email invalido"),
});

export type LeadFormData = z.infer<typeof leadSchema>;

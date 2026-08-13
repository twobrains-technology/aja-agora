import { z } from "zod";

/**
 * O que o navegador do atendente pode mandar pro log de diagnóstico.
 *
 * Tolerante de propósito no CONTEÚDO (o ambiente varia por navegador e a gente
 * quer o que vier), rígido no FORMATO: valor longo é cortado em vez de rejeitado
 * — perder um diagnóstico porque o user agent passou de N caracteres seria
 * exatamente o oposto do motivo desta rota existir.
 */

const LIMITE_DE_VALOR = 300;

const valorSimples = z.union([
	z.string().transform((v) => v.slice(0, LIMITE_DE_VALOR)),
	z.number(),
	z.boolean(),
	z.null(),
]);

const mapa = z.record(z.string().max(60), valorSimples);

/** Vocabulário fechado: etapa fora da lista é ruído, não sinal. */
export const etapaDeDiagnostico = z.enum([
	"montagem",
	"clique",
	"permissao",
	"audio",
	"aviso",
	"stream",
	"falha",
]);

export const diagnosticoDeAvisoSchema = z.object({
	etapa: etapaDeDiagnostico,
	quando: z.string().max(40).optional(),
	detalhe: mapa.optional(),
	ambiente: mapa.optional(),
});

export type DiagnosticoDeAviso = z.infer<typeof diagnosticoDeAvisoSchema>;

import { z } from "zod";
import type { WhatsappTemplateComponent } from "@/db/schema";

// Validação do form de cadastro/edição de Message Template (WhatsApp Meta) e o
// builder que traduz os campos do form para o array `components` que a Cloud API
// espera. Lógica pura, sem DB — testável em test:unit.
// Design: docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.
// Decisões: docs/correcoes/decisions/2026-07-02-bloco-whatsapp-templates-admin.md.

// Categorias que a Meta aceita na criação (ela pode recategorizar depois).
export const TEMPLATE_CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

// snake_case: minúsculas, números e `_` — regra da Meta pro nome do template e a
// mesma convenção adotada pra chave lógica (usageKey) por consistência.
const SNAKE_CASE = /^[a-z0-9_]+$/;
const SNAKE_MSG = "Use apenas letras minúsculas, números e _ (snake_case)";

// Normaliza texto opcional: trim; vazio (ou não-string) vira `undefined`.
const blankToUndefined = (v: unknown): unknown => {
	if (typeof v !== "string") return v;
	const t = v.trim();
	return t === "" ? undefined : t;
};

const metaNameSchema = z
	.string()
	.trim()
	.min(1, "Nome do template é obrigatório")
	.max(512, "Nome muito longo")
	.regex(SNAKE_CASE, SNAKE_MSG);

// usageKey opcional: trim; vazio → undefined; se presente, exige snake_case.
const usageKeyOptional = z.preprocess(
	blankToUndefined,
	z.string().max(120, "Chave de uso muito longa").regex(SNAKE_CASE, SNAKE_MSG).optional(),
);

const languageSchema = z.string().trim().min(2, "Idioma inválido").max(10, "Idioma inválido");

const bodySchema = z
	.string()
	.trim()
	.min(1, "Corpo (BODY) é obrigatório")
	.max(1024, "Corpo muito longo (máx 1024)");

const headerFooterOptional = z.preprocess(
	blankToUndefined,
	z.string().max(60, "Máximo 60 caracteres").optional(),
);

// Cadastro (POST): metaName/category/corpo obrigatórios; usageKey/language/header/
// footer opcionais (D1 — usageKey não é obrigatório no cadastro).
export const createTemplateSchema = z.object({
	usageKey: usageKeyOptional,
	metaName: metaNameSchema,
	category: z.enum(TEMPLATE_CATEGORIES),
	language: languageSchema.default("pt_BR"),
	header: headerFooterOptional,
	body: bodySchema,
	footer: headerFooterOptional,
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// Edição (PATCH): tudo parcial. usageKey pode ser limpo com `null` (desvincular).
export const updateTemplateSchema = z.object({
	// `null`/"" desvinculam (limpam o usageKey); ausente = não mexe; valor = snake_case.
	usageKey: z.preprocess((v) => {
		if (v === null) return null;
		if (typeof v !== "string") return v;
		const t = v.trim();
		return t === "" ? null : t;
	}, z
		.union([z.null(), z.string().max(120, "Chave de uso muito longa").regex(SNAKE_CASE, SNAKE_MSG)])
		.optional()),
	metaName: metaNameSchema.optional(),
	category: z.enum(TEMPLATE_CATEGORIES).optional(),
	language: languageSchema.optional(),
	header: headerFooterOptional,
	body: bodySchema.optional(),
	footer: headerFooterOptional,
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

// Maior índice de placeholder `{{n}}` referenciado no texto (0 se nenhum). A Meta
// conta variáveis por posição — precisamos de N valores de exemplo.
function maxPlaceholderIndex(text: string): number {
	const matches = text.match(/\{\{\s*(\d+)\s*\}\}/g);
	if (!matches) return 0;
	return Math.max(
		...matches.map((m) => Number.parseInt(m.replace(/[^\d]/g, ""), 10)).filter((n) => n > 0),
	);
}

function sampleValues(count: number): string[] {
	return Array.from({ length: count }, (_, i) => `exemplo${i + 1}`);
}

/**
 * Traduz os campos do form (header?/body/footer?) para o array `components` da
 * Cloud API + o `bodyPreview` denormalizado. Quando o corpo (ou header) tem
 * variáveis `{{n}}`, injeta `example.*_text` com valores de exemplo pra o payload
 * ser aceitável pela Meta (que exige exemplos quando há placeholders).
 */
export function buildTemplateComponents(input: {
	header?: string;
	body: string;
	footer?: string;
}): { components: WhatsappTemplateComponent[]; bodyPreview: string } {
	const components: WhatsappTemplateComponent[] = [];

	const header = input.header?.trim();
	if (header) {
		const headerVars = maxPlaceholderIndex(header);
		components.push({
			type: "HEADER",
			format: "TEXT",
			text: header,
			...(headerVars > 0 ? { example: { header_text: sampleValues(headerVars) } } : {}),
		});
	}

	const bodyVars = maxPlaceholderIndex(input.body);
	components.push({
		type: "BODY",
		text: input.body,
		...(bodyVars > 0 ? { example: { body_text: [sampleValues(bodyVars)] } } : {}),
	});

	const footer = input.footer?.trim();
	if (footer) {
		components.push({ type: "FOOTER", text: footer });
	}

	return { components, bodyPreview: input.body };
}

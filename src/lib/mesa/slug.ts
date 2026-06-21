/**
 * Deriva um slug canônico (kebab-case, ASCII) a partir de um nome livre.
 * Remove acentos, baixa caixa, troca não-alfanumérico por '-' e colapsa.
 * Usado pra `administradoras.slug` (auto a partir do nome — FIX-61).
 */
export function slugify(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // remove diacríticos (combining marks)
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

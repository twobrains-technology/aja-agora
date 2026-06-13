/**
 * Normaliza telefone BR para formato canônico (somente dígitos, com DDD,
 * sem código país). Aceita 10 dígitos (fixo) ou 11 (celular com 9 inicial).
 *
 * Retorna `null` se o formato não bate. Use esta função em TODOS os
 * call sites que persistem phone (tools, /api/leads, lead-collection).
 */
export function normalizePhoneBR(raw: string): string | null {
	const digits = raw.replace(/\D/g, "");
	if (digits.length === 0) return null;
	const stripped = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
	if (stripped.length !== 10 && stripped.length !== 11) return null;
	// DDD válido: primeiro dígito 1-9 (BR não tem DDD começando com 0).
	if (!/^[1-9]/.test(stripped)) return null;
	return stripped;
}

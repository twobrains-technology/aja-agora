/**
 * Reconhecer o MESMO cliente quando o telefone chega em formatos diferentes.
 *
 * O caso real (prod, 2026-08-10): o mesmo humano virou dois contatos e duas
 * conversas porque o número foi gravado de três jeitos —
 *
 *   web (o que o cliente digitou)  → "62992496793"    (DDD + 9 + 8)
 *   wa_id (o que a Meta devolve)   → "556292496793"   (CC + DDD + 8, SEM o nono)
 *   contato criado pelo webhook    → "6292496793"     (DDD + 8)
 *
 * A Meta ainda entrega wa_id de número brasileiro no formato legado, sem o nono
 * dígito. Então comparar string, ou mesmo E.164, não junta os dois: um tem o 9,
 * o outro não.
 *
 * A chave estável é **DDD + os 8 últimos dígitos**. O nono dígito é justamente o
 * que varia entre as fontes, e os 8 finais nunca mudam.
 */

/**
 * Chave canônica de um telefone BR, ou `null` se não parecer um.
 *
 * "62992496793", "556292496793" e "+55 (62) 9249-6793" → todos "6292496793".
 */
export function chaveTelefoneBR(input: string | null | undefined): string | null {
	if (!input) return null;
	const digitos = input.replace(/\D/g, "");
	if (digitos.length < 10) return null;

	// "55" só é código de país com 12+ dígitos. Em 10-11 ele é o DDD de Santa
	// Maria-RS — cortar ali mutilaria o número (mesmo guard de normalizePhoneBR).
	const semCC = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
	if (semCC.length < 10 || semCC.length > 11) return null;

	const ddd = semCC.slice(0, 2);
	const finais = semCC.slice(-8);
	return `${ddd}${finais}`;
}

/** Os dois identificadores apontam para o mesmo aparelho? */
export function mesmoNumero(a: string | null | undefined, b: string | null | undefined): boolean {
	const ca = chaveTelefoneBR(a);
	return ca !== null && ca === chaveTelefoneBR(b);
}

/**
 * Detecta unique_violation (Postgres 23505) mesmo quando o drizzle embrulha o
 * erro do pg num wrapper (`DrizzleQueryError`) — o código real fica em `.cause`.
 * Percorre a cadeia de causes pra achar o `code`.
 */
export function isUniqueViolation(err: unknown): boolean {
	let cur: unknown = err;
	for (let depth = 0; cur && depth < 5; depth++) {
		if (typeof cur === "object" && "code" in cur && (cur as { code?: unknown }).code === "23505") {
			return true;
		}
		cur =
			typeof cur === "object" && "cause" in cur ? (cur as { cause?: unknown }).cause : undefined;
	}
	return false;
}

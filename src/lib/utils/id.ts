// UUID v4 helper defensivo. crypto.randomUUID() só existe em secure
// contexts (HTTPS ou localhost) — em HTTP via DNS local (orb.local)
// é undefined e quebra o chat ao montar o provider. Fallback usa
// Math.random pra garantir que sempre retorna v4 válido.
export function generateId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * UUID v4 que funciona em qualquer origem. `crypto.randomUUID` só existe em
 * contexto seguro (https ou localhost); em http no domínio `.orb.local` ele é
 * `undefined`. `crypto.getRandomValues` existe em todo contexto, então o
 * fallback usa ele (nunca `Math.random`).
 */
export function novoUuid(): string {
	if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
	const b = crypto.getRandomValues(new Uint8Array(16));
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

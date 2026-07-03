/**
 * Consulta AVULSA de manual (mesa) — o atendente tira dúvida sobre o procedimento de uma
 * administradora ESPECÍFICA sem ter um caso/cliente vinculado (só vale quando NÃO há handoff
 * aberto; com caso ativo o copiloto fica no manual daquele caso). Decisões (Kairo, 2026-07-03):
 * invocação NATURAL (o atendente cita a administradora pelo nome, casado com o CADASTRO) +
 * disponível SÓ sem caso ativo.
 *
 * Estado in-memory por telefone (não vai pro DB — é lookup de referência, não caso). Espelha o
 * padrão single-process já usado na mesa (getMesaAttendantList cache, simulator-bus).
 */

export interface AvulsoTurn {
	role: "attendant" | "assistant";
	content: string;
}

export interface AvulsoSession {
	administradoraId: string;
	administradoraNome: string;
	history: AvulsoTurn[];
	updatedAt: number;
}

export interface AdministradoraRef {
	id: string;
	nome: string;
	slug: string | null;
}

const TTL_MS = 30 * 60_000;
const sessions = new Map<string, AvulsoSession>();

/** Sessão avulsa viva do atendente (null se inexistente ou expirada). */
export function getAvulsoSession(phone: string): AvulsoSession | null {
	const s = sessions.get(phone);
	if (!s) return null;
	if (Date.now() - s.updatedAt > TTL_MS) {
		sessions.delete(phone);
		return null;
	}
	return s;
}

/** Grava/atualiza a sessão avulsa do atendente (carimba updatedAt). */
export function setAvulsoSession(phone: string, session: Omit<AvulsoSession, "updatedAt">): void {
	sessions.set(phone, { ...session, updatedAt: Date.now() });
}

/** Limpa todas as sessões — helper de teste (isolamento entre casos). */
export function clearAvulsoSessions(): void {
	sessions.clear();
}

/** Normaliza pra casar nome sem depender de acento/caixa. */
function normalize(s: string): string {
	return s
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.trim();
}

/**
 * Resolve a administradora citada no texto contra o ALLOWLIST (as administradoras cadastradas)
 * — determinístico, nunca "inventa" (lei de arquitetura de IA: só agir sobre entidade ancorada).
 * Casa o nome (ou slug) como substring do texto normalizado; exige ≥ 4 chars pra evitar falso
 * positivo em nome curto. Havendo mais de um match, vence o de nome mais LONGO (desambigua
 * "Canopus" × "Canopus Prime"). Retorna null quando nada casa.
 */
export function resolveAdministradora(
	text: string,
	administradoras: AdministradoraRef[],
): AdministradoraRef | null {
	const hay = normalize(text);
	let best: AdministradoraRef | null = null;
	let bestLen = 0;
	for (const adm of administradoras) {
		const candidates = [adm.nome, adm.slug].filter((c): c is string => Boolean(c));
		for (const cand of candidates) {
			const needle = normalize(cand);
			if (needle.length >= 4 && hay.includes(needle) && needle.length > bestLen) {
				best = adm;
				bestLen = needle.length;
			}
		}
	}
	return best;
}

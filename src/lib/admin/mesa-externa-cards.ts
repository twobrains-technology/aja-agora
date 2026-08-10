import { dedupLeadsByContact } from "./kanban-dedup";

type LeadDeduplicavel = Parameters<typeof dedupLeadsByContact>[0][number];

/**
 * Os cards do quadro da MESA EXTERNA — recorte primeiro, dedup depois.
 *
 * A ordem é o ponto todo. O dedup por contato (FIX-45) elege como representativo
 * o lead mais avançado do funil; rodando ANTES do recorte, um lead alheio ao
 * atendimento (tipicamente um `perdido` antigo do mesmo contato) sequestra o card
 * — leva-o pra uma raia que a mesa externa não enxerga e troca o id do card por
 * um que não pertence ao handoff dela. O caso desaparece do quadro de quem está
 * atendendo, com o handoff vivo no banco.
 *
 * Recortando primeiro, o dedup roda dentro do mundo dela: o representativo passa
 * a ser, necessariamente, um lead que ela atende.
 */
export function cardsDaMesaExterna<L extends LeadDeduplicavel>(
	leads: L[],
	meusLeadIds: string[],
): Array<L & { channels: string[] }> {
	const meus = new Set(meusLeadIds);
	// Sem casos → quadro vazio. Nunca "sem filtro, mostra tudo".
	if (meus.size === 0) return [];
	return dedupLeadsByContact(leads.filter((l) => meus.has(l.id))) as Array<
		L & { channels: string[] }
	>;
}

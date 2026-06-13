// FIX-7 (teste manual Kairo 2026-06-05): com descoberta de opção ÚNICA, o
// reveal duplicava o grupo (recommendation_card + simulation_result do MESMO
// grupo). O runner captura o tamanho da descoberta nos tool-results e suprime
// o recommendation_card quando só existe 1 opção — o detalhamento
// (simulation_result) é o card único.

/** Extrai o nº de opções retornadas pelas tools de descoberta. Null quando a
 * tool não é de descoberta ou o shape é desconhecido (não interfere). */
export function extractDiscoveryCount(toolName: string, output: unknown): number | null {
	if (toolName === "recommend_groups") {
		const recs = (output as { recommendations?: unknown[] } | null)?.recommendations;
		return Array.isArray(recs) ? recs.length : null;
	}
	if (toolName === "search_groups") {
		return Array.isArray(output) ? output.length : null;
	}
	return null;
}

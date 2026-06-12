// docx passo 4 (linha 37): "Permitir ver 'Outras opções' (as outras 2) pra
// comparação simples." Surfacing DETERMINÍSTICO das outras ofertas REAIS da
// descoberta (cache do adapter da conversa) — zero free-run do modelo, zero
// dado inventado. Módulo único: route (web) e harness do eval consomem o MESMO
// copy e a MESMA seleção.

import { getDiscoveryAdapter } from "@/lib/adapters";
import type { GroupSummary } from "@/lib/adapters/types";
import type { ConversationMetadata } from "@/lib/agent/personas";

export interface OtherOptionsResult {
	text: string;
	/** As outras ofertas (≤2), excluindo a recomendada do reveal. */
	groups: GroupSummary[];
}

/** Chave de equivalência de NEGÓCIO de uma oferta (administradora + valores).
 * Duas cotas distintas com a mesma chave são "a mesma oferta" pro usuário —
 * comum no Trilho B (cotas diferentes, valores idênticos). */
function equivKey(o: {
	administradora: string;
	creditValue: number;
	monthlyPayment: number;
	termMonths: number;
}): string {
	return [
		o.administradora.trim().toUpperCase(),
		Math.round(o.creditValue),
		Math.round(o.monthlyPayment),
		o.termMonths,
	].join("|");
}

export async function buildOtherOptions(
	conversationId: string,
	meta: ConversationMetadata,
): Promise<OtherOptionsResult> {
	const q = meta.qualifyAnswers ?? {};
	const category = meta.currentCategory;
	if (!category) throw new Error("sem categoria na conversa");
	const groups = await getDiscoveryAdapter(conversationId).searchGroups({
		category,
		creditMin: q.creditMin,
		creditMax: q.creditMax,
	});

	// FIX-28: "outras opções" mostrava cards IDÊNTICOS. Dois defeitos:
	//  (1) zero dedupe — cotas equivalentes (mesma adm + valores, ids distintos)
	//      passavam as duas.
	//  (2) exclusão da recomendada por NOME de administradora: quando a recomendada
	//      é da mesma adm que outras ofertas válidas, ou apagava todas (→ throw) ou,
	//      se o nome não casava, deixava a própria recomendada reaparecer.
	// Correção: dedupe + exclusão por chave de EQUIVALÊNCIA usando recommendedOffer
	// (o meta não guarda groupId — confirmado no DB do dev: 0/10). Fallback por
	// nome só quando não há recommendedOffer (conversas antigas).
	const recommendedKey = meta.recommendedOffer
		? equivKey({
				administradora:
					meta.recommendedOffer.administradora ?? meta.recommendedAdministradora ?? "",
				creditValue: meta.recommendedOffer.creditValue,
				monthlyPayment: meta.recommendedOffer.monthlyPayment,
				termMonths: meta.recommendedOffer.termMonths,
			})
		: null;

	const seen = new Set<string>();
	const others: GroupSummary[] = [];
	for (const g of groups) {
		const key = equivKey(g);
		const isRecommended = recommendedKey
			? key === recommendedKey
			: g.administradora === meta.recommendedAdministradora;
		if (isRecommended) continue;
		if (seen.has(key)) continue; // dedupe
		seen.add(key);
		others.push(g);
		if (others.length === 2) break; // docx: "as outras 2"
	}
	// Degradação honesta: < 1 "outra" → erro tratado pelo route (mesmo de hoje).
	if (others.length === 0) throw new Error("sem outras ofertas no cache");
	return {
		text: "Claro! Essas são as outras opções que encontrei pro seu perfil — compara com calma:",
		groups: others,
	};
}

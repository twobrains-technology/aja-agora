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
	const others = groups
		.filter((g) => g.administradora !== meta.recommendedAdministradora)
		.slice(0, 2); // docx: "as outras 2"
	if (others.length === 0) throw new Error("sem outras ofertas no cache");
	return {
		text: "Claro! Essas são as outras opções que encontrei pro seu perfil — compara com calma:",
		groups: others,
	};
}

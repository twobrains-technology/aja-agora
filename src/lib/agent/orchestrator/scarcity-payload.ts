// FIX-230 (docs/02-cards-novos.md CARD 2 — scarcity; ADR
// docs/decisoes/blocos/2026-07-09-agente-vendas-consorcio.md D3): a Bevi NÃO
// entrega "vagas restantes" (só `monthlyAwardedQuotas`, contemplados/mês).
// Decisão de produto do Kairo (2026-07-09, literal): o número é placebo
// comercial 1-6, DETERMINÍSTICO por grupo — nunca Math.random() por render
// (senão "restam 3" vira "restam 5" no refresh e destrói a credibilidade).

import type { RevealGroupIndex } from "./recommendation-payload";

const SCARCITY_DISCLAIMER = "Número estimado, apenas indicativo.";

/** Hash determinístico (djb2) do id do grupo → 1..6. Mesmo id SEMPRE produz o
 * mesmo número — não usar Math.random()/Date.now() aqui. */
export function stableSlotFromId(id: string): number {
	let hash = 5381;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 33) ^ id.charCodeAt(i);
	}
	return 1 + (Math.abs(hash) % 6);
}

/** Coage o payload do `scarcity`: `availableSlots` é derivado no servidor do
 * `groupId` REAL — a LLM não escolhe o número. Sem grupo ancorado, não
 * fabrica (o componente não renderiza sem `availableSlots`). Whitelist de
 * saída — nunca propaga total de cotas nem razão N/total. */
export function coerceScarcityPayload(
	input: Record<string, unknown>,
	index: RevealGroupIndex,
): Record<string, unknown> {
	const groupId = typeof input.groupId === "string" ? input.groupId : undefined;
	const group = groupId ? index.get(groupId) : undefined;
	const anchorId = group?.id ?? groupId;
	const administradora =
		group?.administradora ??
		(typeof input.administradora === "string" ? input.administradora : "");
	if (!anchorId || !index.has(anchorId)) {
		return {
			groupCode: anchorId ?? "",
			administradora,
			availableSlots: undefined,
			disclaimer: SCARCITY_DISCLAIMER,
		};
	}
	return {
		groupCode: anchorId,
		administradora,
		availableSlots: stableSlotFromId(anchorId),
		disclaimer: SCARCITY_DISCLAIMER,
	};
}

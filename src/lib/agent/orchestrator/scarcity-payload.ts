// FIX-230 (docs/02-cards-novos.md CARD 2 — scarcity; ADR
// docs/decisoes/blocos/2026-07-09-agente-vendas-consorcio.md D3): a Bevi NÃO
// entrega "vagas restantes" (só `monthlyAwardedQuotas`, contemplados/mês).
// Decisão de produto do Kairo (2026-07-09, literal): o número é placebo
// comercial 1-6, DETERMINÍSTICO por grupo — nunca Math.random() por render
// (senão "restam 3" vira "restam 5" no refresh e destrói a credibilidade).

import type { RevealGroupIndex } from "./recommendation-payload";

const SCARCITY_DISCLAIMER = "Número estimado, apenas indicativo.";

/** @deprecated NÃO USE. Derivava "vagas restantes" de um hash do id do grupo —
 * um número inventado, sem relação nenhuma com a administradora. Ao vivo chegou
 * a contradizer o card ao lado na MESMA tela: a recomendação do mesmo grupo
 * trazia `availableSlots: 8` (dado real da Bevi) e a escassez dizia 4. Escassez
 * falsa é o que separa venda de enganação — e é risco de CDC art. 37. Mantido
 * só pra não quebrar import antigo; o coerce abaixo não o chama mais. */
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
		group?.administradora ?? (typeof input.administradora === "string" ? input.administradora : "");
	if (!anchorId || !index.has(anchorId)) {
		return {
			groupCode: anchorId ?? "",
			administradora,
			availableSlots: undefined,
			disclaimer: SCARCITY_DISCLAIMER,
		};
	}
	// SÓ o número REAL da oferta. Sem ele, `availableSlots` fica indefinido e o
	// componente não renderiza — melhor card nenhum que número inventado.
	const vagasReais =
		typeof group?.availableSlots === "number" && group.availableSlots > 0
			? group.availableSlots
			: undefined;
	return {
		// Código humano do grupo quando a oferta traz; nunca o ObjectId cru, que
		// o cliente via como "6a5a74e7794e4df2921e88b6" e não significa nada.
		groupCode: group?.groupCode ?? anchorId,
		administradora,
		availableSlots: vagasReais,
		disclaimer: SCARCITY_DISCLAIMER,
	};
}

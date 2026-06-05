// FIX-6 (teste manual Kairo 2026-06-05): o payload do contemplation_dial era
// 100% input do MODELO — que passou o crédito do slider da qualificação em vez
// da oferta real recém-confirmada (CANOPUS 35k virou "17.600" no dial).
// Números do simulador NUNCA podem divergir da oferta ativa: o servidor coage
// os campos críticos a partir do snapshot capturado no reveal
// (meta.recommendedOffer); o modelo só controla a interação (mês-alvo, lance
// histórico, teto de embutido).

import type { Category } from "@/lib/agent/personas";

export interface RecommendedOfferSnapshot {
	administradora?: string;
	category?: Category;
	creditValue: number;
	termMonths: number;
	monthlyPayment: number;
}

/** Extrai o snapshot da oferta a partir do payload de um artifact âncora do
 * reveal (recommendation_card / simulation_result / group_card). Retorna null
 * se o payload não tiver os 3 números obrigatórios. */
export function offerSnapshotFromArtifact(
	payload: Record<string, unknown> | undefined,
): RecommendedOfferSnapshot | null {
	if (!payload) return null;
	const creditValue = Number(payload.creditValue);
	const termMonths = Number(payload.termMonths);
	const monthlyPayment = Number(payload.monthlyPayment);
	if (!(creditValue > 0) || !(termMonths > 0) || !(monthlyPayment > 0)) return null;
	return {
		administradora: typeof payload.administradora === "string" ? payload.administradora : undefined,
		category: typeof payload.category === "string" ? (payload.category as Category) : undefined,
		creditValue,
		termMonths,
		monthlyPayment,
	};
}

/** Coage o payload do dial: campos críticos vêm do snapshot da oferta ativa;
 * campos de interação (initialTargetMonth, historicalWinningBidPct,
 * maxEmbutidoPct) ficam com o que o modelo passou. Sem snapshot (reveal ainda
 * não aconteceu — não deveria ocorrer, dial é pós-reveal), passa intacto. */
export function coerceDialPayload(
	input: Record<string, unknown>,
	offer: RecommendedOfferSnapshot | null | undefined,
): Record<string, unknown> {
	if (!offer) return input;
	const rawTarget = Number(input.initialTargetMonth);
	// Mês-alvo precisa existir dentro do prazo REAL do grupo.
	const initialTargetMonth =
		Number.isFinite(rawTarget) && rawTarget >= 1
			? Math.min(Math.round(rawTarget), offer.termMonths)
			: Math.min(6, offer.termMonths);
	return {
		...input,
		...(offer.administradora ? { administradora: offer.administradora } : {}),
		...(offer.category ? { category: offer.category } : {}),
		creditValue: offer.creditValue,
		termMonths: offer.termMonths,
		monthlyPayment: offer.monthlyPayment,
		initialTargetMonth,
	};
}

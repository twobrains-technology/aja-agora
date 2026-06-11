// FIX-6 (teste manual Kairo 2026-06-05): o payload do contemplation_dial era
// 100% input do MODELO — que passou o crédito do slider da qualificação em vez
// da oferta real recém-confirmada (CANOPUS 35k virou "17.600" no dial).
// Números do simulador NUNCA podem divergir da oferta ativa: o servidor coage
// os campos críticos a partir do snapshot capturado no reveal
// (meta.recommendedOffer).
//
// FIX-C2/C5 (auditoria Kairo 2026-06-11, jornada BB): o FIX-6 coagia só
// crédito/prazo/parcela — os params de LANCE seguiam na mão do modelo e o dial
// mostrava 74% pro cenário que o card dizia 49,28% → ~6 meses. Agora o snapshot
// também captura o par real de lance da oferta (lance% · mês · teto de
// embutido) e o coerce os força. Defaults do PERFIL: mês-alvo inicial = prazo
// declarado pelo usuário; lance declarado vai no payload pro componente
// confrontar ("cobre / não cobre").

import type { Category } from "@/lib/agent/personas";

export interface RecommendedOfferSnapshot {
	administradora?: string;
	category?: Category;
	creditValue: number;
	termMonths: number;
	monthlyPayment: number;
	/** Lance de referência da oferta (% da carta) — necessaryBidToContemplate
	 * em %, fallback lancePercent. Dado REAL da Bevi. */
	lanceRefPct?: number;
	/** Mês em que o lance de referência contempla (probContemplacaoMeses). */
	lanceRefMonth?: number;
	/** Teto de lance embutido aceito pela oferta (bidPercentage da Bevi). */
	maxEmbutidoPct?: number;
}

/** Perfil declarado na qualificação — alimenta os defaults do dial (FIX-C5). */
export interface DeclaredProfile {
	prazoMeses?: number;
	lanceValue?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Extrai o snapshot da oferta a partir do payload de um artifact âncora do
 * reveal (recommendation_card / simulation_result / group_card). Retorna null
 * se o payload não tiver os 3 números obrigatórios. Os campos de lance só
 * existem quando o artifact os carrega (simulation_result). */
export function offerSnapshotFromArtifact(
	payload: Record<string, unknown> | undefined,
): RecommendedOfferSnapshot | null {
	if (!payload) return null;
	const creditValue = Number(payload.creditValue);
	const termMonths = Number(payload.termMonths);
	const monthlyPayment = Number(payload.monthlyPayment);
	if (!(creditValue > 0) || !(termMonths > 0) || !(monthlyPayment > 0)) return null;

	// FIX-C2: par real de lance da oferta (quando o artifact é o simulation_result)
	const lanceScenario = payload.lanceScenario as
		| { lancePercent?: number; expectedTermMonths?: number }
		| undefined;
	const embeddedBid = payload.embeddedBid as
		| { percent?: number; necessaryBidToContemplate?: number | null }
		| undefined;

	const necessaryPct =
		embeddedBid?.necessaryBidToContemplate && embeddedBid.necessaryBidToContemplate > 0
			? round2((embeddedBid.necessaryBidToContemplate / creditValue) * 100)
			: undefined;
	const lanceRefPct =
		necessaryPct ??
		(lanceScenario?.lancePercent && lanceScenario.lancePercent > 0
			? round2(lanceScenario.lancePercent)
			: undefined);
	const lanceRefMonth =
		lanceScenario?.expectedTermMonths && lanceScenario.expectedTermMonths > 0
			? Math.round(lanceScenario.expectedTermMonths)
			: undefined;
	const maxEmbutidoPct =
		embeddedBid?.percent && embeddedBid.percent > 0 ? round2(embeddedBid.percent) : undefined;

	return {
		administradora: typeof payload.administradora === "string" ? payload.administradora : undefined,
		category: typeof payload.category === "string" ? (payload.category as Category) : undefined,
		creditValue,
		termMonths,
		monthlyPayment,
		...(lanceRefPct != null ? { lanceRefPct } : {}),
		...(lanceRefMonth != null ? { lanceRefMonth } : {}),
		...(maxEmbutidoPct != null ? { maxEmbutidoPct } : {}),
	};
}

/** Coage o payload do dial: campos críticos vêm do snapshot da oferta ativa
 * (FIX-6: crédito/prazo/parcela; FIX-C2: lance%/mês de referência/teto de
 * embutido). O modelo só controla o mês-alvo inicial quando o usuário pediu
 * um what-if explícito; sem isso, o default é o prazo DECLARADO na
 * qualificação (FIX-C5) — nunca mais 6 hardcoded ignorando o perfil. Sem
 * snapshot (reveal ainda não aconteceu — não deveria ocorrer, dial é
 * pós-reveal), passa intacto. */
export function coerceDialPayload(
	input: Record<string, unknown>,
	offer: RecommendedOfferSnapshot | null | undefined,
	profile?: DeclaredProfile,
): Record<string, unknown> {
	if (!offer) return input;
	const rawTarget = Number(input.initialTargetMonth);
	const declared = Number(profile?.prazoMeses);
	// Mês-alvo: modelo (what-if explícito) → prazo declarado → fallback 6.
	// Sempre dentro do prazo REAL do grupo.
	const initialTargetMonth =
		Number.isFinite(rawTarget) && rawTarget >= 1
			? Math.min(Math.round(rawTarget), offer.termMonths)
			: Number.isFinite(declared) && declared >= 1
				? Math.min(Math.round(declared), offer.termMonths)
				: Math.min(6, offer.termMonths);
	const declaredLance = Number(profile?.lanceValue);
	return {
		...input,
		...(offer.administradora ? { administradora: offer.administradora } : {}),
		...(offer.category ? { category: offer.category } : {}),
		creditValue: offer.creditValue,
		termMonths: offer.termMonths,
		monthlyPayment: offer.monthlyPayment,
		// FIX-C2: números de lance saem da oferta real quando ela os tem —
		// o que o modelo passou é descartado (mesma regra do FIX-6).
		...(offer.lanceRefPct != null ? { historicalWinningBidPct: offer.lanceRefPct } : {}),
		...(offer.lanceRefMonth != null ? { referenceMonth: offer.lanceRefMonth } : {}),
		...(offer.maxEmbutidoPct != null ? { maxEmbutidoPct: offer.maxEmbutidoPct } : {}),
		...(Number.isFinite(declaredLance) && declaredLance > 0
			? { declaredLanceValue: declaredLance }
			: {}),
		initialTargetMonth,
	};
}

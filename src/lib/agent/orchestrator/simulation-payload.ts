// FIX-C3 (auditoria Kairo 2026-06-11, jornada BB real): o payload do
// present_simulation_result era digitado CAMPO A CAMPO pelo modelo — que
// mostrou "Valor que você recebe R$ 262.309,80" (a carta CHEIA) num cenário
// de lance embutido de 49,28%, contradizendo a semântica Bevi
// (receivedCredit = carta − embutido) e a educação dada 3 mensagens antes.
// Mesma classe do FIX-6: número de dinheiro NUNCA fica na mão do modelo.
// O runner captura o retorno REAL do simulate_quota no turno e este módulo
// coage todos os campos numéricos do card; o modelo mantém apenas
// administradora/category/actions (conteúdo não-numérico).

/** Shape relevante do retorno do simulate_quota (QuotaSimulation do adapter
 * Bevi). Campos numéricos copiados LITERALMENTE pro card. */
export interface QuotaSimulationLike {
	creditValue: number;
	monthlyPayment: number;
	adminFee: number;
	reserveFund: number;
	insurance: number;
	totalCost: number;
	termMonths: number;
	effectiveRate: number;
	lanceScenario?: { lancePercent: number; expectedTermMonths: number };
	embeddedBid?: {
		percent: number;
		embeddedBidValue: number;
		receivedCredit: number;
		necessaryBidToContemplate?: number | null;
	};
	expectedAdjustment?: { index: string; annualPercent: number };
}

/** O retorno do simulate_quota é utilizável pra coação? (descarta strings de
 * erro tipo DISCOVERY_NO_CONTEXT e shapes sem números). */
function isUsableSimulation(sim: unknown): sim is QuotaSimulationLike {
	if (!sim || typeof sim !== "object") return false;
	const s = sim as Record<string, unknown>;
	return Number(s.creditValue) > 0 && Number(s.monthlyPayment) > 0 && Number(s.termMonths) > 0;
}

/** Coage o payload do simulation_result contra o retorno REAL do
 * simulate_quota do mesmo turno. Sem retorno utilizável → payload intacto
 * (não inventa). */
export function coerceSimulationPayload(
	input: Record<string, unknown>,
	sim: QuotaSimulationLike | null | undefined | unknown,
): Record<string, unknown> {
	if (!isUsableSimulation(sim)) return input;
	return {
		...input,
		creditValue: sim.creditValue,
		monthlyPayment: sim.monthlyPayment,
		adminFee: sim.adminFee,
		reserveFund: sim.reserveFund,
		insurance: sim.insurance,
		totalCost: sim.totalCost,
		termMonths: sim.termMonths,
		effectiveRate: sim.effectiveRate,
		...(sim.lanceScenario ? { lanceScenario: sim.lanceScenario } : {}),
		...(sim.embeddedBid ? { embeddedBid: sim.embeddedBid } : {}),
		...(sim.expectedAdjustment ? { expectedAdjustment: sim.expectedAdjustment } : {}),
	};
}

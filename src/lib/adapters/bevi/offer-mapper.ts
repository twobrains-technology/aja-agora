// Mapeamento Bevi/AGX (Trilho A — API de Parceiro) → domínio Aja.
//
// Fonte do shape: docs/integracoes/bevi-api-discovery.md §3 + as fixtures reais
// capturadas via Playwright em docs/integracoes/assets/segmentos/*/offers.json
// (2026-05-27). PURO e sem I/O — recebe uma oferta Bevi e devolve os tipos de
// domínio. É o ponto de costura pra quando o BeviApiAdapter real entrar (quando
// o parceiro liberar o API token). Testado contra as fixtures reais.
//
// ⚠️ A API Bevi NÃO está disponível ainda (sem token). Este mapper existe pra
// (a) provar que o shape está entendido, (b) deixar a integração pronta, e
// (c) permitir um mock com shape realista. Nenhuma chamada HTTP aqui.

import type { ConsorcioCategory, GroupSummary, QuotaSimulation } from "../types";

/** Shape (parcial) de uma oferta retornada pela simulação Bevi (`offers[]`).
 * Só os campos que consumimos — a oferta real traz ~50+. */
export interface BeviOffer {
	bank: string;
	bankLabel?: string;
	group: string;
	term: number; // prazo em meses
	finalValue: number; // valor da carta
	receivedCredit?: number; // crédito líquido (carta − lance embutido)
	installmentValue?: number;
	importedInstallmentValue?: number; // parcela "limpa" (a que a UI mostra)
	totalPaid?: number; // custo total
	adminFee: number; // taxa de adm como fração (0.29 = 29%)
	reserveFundFee?: number; // fração
	insuranceFee?: number; // fração
	insuranceTotalAmount?: number; // R$
	reserveFundAmount?: number; // R$
	adjustmentType?: string; // INCC | IPCA | IGPM | ...
	monthlyAwardedQuotas?: number; // contemplados/mês
	probContemplacaoMeses?: string; // estimativa de meses até contemplar
	embeddedBid?: number; // R$ usado como lance embutido
	bidPercentage?: number; // fração (0.3 = 30%)
	necessaryBidToContemplate?: number; // R$
	quotaId: string;
	productType?: string; // IMOVEL | AUTOS | MOTOS | SERVICOS | PESADOS | OUTROS BENS
}

/** Segmento Bevi → categoria de domínio. Bevi tem 6 segmentos; o domínio Aja
 * tem 4. PESADOS e OUTROS BENS são mapeados pro mais próximo (auto/servicos). */
const SEGMENT_TO_CATEGORY: Record<string, ConsorcioCategory> = {
	IMOVEL: "imovel",
	AUTOS: "auto",
	MOTOS: "moto",
	SERVICOS: "servicos",
	PESADOS: "auto",
	"OUTROS BENS": "servicos",
};

export function beviSegmentToCategory(segment: string): ConsorcioCategory {
	const c = SEGMENT_TO_CATEGORY[segment?.toUpperCase?.() ?? ""];
	if (!c) throw new Error(`Segmento Bevi desconhecido: "${segment}"`);
	return c;
}

/** Índice de correção: o domínio modela só INCC|IPCA. IGPM e afins caem em IPCA
 * (índice de preços ao consumidor genérico) — documentado, revisável. */
function mapAdjustmentIndex(adjustmentType?: string): "INCC" | "IPCA" {
	return (adjustmentType ?? "").toUpperCase() === "INCC" ? "INCC" : "IPCA";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Oferta Bevi → GroupSummary (card de busca/comparação). */
export function beviOfferToGroupSummary(offer: BeviOffer): GroupSummary {
	const category = beviSegmentToCategory(offer.productType ?? "");
	return {
		id: offer.quotaId,
		administradora: offer.bankLabel ?? offer.bank,
		category,
		creditValue: offer.finalValue,
		monthlyPayment: round2(offer.importedInstallmentValue ?? offer.installmentValue ?? 0),
		adminFeePercent: round2(offer.adminFee * 100),
		termMonths: offer.term,
		// A oferta não traz total/disponíveis de cotas; usamos contemplados/mês
		// como proxy de liquidez do grupo até a API expor os campos.
		totalParticipants: 0,
		availableSlots: offer.monthlyAwardedQuotas ?? 0,
		contemplationRate: offer.monthlyAwardedQuotas ?? 0,
	};
}

/** Oferta Bevi → QuotaSimulation (breakdown de custos + cenário de lance).
 * Inclui o cenário de lance embutido quando a oferta traz `embeddedBid`. */
export function beviOfferToQuotaSimulation(offer: BeviOffer): QuotaSimulation {
	const category = beviSegmentToCategory(offer.productType ?? "");
	const adminFeeBrl = round2(offer.finalValue * offer.adminFee);
	const reserveFundBrl = round2(
		offer.reserveFundAmount ?? offer.finalValue * (offer.reserveFundFee ?? 0),
	);
	const insuranceBrl = round2(offer.insuranceTotalAmount ?? 0);
	const totalCost = round2(offer.totalPaid ?? 0);
	const effectiveRate =
		offer.finalValue > 0 && offer.totalPaid
			? round2((offer.totalPaid / offer.finalValue - 1) * 100)
			: round2(offer.adminFee * 100);

	// Cenário com lance: prazo esperado vem da estimativa Bevi (probContemplacaoMeses)
	// ou dos meses pagos antes da contemplação. NUNCA é garantia (CDC art. 30/37).
	const expectedTermMonths =
		Number(offer.probContemplacaoMeses ?? "0") || Math.round(offer.term * 0.4);
	const lancePercent = offer.bidPercentage ? round2(offer.bidPercentage * 100) : 0;

	return {
		groupId: offer.quotaId,
		category,
		creditValue: offer.finalValue,
		monthlyPayment: round2(offer.importedInstallmentValue ?? offer.installmentValue ?? 0),
		adminFee: adminFeeBrl,
		reserveFund: reserveFundBrl,
		insurance: insuranceBrl,
		totalCost,
		termMonths: offer.term,
		effectiveRate,
		lanceScenario: { lancePercent, expectedTermMonths },
		expectedAdjustment: {
			index: mapAdjustmentIndex(offer.adjustmentType),
			// A oferta não traz o % anual do índice; usamos premissa conservadora
			// por índice (média histórica), rotulada como estimativa.
			annualPercent: mapAdjustmentIndex(offer.adjustmentType) === "INCC" ? 6 : 4.5,
		},
	};
}

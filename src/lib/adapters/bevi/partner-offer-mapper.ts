// Mapper da oferta REAL da API de Parceiro (8 campos) → confirmação de fechamento.
//
// ⚠️ Diferente do offer-mapper.ts (que mapeia a oferta self-contract de 68 campos
// usada na DESCOBERTA). A oferta de parceiro é pobre (spec §7/§11): NÃO traz prazo,
// taxa de adm, fundo, correção, custo total nem lance embutido detalhado. Por isso
// este mapper produz só o que dá pra afirmar com honestidade — os campos ausentes
// ficam `undefined` (GAP), nunca chutados (CDC art. 37).
//
// Uso: no passo 5, depois de re-simular na API real, mostramos a oferta REAL pro
// usuário confirmar antes do choose_offer (fecha o gap indicativo×real da Descoberta).

import type { ConsorcioCategory } from "../types";
import type { PartnerOffer } from "../proposal-gateway";
import { beviSegmentToCategory } from "./offer-mapper";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Oferta real confirmada, só com o que a API de Parceiro garante. Os GAPs (prazo,
 * taxas, correção) são opcionais e vêm `undefined` deste trilho. */
export interface RealOffer {
	ofertaId: string;
	administradora: string;
	grupo: string;
	category: ConsorcioCategory;
	creditValue: number; // valorCarta (R$)
	monthlyPayment: number; // parcela (R$, arredondada)
	tipoOferta: "SPECIAL_OFFER" | "FREE_BID";
	/** GAPs §11 — ausentes na oferta de parceiro. Preenchidos só pela Descoberta. */
	termMonths?: number;
	adminFeePercent?: number;
	/** Score bruto da oferta (taxaContemplacao). SEMÂNTICA TBD com a AGX — guardado
	 * pra ordenação interna, NUNCA exibido como "taxa" pro usuário (spec §7). */
	rawContemplationScore?: number;
}

/** Converte a oferta real + o segmento da request (a oferta não traz segmento). */
export function partnerOfferToRealOffer(offer: PartnerOffer, segmento: string): RealOffer {
	return {
		ofertaId: offer.ofertaId,
		administradora: offer.administradora,
		grupo: offer.grupo,
		category: beviSegmentToCategory(segmento),
		creditValue: offer.valorCarta,
		monthlyPayment: round2(offer.parcela),
		tipoOferta: offer.tipoOferta,
		// GAPs deste trilho — explicitamente ausentes:
		termMonths: undefined,
		adminFeePercent: undefined,
		rawContemplationScore: offer.taxaContemplacao,
	};
}

/** Normaliza nome de administradora pra comparação entre trilhos — a Descoberta
 * devolve "ÂNCORA" e a API de Parceiro "ANCORA" (acento/caixa divergem). */
const normalizeAdmin = (s: string) =>
	s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.trim();

/** Escolhe, dentre as ofertas reais, a mais próxima do crédito que o usuário viu na
 * Descoberta (pra costurar o seam indicativo→real sem trocar o "plano" debaixo dele).
 *
 * BUG-ADMIN-TROCADA-NO-FECHAMENTO (2026-06-04, E2E real): o usuário decidia sobre a
 * administradora recomendada e o fechamento entregava OUTRA — closest por valor
 * ignorava a marca. Com `preferAdministradora` presente nas ofertas do parceiro,
 * escolhe a mais próxima DELA; ausente, cai no closest geral (não trava o
 * fechamento por divergência de catálogo entre trilhos). */
export function pickClosestOffer(
	offers: PartnerOffer[],
	targetCredit: number,
	preferAdministradora?: string | null,
): PartnerOffer | undefined {
	if (offers.length === 0) return undefined;
	const closest = (list: PartnerOffer[]) =>
		list.reduce((best, o) =>
			Math.abs(o.valorCarta - targetCredit) < Math.abs(best.valorCarta - targetCredit) ? o : best,
		);
	if (preferAdministradora) {
		const pref = normalizeAdmin(preferAdministradora);
		const preferred = offers.filter((o) => normalizeAdmin(o.administradora) === pref);
		if (preferred.length > 0) return closest(preferred);
	}
	return closest(offers);
}

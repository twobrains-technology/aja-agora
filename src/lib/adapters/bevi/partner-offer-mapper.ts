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

import type { PartnerOffer } from "../proposal-gateway";
import type { ConsorcioCategory } from "../types";
import { beviSegmentToCategory } from "./offer-mapper";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** FIX-39: prazo da API nova → meses, só com fonte real. Aceita number finito e
 * positivo; ausente/0/negativo/ilegível → undefined (NUNCA chuta — regra D11). */
function parseTermMonths(v: number | string | null | undefined): number | undefined {
	return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
}

/** BUG-PARCELA-STRING (dev real 2026-06-12): a API nova devolve `parcela` como
 * STRING pt-BR ("2.075,34"). round2(string) dava NaN → JSON.stringify(NaN) =
 * null → o RealOffer chamava null.toLocaleString e derrubava o front inteiro.
 * Normaliza number|string pra number; ilegível/ausente → undefined (NUNCA NaN). */
export function parseMoney(v: number | string | null | undefined): number | undefined {
	if (typeof v === "number") return Number.isFinite(v) ? round2(v) : undefined;
	if (typeof v !== "string") return undefined;
	const n = Number(v.replace(/\./g, "").replace(",", "."));
	return Number.isFinite(n) ? round2(n) : undefined;
}

/** Oferta real confirmada, só com o que a API de Parceiro garante. Os GAPs (prazo,
 * taxas, correção) são opcionais e vêm `undefined` deste trilho. */
export interface RealOffer {
	ofertaId: string;
	administradora: string;
	grupo: string;
	category: ConsorcioCategory;
	creditValue: number; // valorCarta (R$)
	/** parcela (R$, arredondada). Opcional: shape novo pode vir ilegível —
	 * undefined honesto em vez de NaN (BUG-PARCELA-STRING). */
	monthlyPayment?: number;
	tipoOferta: "SPECIAL_OFFER" | "FREE_BID";
	/** FIX-39: prazo REAL (meses). A API nova (2026-06-12) trouxe `prazo` — o gap do
	 * FIX-13 acabou. Opcional: shape antigo não tinha e a API pode voltar atrás. */
	termMonths?: number;
	/** GAP §11 — ainda ausente na oferta de parceiro (a API nova não trouxe taxa). */
	adminFeePercent?: number;
	/** FIX-40: lance médio do grupo (R$) — campo `lanceMedio` da API nova. Rótulo
	 * literal; comparação factual de posição, NUNCA promessa de contemplação. */
	avgBidValue?: number;
	/** Score bruto da oferta (taxaContemplacao). SEMÂNTICA TBD com a AGX — guardado
	 * pra ordenação interna, NUNCA exibido como "taxa" pro usuário (spec §7). */
	rawContemplationScore?: number;
}

/** Converte a oferta real + o segmento da request (a oferta não traz segmento). */
export function partnerOfferToRealOffer(offer: PartnerOffer, segmento: string): RealOffer {
	// FIX-40: lance médio do grupo só com fonte real e positiva (R$). Reusa o parse
	// de money (number|string pt-BR); 0/negativo/ilegível → undefined (D11).
	const avgBid = parseMoney(offer.lanceMedio);
	return {
		ofertaId: offer.ofertaId,
		administradora: offer.administradora,
		grupo: offer.grupo,
		category: beviSegmentToCategory(segmento),
		creditValue: offer.valorCarta,
		monthlyPayment: parseMoney(offer.parcela),
		tipoOferta: offer.tipoOferta,
		// FIX-39: prazo agora vem da API nova (defensivo — gap do FIX-13 acabou).
		termMonths: parseTermMonths(offer.prazo),
		// GAP deste trilho — ainda ausente (a API nova não trouxe taxa):
		adminFeePercent: undefined,
		// FIX-40: lance médio do grupo (rótulo literal; só quando > 0).
		avgBidValue: avgBid != null && avgBid > 0 ? avgBid : undefined,
		rawContemplationScore: offer.taxaContemplacao,
	};
}

/** Normaliza nome de administradora pra comparação entre trilhos — a Descoberta
 * devolve "ÂNCORA" e a API de Parceiro "ANCORA" (acento/caixa divergem). */
const normalizeAdmin = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

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

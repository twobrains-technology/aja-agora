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
	monthlyAwardedQuotas?: number; // contemplados/mês (CONTAGEM real — fonte do availableSlots)
	// FIX-192: taxaContemplacao (fração 0..1, semântica TBD com a AGX) vem no retorno
	// ENXUTO real (2026-07-01) mas NÃO é contagem — NUNCA vira availableSlots nem % de
	// contemplação. Declarado só pra travar o não-uso; a contemplação exibida só sai
	// de monthlyAwardedQuotas real (spec §1.1/§3.1).
	taxaContemplacao?: number; // NÃO usar como contemplados/mês nem como %
	probContemplacaoMeses?: string; // estimativa de meses até contemplar
	embeddedBid?: number; // R$ usado como lance embutido
	embeddedBidAcceptancePercentage?: string | number; // teto REAL de embutido aceito ("30,00" / 0.3)
	bidPercentage?: number; // fração (0.3 = 30%) — lance TOTAL necessário, NÃO o embutido
	necessaryBidToContemplate?: number; // R$
	quotaId: string;
	// FIX-193: campos do retorno ENXUTO real (2026-07-01) — critério interno de
	// ranking/dedup. `tipoOferta` (SPECIAL_OFFER|FREE_BID) e `grupo` (nº do grupo).
	// `ofertaId` (UUID de sessão) alimenta o CONTRATO do reveal (FIX-191).
	tipoOferta?: string;
	grupo?: string;
	ofertaId?: string;
	// FIX-219: marcador SINTÉTICO do adapter — NÃO vem da Bevi. Indica se esta
	// oferta veio da variante de busca SEM ou COM lance embutido (a Bevi não
	// devolve essa informação). Critério interno de dedup (recommendation.ts):
	// impede que o dedup por administradora+grupo colapse as duas modalidades
	// do MESMO grupo físico. Nunca vai pra UI/contexto do modelo.
	embeddedVariant?: "sem" | "com";
	productType?: string; // IMOVEL | AUTOS | MOTOS | SERVICOS | PESADOS | OUTROS BENS
	proximaAssembleia?: string; // ISO date — próxima assembleia do grupo
	validityStart?: string; // ISO date — início de vigência da oferta
	quantityOfQuotas?: number; // cotas da oferta
	// FIX-223: lance médio do grupo (R$) — campo `averageBid` da oferta self-contract
	// (mesma fonte que alimenta `lanceMedio` no trilho de fechamento, ver
	// bevi-self-contract-proposal-gateway.ts:69). Não fazia parte do shape enxuto
	// consumido pela descoberta até agora.
	averageBid?: number;
}

/** Segmento Bevi → categoria de domínio. Bevi tem 6 segmentos; o domínio Aja
 * tem 3 (FIX-363: "servicos" foi extinta — não é mais uma modalidade ofertada).
 * PESADOS, SERVICOS e OUTROS BENS mapeiam pro mais próximo (auto) — nunca dá
 * throw, pois a Bevi pode devolver qualquer um desses 6 segmentos em runtime. */
const SEGMENT_TO_CATEGORY: Record<string, ConsorcioCategory> = {
	IMOVEL: "imovel",
	AUTOS: "auto",
	MOTOS: "moto",
	SERVICOS: "auto",
	PESADOS: "auto",
	"OUTROS BENS": "auto",
};

export function beviSegmentToCategory(segment: string): ConsorcioCategory {
	const c = SEGMENT_TO_CATEGORY[segment?.toUpperCase?.() ?? ""];
	if (!c) throw new Error(`Segmento Bevi desconhecido: "${segment}"`);
	return c;
}

/** Categoria de domínio (4) → segmento Bevi primário (pro fechamento). As 6
 * variações Bevi colapsam em 4; no fechamento usamos o segmento canônico. */
const CATEGORY_TO_SEGMENT: Record<ConsorcioCategory, string> = {
	imovel: "IMOVEL",
	auto: "AUTOS",
	moto: "MOTOS",
};

export function categoryToBeviSegment(category: ConsorcioCategory | null | undefined): string {
	return CATEGORY_TO_SEGMENT[category ?? "auto"] ?? "AUTOS";
}

/** Índice de correção: o domínio modela só INCC|IPCA. IGPM e afins caem em IPCA
 * (índice de preços ao consumidor genérico) — documentado, revisável. */
function mapAdjustmentIndex(adjustmentType?: string): "INCC" | "IPCA" {
	return (adjustmentType ?? "").toUpperCase() === "INCC" ? "INCC" : "IPCA";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** FIX-255 (rodada 4, veredito Fable FINAL §N-G): a Bevi devolve `bankLabel`
 * ACENTUADO quando presente ("ITAÚ", "ÂNCORA" — confirmado nas fixtures reais
 * docs/integracoes/assets/segmentos/*), mas o fallback `bank` é código cru
 * SEM acento ("ITAU", "ANCORA", "TRADICAO" — visto ao vivo no veredito,
 * "Confirmei com a ITAU/TRADICAO"). Nome de administradora cru na fala ao
 * usuário viola o inviolável de PT-BR. Tabela pequena e SEGURA: só corrige os
 * códigos conhecidos que precisam de acento; qualquer nome não mapeado passa
 * intacto (nunca inventa/mangla um nome que não reconhece). */
const ADMINISTRADORA_DISPLAY_NAME: Record<string, string> = {
	ITAU: "ITAÚ",
	ANCORA: "ÂNCORA",
	TRADICAO: "TRADIÇÃO",
};

export function normalizeAdministradoraName(raw: string): string {
	const normalized = ADMINISTRADORA_DISPLAY_NAME[raw.trim().toUpperCase()];
	return normalized ?? raw;
}

/** Parse do teto de embutido da Bevi: "30,00" | "30.00" | 0.3 | 30 → 30 (em %).
 * null quando ausente/inválido (FIX-30: sem teto REAL não se inventa embutido). */
function parseBeviAcceptPercent(v: string | number | undefined | null): number | null {
	if (v == null) return null;
	const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
	if (!Number.isFinite(n) || n <= 0) return null;
	return n <= 1 ? round2(n * 100) : round2(n);
}

/** A oferta é ARITMETICAMENTE POSSÍVEL?
 *
 * Num consórcio o cliente sempre paga MAIS que a carta (carta + taxa de
 * administração + fundo de reserva). Uma oferta chegou com carta de R$ 190.000,
 * parcela de R$ 759,98 e 222 meses: R$ 168.716 no total, 11% MENOS que a carta —
 * e o `totalPaid` da própria oferta dizia R$ 264.796 (parcela coerente seria
 * R$ 1.192,77). O número passou por todo o caminho e foi narrado a uma cliente,
 * que quase fechou em cima dele.
 *
 * Nunca "corrige" o valor — inventar parcela é pior que descartar a oferta.
 * Oferta incoerente sai do conjunto e o log registra, porque isso é problema da
 * fonte e alguém precisa ver. Invariante verificável → código.
 */
export function ofertaEhCoerente(offer: BeviOffer): boolean {
	const parcela = Number(offer.importedInstallmentValue ?? offer.installmentValue ?? 0);
	const prazo = Number(offer.term ?? 0);
	const carta = Number(offer.finalValue ?? 0);
	if (!(parcela > 0) || !(prazo > 0) || !(carta > 0)) return false;
	const totalPelaParcela = parcela * prazo;
	if (totalPelaParcela <= carta) return false;
	// Quando a oferta traz o total que ela mesma calcula, os dois têm que fechar.
	// Tolerância larga (15%) de propósito: seguro/parcelas escalonadas variam.
	const totalDaOferta = Number(offer.totalPaid ?? 0);
	if (totalDaOferta > 0) {
		const desvio = Math.abs(totalPelaParcela - totalDaOferta) / totalDaOferta;
		if (desvio > 0.15) return false;
	}
	return true;
}

/** Oferta Bevi → GroupSummary (card de busca/comparação). */
export function beviOfferToGroupSummary(offer: BeviOffer): GroupSummary {
	const category = beviSegmentToCategory(offer.productType ?? "");
	return {
		id: offer.quotaId,
		administradora: normalizeAdministradoraName(offer.bankLabel ?? offer.bank),
		category,
		creditValue: offer.finalValue,
		monthlyPayment: round2(offer.importedInstallmentValue ?? offer.installmentValue ?? 0),
		adminFeePercent: round2(offer.adminFee * 100),
		termMonths: offer.term,
		// A oferta não traz total/disponíveis de cotas; usamos contemplados/mês
		// como proxy de liquidez do grupo até a API expor os campos.
		totalParticipants: 0,
		// FIX-192: contemplação SÓ de dado REAL ancorado — o monthlyAwardedQuotas
		// (contagem). Ausente (retorno enxuto real) → 0; NUNCA derivado de
		// taxaContemplacao (fração ≠ contagem). O runner coage o hero com este valor.
		availableSlots: offer.monthlyAwardedQuotas ?? 0,
		contemplationRate: offer.monthlyAwardedQuotas ?? 0,
		// FIX-193: critério interno de ranking/dedup — leitura defensiva pros dois
		// shapes (enxuto `grupo` × rico `group`). NUNCA sai pra UI (toModelGroupSummary
		// os strippa; a coerção do card também os descarta).
		...(offer.tipoOferta ? { tipoOferta: offer.tipoOferta } : {}),
		...((offer.grupo ?? offer.group) ? { grupo: offer.grupo ?? offer.group } : {}),
		// FIX-191 (CONTRATO): ofertaId real quando a fonte o traz.
		...(offer.ofertaId ? { ofertaId: offer.ofertaId } : {}),
		// FIX-219: propaga o marcador sintético de variante (com/sem embutido).
		...(offer.embeddedVariant ? { embeddedVariant: offer.embeddedVariant } : {}),
		// FIX-223: lance médio só com fonte real e positiva (D11 — nunca fabrica).
		...(typeof offer.averageBid === "number" && offer.averageBid > 0
			? { avgBidValue: round2(offer.averageBid) }
			: {}),
	};
}

/** GroupSummary enxuto pro CONTEXTO do modelo (FIX-23 — token diet). O tool-result
 * de search/recommend é re-enviado a cada turno (multi-turn); `totalParticipants`
 * é constante 0 no Trilho B (a oferta self-contract não traz total de cotas) —
 * peso morto que o modelo nunca usa e nenhum schema de card referencia. Os números
 * ricos do card vêm da coerção server-side (runner), não deste resumo.
 *
 * FIX-193: `tipoOferta`/`grupo` são critério INTERNO de ranking/dedup — ficam FORA
 * do contexto do modelo e do payload (nunca "vazam" pra UI). `ofertaId` PERMANECE:
 * é campo do CONTRATO do reveal (FIX-191), coagido no card pra o seletor.
 * FIX-219: `embeddedVariant` (marcador sintético com/sem embutido) segue o
 * mesmo tratamento de `tipoOferta`/`grupo` — critério interno, nunca vaza. */
export type ModelGroupSummary = Omit<
	GroupSummary,
	"totalParticipants" | "tipoOferta" | "grupo" | "embeddedVariant"
>;

export function toModelGroupSummary({
	totalParticipants: _drop,
	tipoOferta: _dropTipo,
	grupo: _dropGrupo,
	embeddedVariant: _dropEmbeddedVariant,
	...rest
}: GroupSummary): ModelGroupSummary {
	return rest;
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

	// Lance embutido: o % EMBUTIDO vem do teto REAL da oferta
	// (embeddedBidAcceptancePercentage), NUNCA do lancePercent. FIX-30: lancePercent
	// é o bidPercentage = lance TOTAL necessário (74,43% na ÂNCORA de jun/2026 =
	// 59.544/80.000); reusá-lo como % embutido punha "embutido de 74%" (impossível,
	// teto comercial ~30%) na mesma tela que "recebe a carta cheia". Sem teto real →
	// default histórico (30); o card OMITE a seção quando o recebido não fecha
	// (receivedCredit = carta cheia) — coerência server + UI.
	// Decisão Kairo 2026-06-12 (encerrou as perguntas 7/8 da proposta-simulador):
	// NÃO consultamos a AGX sobre semântica — rótulo LITERAL do campo + o
	// guardrail de coerência abaixo é a política permanente. Não exibir
	// "% embutido" + "recebido" juntos quando os números não fecham.
	const embeddedPercent = parseBeviAcceptPercent(offer.embeddedBidAcceptancePercentage) ?? 30;
	const embeddedBidValue = round2(offer.embeddedBid ?? (offer.finalValue * embeddedPercent) / 100);
	const receivedCredit = round2(offer.receivedCredit ?? offer.finalValue - embeddedBidValue);
	// FIX-8: dado REAL ou null — sem fallback heurístico (43% era inventado,
	// fere o PROIBIDO-mock) e sem deixar 0 explícito vazar ("Lance estimado
	// p/ contemplar R$ 0,00" na tela = informação enganosa). A UI OMITE a
	// linha quando null.
	const necessaryBidToContemplate =
		offer.necessaryBidToContemplate && offer.necessaryBidToContemplate > 0
			? round2(offer.necessaryBidToContemplate)
			: null;

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
		embeddedBid: {
			percent: embeddedPercent,
			embeddedBidValue,
			receivedCredit,
			necessaryBidToContemplate,
		},
		expectedAdjustment: {
			index: mapAdjustmentIndex(offer.adjustmentType),
			// A oferta não traz o % anual do índice; usamos premissa conservadora
			// por índice (média histórica), rotulada como estimativa.
			annualPercent: mapAdjustmentIndex(offer.adjustmentType) === "INCC" ? 6 : 4.5,
		},
	};
}

// FIX-228 (docs/02-cards-novos.md CARD 1 — embedded_bid): "esse card sempre
// diz que o crédito recebido diminui. Não é opcional — é o que separa
// consultoria de venda enganosa." Mesmo padrão de coerção server-side de
// recommendation-payload.ts/dial-payload.ts: os números vêm da oferta REAL
// ancorada no turno (offerSnapshotFromArtifact); a LLM só escolhe o grupo.

import type { RecommendedOfferSnapshot } from "./dial-payload";

// `maxEmbutidoPct` segue a convenção JÁ estabelecida no codebase (0-100, ver
// contemplation-dial.ts DEFAULT_MAX_EMBUTIDO_PCT e SimulationResultPayload
// .embeddedBid.percent) — não a fração 0-1 do handoff original.
const DEFAULT_MAX_EMBUTIDO_PCT = 30;

// FIX-366 (bloco-i, campanha vendedor-matador-consorcio, ITEM 4): o disclaimer
// só explicava o lado "crédito diminui" — faltava o lado que faz o cliente SEM
// aporte hoje topar (o pedido literal do Kairo): a parcela fica ALTA até
// contemplar, mas CAI depois porque o lance total (embutido + eventual
// dinheiro) amortiza o saldo — mesma mecânica do dial (contemplation-dial.ts,
// paymentAfterContemplation), aqui só o texto qualitativo que ancora a
// explicação do modelo. Números exatos de antes/depois seguem vindo do dial;
// este card não os recalcula (evita 2 fontes divergentes do mesmo dado).
const EMBEDDED_BID_DISCLAIMER =
	"O embutido sai da carta, então o crédito recebido diminui — mas ele antecipa a contemplação, " +
	"e o lance (embutido + eventual dinheiro) amortiza o saldo depois dela: a parcela segue normal " +
	"até contemplar e cai na sequência. Por isso, mesmo recebendo menos crédito agora, ainda pode " +
	"valer a pena. Estimativa a partir dos dados da oferta.";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Coage o payload do `embedded_bid`: os números vêm da oferta real ancorada
 * no turno — a LLM não os digita. O disclaimer é SEMPRE o texto fixo (regra
 * dura: "o crédito recebido diminui" nunca é opcional). */
export function coerceEmbeddedBidPayload(
	input: Record<string, unknown>,
	offer: RecommendedOfferSnapshot | null | undefined,
	/** O que o cliente precisa RECEBER — o preço do bem que ele quer comprar. */
	valorDoBem?: number,
): Record<string, unknown> {
	if (!offer) {
		return { ...input, disclaimer: EMBEDDED_BID_DISCLAIMER };
	}
	const maxEmbutidoPct = offer.maxEmbutidoPct ?? DEFAULT_MAX_EMBUTIDO_PCT;
	const creditValue = offer.creditValue;
	const embeddedBidValue = round2((maxEmbutidoPct / 100) * creditValue);
	const netCredit = round2(creditValue - embeddedBidValue);
	return {
		maxEmbutidoPct,
		creditValue,
		embeddedBidValue,
		netCredit,
		valorDoBem,
		// A conta que separa vendedor de folheto: o embutido sai DA PRÓPRIA carta
		// (Res. BCB 285/2023, art. 13), então quem quer receber R$ X e não tem
		// dinheiro pro lance NÃO deve mirar uma carta de R$ X — tem que mirar
		// `X / (1 - pct)`, senão contempla e falta dinheiro pra comprar o bem.
		cartaNecessaria:
			valorDoBem && maxEmbutidoPct < 100
				? Math.round(valorDoBem / (1 - maxEmbutidoPct / 100))
				: undefined,
		disclaimer: EMBEDDED_BID_DISCLAIMER,
	};
}

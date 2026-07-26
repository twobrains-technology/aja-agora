// FIX-377 — piso de crédito, verificado ANTES de virar chamada à Bevi.
//
// A Bevi tem um mínimo por segmento e devolve `MinCreditError` quando o valor
// não alcança (bevi-errors.ts). O problema é o que acontecia com o retorno
// VAZIO no caminho do grafo: `discovery.ts` devolvia `{ events: [] }` em
// silêncio e, de propósito, sem marcar `searchDispatched` — "retry liberado num
// turno seguinte". Sem limite e sem sinal, o retry virava LOOP: o modelo nunca
// recebia resultado nem aviso de falha, então prometia a busca de novo, e de
// novo (visto ao vivo com um cliente que disse "100 reais", 2026-07-26).
//
// Aqui a faixa impossível é barrada antes: não gasta chamada, e o funil volta a
// pedir o valor em vez de prometer.
//
// Decisão de produto (Kairo, 2026-07-26): validar antes de chamar a API.

/** Piso conservador, espelha `DEFAULT_CREDIT_FLOOR` do adapter Bevi
 * (bevi-self-contract-adapter.ts) — abaixo disso nenhum segmento devolve
 * grupo. É um piso GERAL: a Bevi pode exigir mais em alguns segmentos, e é por
 * isso que `MinCreditError.minCredit` (o número REAL, quando ela responde)
 * tem precedência sobre este default. */
export const CREDITO_MINIMO_PADRAO = 15_000;

/**
 * O valor-alvo é buscável? `false` = nem vale a chamada.
 *
 * `minimoConhecido` é o piso que a Bevi já informou nesta conversa
 * (`MinCreditError.minCredit`). Quando existe, manda — é dado real da
 * administradora, não estimativa nossa.
 */
export function creditoBuscavel(creditMax: number | undefined, minimoConhecido?: number): boolean {
	if (creditMax === undefined) return false;
	const piso = minimoConhecido ?? CREDITO_MINIMO_PADRAO;
	return creditMax >= piso;
}

/** O piso que vale pra esta conversa — o que a Bevi disse, ou o default. */
export function pisoDeCredito(minimoConhecido?: number): number {
	return minimoConhecido ?? CREDITO_MINIMO_PADRAO;
}

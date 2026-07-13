/**
 * Implementação de referência — computeContemplationDial (corrigida)
 * Substitui a curva hiperbólica de contemplation-dial.ts:89-96.
 *
 * MANTÉM: modelo AMORTIZA (FIX-221), faixa <8% → sorteio, composição embutido/bolso.
 * MUDA:   a curva do lance necessário.
 * REMOVE: likelihood (heurística sem base de dado).
 * NÃO FAZ: redução de prazo (fora de escopo).
 */

const CURVE_K = 1.6; // curvatura — ajustável, não mágica

export type ContemplationDialInput = {
  creditValue: number;        // finalValue (Trilho B)
  termMonths: number;         // term
  monthlyPayment: number;     // installmentValue
  averageBid: number;         // averageBid — VALOR ABSOLUTO desta oferta
  referenceMonth: number;     // mês do lance histórico (Pendência P5; hoje = anchorMonth)
  maxEmbutidoPct: number;     // default 0.30
  targetMonth: number;        // posição escolhida na agulha
  admFeePct?: number;         // adminFee — pode faltar no Trilho A
};

export type ContemplationDialOutput = {
  targetMonth: number;
  requiredLancePct: number;
  requiredLanceValue: number;
  mode: "lance" | "sorteio";
  embeddedBidValue: number;
  ownCashValue: number;
  netCredit: number;
  paymentAfterContemplation: number;
  admSobreEmbutido?: number;
  disclaimer: string;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function computeContemplationDial(i: ContemplationDialInput): ContemplationDialOutput {
  const { creditValue, termMonths, monthlyPayment, averageBid,
          referenceMonth, maxEmbutidoPct, targetMonth, admFeePct } = i;

  // posição normalizada no prazo: 0 no mês 1, 1 no fim
  const p = (m: number) => (m - 1) / (termMonths - 1);

  // 1) CURVA — calibrada no ponto real da oferta, converge a zero no fim do prazo.
  //    winningBidPct é derivado POR OFERTA. Nunca % fixo entre cartas diferentes.
  const winningBidPct = averageBid / creditValue;
  const L0 = winningBidPct / Math.pow(1 - p(referenceMonth), CURVE_K);

  const requiredLancePct = clamp(L0 * Math.pow(1 - p(targetMonth), CURVE_K), 0, 0.9);
  const requiredLanceValue = requiredLancePct * creditValue;

  // 2) modo (agora emerge naturalmente perto do fim do prazo)
  const mode: "lance" | "sorteio" = requiredLancePct < 0.08 ? "sorteio" : "lance";

  // 3) composição do lance — embutido sai da carta, resto do bolso
  const embeddedBidValue = Math.min(requiredLanceValue, creditValue * maxEmbutidoPct);
  const ownCashValue     = Math.max(0, requiredLanceValue - embeddedBidValue);
  const netCredit        = creditValue - embeddedBidValue;

  // 4) AMORTIZA — o lance INTEIRO abate o saldo devedor (FIX-221, mantido)
  const rem              = Math.max(1, termMonths - targetMonth);
  const remainingBalance = monthlyPayment * rem;
  const balanceAfter     = Math.max(0, remainingBalance - requiredLanceValue);
  const paymentAfterContemplation = clamp(balanceAfter / rem, 0, monthlyPayment);
  // NOTA: não derivar redução de prazo. Fora de escopo (D7).

  // 5) custo escondido do embutido — taxa de adm incide sobre a carta cheia
  const admSobreEmbutido = admFeePct !== undefined
    ? embeddedBidValue * admFeePct
    : undefined; // Trilho A: adminFee ausente → omitir a linha, NÃO estimar

  return {
    targetMonth, requiredLancePct, requiredLanceValue, mode,
    embeddedBidValue, ownCashValue, netCredit, paymentAfterContemplation,
    admSobreEmbutido,
    disclaimer: "Estimativa a partir dos dados da oferta. Contemplação por lance ou sorteio não é garantida.",
  };
}

/**
 * Âncora de dinheiro — em que mês o dinheiro do cliente alcança o BOLSO necessário.
 * Atenção: compara contra ownCashValue, não contra o lance total.
 * O embutido não sai do bolso do cliente.
 */
export function anchorMonth(
  i: Omit<ContemplationDialInput, "targetMonth">,
  money: { initial: number; monthlySavings: number },
): number | null {
  for (let m = 1; m <= i.termMonths; m++) {
    const { ownCashValue } = computeContemplationDial({ ...i, targetMonth: m });
    const have = money.initial + money.monthlySavings * (m - 1);
    if (have >= ownCashValue) return m;
  }
  return null; // não alcança dentro do prazo → orientar sorteio
}

/**
 * GUARDRAIL D6 — o crédito líquido nunca pode ficar abaixo do bem desejado.
 * Usar como filtro em recommendation.ts quando a estratégia envolver embutido.
 */
export function respectsNetCreditGuardrail(
  creditValue: number, maxEmbutidoPct: number, valorDoBem: number,
): boolean {
  const netCredit = creditValue - creditValue * maxEmbutidoPct;
  return netCredit >= valorDoBem;
}

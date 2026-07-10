// Simulador-agulha — motor de cálculo do trade-off de contemplação.
//
// A "agulha" do Bernardo: o usuário escolhe QUANDO quer ser contemplado (mês-alvo)
// e o componente mostra a RECEITA pra chegar lá. A mecânica real do consórcio (os
// "truques"):
//   • Contemplação = sorteio (sorte) OU lance (maior lance vence a vaga do mês).
//   • Lance embutido: usa até ~30% da própria carta como lance (sem dinheiro no
//     bolso), MAS o crédito líquido cai (carta − embutido).
//   • Lance próprio: dinheiro que você traz, por cima do embutido.
//   • Quanto MAIS CEDO você quer contemplar, MAIOR o lance necessário (e/ou menos
//     crédito líquido). "Sem pressa" = conta com o sorteio, lance opcional.
//
// É um MODELO HEURÍSTICO transparente (premissas abaixo), não um oráculo. Quem
// projeta contemplação tem que deixar UMA ressalva discreta de que é estimativa
// (CDC art. 30/37) — mas sem repetir em cada número.

// ── Premissas (documentadas, revisáveis) ─────────────────────────────────────
// FIX-225: teto do lance sobe de 80% → 90% (spec docs/03-regras-calculo.md) — a
// curva power calibrada não achata mais nos meses iniciais, então o teto vira
// uma trava de segurança rara, não o comportamento normal da região útil.
const MAX_LANCE_PCT = 90;
const DEFAULT_MAX_EMBUTIDO_PCT = 30; // teto típico do lance embutido
const DEFAULT_WINNING_BID_PCT = 40; // lance vencedor "típico" quando não há sinal do grupo
/** Abaixo disso, o lance é opcional — a contemplação vem mais do sorteio. */
const SORTEIO_THRESHOLD_PCT = 8;
/** Curvatura da power curve (FIX-225) — ajustável, não mágica. */
const CURVE_K = 1.6;

export type DialMode = "lance" | "sorteio";

export interface ContemplationDialInput {
	creditValue: number; // carta R$
	termMonths: number; // prazo do grupo
	targetMonth: number; // a agulha (quando quer contemplar)
	/** FIX-225: lance médio da oferta em R$ ABSOLUTO (ex.: `averageBid` da Bevi).
	 * Fonte preferencial pra derivar `winningBidPct` — POR OFERTA, nunca %
	 * fixo reaproveitado de outra carta. Quando ausente, cai pro legado
	 * `historicalWinningBidPct`. */
	averageBid?: number;
	/** Legado: lance vencedor típico do grupo (% da carta). Usado só quando
	 * `averageBid` está ausente (retrocompat de chamadores que ainda não
	 * migraram pro valor absoluto). */
	historicalWinningBidPct?: number;
	/** FIX-C1 (auditoria 2026-06-11): mês em que o lance de referência VENCE,
	 * vindo da oferta REAL (probContemplacaoMeses da Bevi). Quando presente, a
	 * curva é calibrada nesse par (lance%, mês) — no mês de referência o dial
	 * mostra EXATAMENTE o lance da oferta, igual ao card de simulação. Ausente
	 * → âncora heurística de 25% do prazo (comportamento anterior). */
	referenceMonth?: number;
	/** Parcela base (pra mostrar o impacto da diluição). */
	monthlyPayment?: number;
	/** Teto do lance embutido aceito pelo grupo (default 30%). */
	maxEmbutidoPct?: number;
	/** FIX-225: taxa de administração (%, 0-100) — incide sobre a carta cheia,
	 * inclusive o embutido que o cliente não recebe. Ausente no Trilho A
	 * (D11: nunca fabricar) → `admSobreEmbutido` sai `undefined`. */
	admFeePct?: number;
}

export interface ContemplationDialResult {
	targetMonth: number;
	mode: DialMode;
	requiredLancePct: number; // 0–90
	requiredLanceValue: number; // R$
	embeddedBidPct: number; // parte via carta (≤ maxEmbutido)
	embeddedBidValue: number; // R$
	ownCashPct: number; // parte em dinheiro
	ownCashValue: number; // R$
	receivedCredit: number; // carta − embutido
	/** FIX-C4: parcela estimada APÓS a contemplação — só o lance em DINHEIRO
	 * abate o saldo (o embutido reduz o crédito recebido, não a dívida).
	 * Até a contemplação vale a parcela real do grupo. Undefined quando não há
	 * monthlyPayment ou a contemplação cai no último mês. */
	paymentAfterContemplation?: number;
	/** FIX-225: custo escondido do embutido (taxa de adm sobre a parte
	 * embutida). `undefined` quando `admFeePct` não foi informado (Trilho A). */
	admSobreEmbutido?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function computeContemplationDial(input: ContemplationDialInput): ContemplationDialResult {
	// BUG-DIAL-NAN (auditoria Opus 2026-06-28): blinda a fronteira contra input fora
	// de contrato (NaN/não-finito — ex.: Math.max(0, NaN) === NaN a montante). Sem
	// isso, requiredLanceValue/embeddedBidValue vazavam NaN → "R$ NaN" na tela.
	const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);
	const carta = Math.max(0, finite(input.creditValue, 0));
	const term = Math.max(1, Math.round(finite(input.termMonths, 1)));
	const targetMonth = clamp(Math.round(finite(input.targetMonth, 1)), 1, term);
	const maxEmbutido = clamp(
		finite(input.maxEmbutidoPct ?? DEFAULT_MAX_EMBUTIDO_PCT, DEFAULT_MAX_EMBUTIDO_PCT),
		0,
		100,
	);

	// FIX-225: winningBidPct (fração 0-1) é derivado POR OFERTA — nunca % fixo
	// reaproveitado de outra carta. `averageBid` (R$ absoluto) tem precedência;
	// sem ele, cai pro legado `historicalWinningBidPct` (%, retrocompat).
	const averageBid = finite(input.averageBid ?? Number.NaN, Number.NaN);
	const winningBidPctRaw =
		Number.isFinite(averageBid) && carta > 0
			? averageBid / carta
			: finite(input.historicalWinningBidPct ?? DEFAULT_WINNING_BID_PCT, DEFAULT_WINNING_BID_PCT) /
				100;
	const winningBidPct = clamp(winningBidPctRaw, 0.05, MAX_LANCE_PCT / 100);

	// Mês de referência onde o lance de referência contempla. FIX-C1: quando a
	// oferta REAL informa o par (lance%, mês) — probContemplacaoMeses da Bevi —
	// a curva é calibrada nele e dial == card. Sem dado real, âncora heurística
	// de 25% do prazo (comportamento legado preservado).
	const refRaw = Math.round(finite(input.referenceMonth ?? 0, 0));
	const anchorMonthRaw =
		refRaw >= 1 ? clamp(refRaw, 1, term) : clamp(Math.round(term * 0.25), 4, term);
	// FIX-225: clampa a `term-1` (quando term>1) pra nunca zerar o denominador
	// `(1-p(refMonth))` da calibração — referência no último mês é degenerado.
	const anchorMonth = term > 1 ? Math.min(anchorMonthRaw, term - 1) : 1;

	// FIX-225 (spec docs/03-regras-calculo.md): curva power calibrada — passa
	// exatamente por (anchorMonth, winningBidPct) e tende a zero no fim do
	// prazo (o modo sorteio emerge sozinho, sem taper artificial).
	const p = (m: number) => (term > 1 ? (m - 1) / (term - 1) : 0);
	const L0 = winningBidPct / (1 - p(anchorMonth)) ** CURVE_K;
	const requiredLancePctFraction = clamp(
		L0 * (1 - p(targetMonth)) ** CURVE_K,
		0,
		MAX_LANCE_PCT / 100,
	);
	const requiredLancePct = Math.round(finite(requiredLancePctFraction, 0) * 100);

	const mode: DialMode = requiredLancePct <= SORTEIO_THRESHOLD_PCT ? "sorteio" : "lance";

	const embeddedBidPct = Math.min(requiredLancePct, maxEmbutido);
	const ownCashPct = Math.max(0, requiredLancePct - embeddedBidPct);

	const embeddedBidValue = round2((carta * embeddedBidPct) / 100);
	const ownCashValue = round2((carta * ownCashPct) / 100);
	const requiredLanceValue = round2((carta * requiredLancePct) / 100);
	const receivedCredit = round2(carta - embeddedBidValue);

	// FIX-221 (Ata 2026-07-04, AMORTIZA — inverte o FIX-C4/D18 antigo): até a
	// contemplação a parcela é a REAL do grupo. Depois dela, o lance TOTAL —
	// dinheiro (ownCashValue) + embutido (embeddedBidValue) — amortiza o saldo
	// restante. Decisão do stakeholder (ex.: 6.800 → ~800 após o lance);
	// ⚠️ PENDENTE-Bernardo validar o número exato antes de prod. Modelo antigo
	// (parcela × (1 − lance%)) era fantasia dupla: contava o embutido como
	// abatimento e aplicava o desconto desde o mês 1 — este AINDA não é isso,
	// o desconto só vale a partir da contemplação.
	let paymentAfterContemplation: number | undefined;
	if (input.monthlyPayment != null && input.monthlyPayment > 0 && targetMonth < term) {
		const remainingMonths = term - targetMonth;
		const remainingBalance =
			input.monthlyPayment * remainingMonths - (ownCashValue + embeddedBidValue);
		paymentAfterContemplation = round2(Math.max(0, remainingBalance) / remainingMonths);
	}

	// FIX-225: custo escondido do embutido — taxa de adm incide sobre a carta
	// cheia, inclusive sobre o embutido que o cliente não recebe. Ausente no
	// Trilho A (sem admFeePct) → omite a linha, nunca estima (D11).
	const admFeePct = input.admFeePct;
	const admSobreEmbutido =
		admFeePct != null && Number.isFinite(admFeePct)
			? round2(embeddedBidValue * (admFeePct / 100))
			: undefined;

	return {
		targetMonth,
		mode,
		requiredLancePct,
		requiredLanceValue,
		embeddedBidPct,
		embeddedBidValue,
		ownCashPct,
		ownCashValue,
		receivedCredit,
		paymentAfterContemplation,
		admSobreEmbutido,
	};
}

/**
 * FIX-227 — âncora de dinheiro: em que mês o DINHEIRO do cliente alcança o
 * lance necessário. A agulha responde "quando o seu dinheiro alcança", não
 * "quando você quer" — a comparação é contra o BOLSO (`ownCashValue`), nunca
 * contra o lance total (o embutido não sai do bolso do cliente). Mesma função
 * serve web (visual) e WhatsApp (narração) — cálculo único, duas apresentações.
 *
 * FGTS (vertical imóvel): conta como fonte de lance embutido (vai direto ao
 * vendedor) — abate o BOLSO necessário antes da comparação, sem entrar em
 * `requiredLanceValue`/`embeddedBidValue` (que descrevem só a mecânica
 * carta/embutido do grupo). É o maior acelerador da vertical imóvel.
 */
export function anchorMonth(
	base: Omit<ContemplationDialInput, "targetMonth">,
	money: { initial: number; monthlySavings: number; fgts?: number },
): number | null {
	const term = Math.max(1, Math.round(Number.isFinite(base.termMonths) ? base.termMonths : 1));
	const fgts = Math.max(0, Number.isFinite(money.fgts ?? 0) ? (money.fgts ?? 0) : 0);
	for (let m = 1; m <= term; m++) {
		const dial = computeContemplationDial({ ...base, targetMonth: m });
		const bolsoNecessario = Math.max(0, dial.ownCashValue - fgts);
		const disponivel = money.initial + money.monthlySavings * (m - 1);
		if (disponivel >= bolsoNecessario) return m;
	}
	return null;
}

/** Marcos pré-calculados (pro fallback estático do WhatsApp, que não tem slider). */
export function contemplationDialMarks(
	base: Omit<ContemplationDialInput, "targetMonth">,
	months: number[] = [3, 6, 12, 24],
): ContemplationDialResult[] {
	return months
		.filter((m) => m <= base.termMonths)
		.map((targetMonth) => computeContemplationDial({ ...base, targetMonth }));
}

/** FIX-221 (inbox 2026-07-02-dial-parcela-apos-lance-identica): o rótulo
 * "menor, depois do lance" era hardcoded — com lance 100% embutido a parcela
 * pós-contemplação podia sair IDÊNTICA à de antes, mas o rótulo prometia
 * "menor" mesmo assim (contradição visível). Fonte única do rótulo — nunca
 * mente: só diz "menor" quando o número de fato caiu. */
export function paymentAfterLabel(
	paymentAfterContemplation: number | undefined,
	paymentBefore: number,
): string {
	if (paymentAfterContemplation == null) return "estimativa após a contemplação";
	if (paymentAfterContemplation < paymentBefore) return "menor, depois do lance";
	return "sem alteração — sem lance a abater até aqui";
}

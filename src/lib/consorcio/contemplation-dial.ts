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
const MAX_BID_PCT = 80; // teto realista de lance
const DEFAULT_MAX_EMBUTIDO_PCT = 30; // teto típico do lance embutido
const DEFAULT_WINNING_BID_PCT = 40; // lance vencedor "típico" quando não há sinal do grupo
/** Abaixo disso, o lance é opcional — a contemplação vem mais do sorteio. */
const SORTEIO_THRESHOLD_PCT = 8;

export type DialMode = "lance" | "sorteio";
export type DialLikelihood = "alta" | "media" | "baixa";

export interface ContemplationDialInput {
	creditValue: number; // carta R$
	termMonths: number; // prazo do grupo
	targetMonth: number; // a agulha (quando quer contemplar)
	/** Lance vencedor típico do grupo (% da carta), da oferta rica da Descoberta. */
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
}

export interface ContemplationDialResult {
	targetMonth: number;
	mode: DialMode;
	requiredLancePct: number; // 0–80
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
	likelihood: DialLikelihood;
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
		MAX_BID_PCT,
	);
	const winningBid = clamp(
		finite(input.historicalWinningBidPct ?? DEFAULT_WINNING_BID_PCT, DEFAULT_WINNING_BID_PCT),
		5,
		MAX_BID_PCT,
	);

	// Mês de referência onde o lance de referência contempla. FIX-C1: quando a
	// oferta REAL informa o par (lance%, mês) — probContemplacaoMeses da Bevi —
	// a curva é calibrada nele e dial == card. Sem dado real, âncora heurística
	// de 25% do prazo. Antes do mês de referência exige mais lance; depois, menos.
	const refRaw = Math.round(finite(input.referenceMonth ?? 0, 0));
	const anchorMonth =
		refRaw >= 1 ? clamp(refRaw, 1, term) : clamp(Math.round(term * 0.25), 4, term);
	const raw = winningBid * (anchorMonth / targetMonth);
	// Taper tardio: quanto mais perto do fim do grupo, mais o sorteio basta sozinho
	// e o lance necessário tende a zero (taper=1 até o mês de referência, 0 no fim).
	const lateTaper = clamp((term - targetMonth) / Math.max(1, term - anchorMonth), 0, 1);
	const requiredLancePct = clamp(Math.round(raw * lateTaper), 0, MAX_BID_PCT);

	const mode: DialMode = requiredLancePct <= SORTEIO_THRESHOLD_PCT ? "sorteio" : "lance";

	const embeddedBidPct = Math.min(requiredLancePct, maxEmbutido);
	const ownCashPct = Math.max(0, requiredLancePct - embeddedBidPct);

	const embeddedBidValue = round2((carta * embeddedBidPct) / 100);
	const ownCashValue = round2((carta * ownCashPct) / 100);
	const requiredLanceValue = round2((carta * requiredLancePct) / 100);
	const receivedCredit = round2(carta - embeddedBidValue);

	// FIX-C4: até a contemplação a parcela é a REAL do grupo. Depois dela, só o
	// lance em DINHEIRO abate o saldo restante (o embutido sai da carta — reduz
	// o crédito recebido, não a dívida). Modelo antigo (parcela × (1 − lance%))
	// era fantasia dupla: contava o embutido como abatimento e aplicava o
	// desconto desde o mês 1.
	let paymentAfterContemplation: number | undefined;
	if (input.monthlyPayment != null && input.monthlyPayment > 0 && targetMonth < term) {
		const remainingMonths = term - targetMonth;
		const remainingBalance = input.monthlyPayment * remainingMonths - ownCashValue;
		paymentAfterContemplation = round2(Math.max(0, remainingBalance) / remainingMonths);
	}

	// Probabilidade qualitativa: dá pra fazer só com a carta? (sem dinheiro novo)
	const likelihood: DialLikelihood =
		requiredLancePct <= maxEmbutido ? "alta" : requiredLancePct <= 50 ? "media" : "baixa";

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
		likelihood,
	};
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

// FIX-3 (visão do Kairo, design aprovado 2026-06-05) — engine do componente
// "Planeje sua conquista" do PASSO 2 (gate credit): 4 indicadores interligados
// (valor do bem · quando quer usar · parcela mensal · lance disponível) + opt-in
// de lance embutido. Mexeu num indicador → os outros se ajustam.
//
// MODO "ESTIMATIVA DE MERCADO": neste ponto da jornada a Bevi ainda NÃO pode
// simular (exige CPF+LGPD — gate identify vem depois, D1). Os números daqui
// são EXPECTATIVA com premissas documentadas e SEMPRE exibidos com o selo
// "estimativa — valores reais virão da busca". Os dados REAIS chegam no
// reveal (descoberta Bevi) e no simulador do passo 4 (que usa a oferta ativa,
// FIX-6). NUNCA apresentar estes números como dado de administradora.
//
// Reusa o motor heurístico do dial (computeContemplationDial — premissas
// transparentes de lance/contemplação) por cima de prazo/taxa TÍPICOS da
// categoria (pontos médios dos ranges de mercado usados no scoring).

import type { Category } from "@/lib/agent/personas";
import { computeContemplationDial, type DialLikelihood } from "./contemplation-dial";

// ── Premissas de mercado por categoria (documentadas, revisáveis) ────────────
// Prazo típico de grupo (meses) e taxa de administração típica (ponto médio do
// range usado em recommendation.adminFeeScore). Fonte: prática de mercado.
const TYPICAL_TERM_MONTHS: Record<Category, number> = {
	imovel: 200,
	auto: 80,
	moto: 72,
	servicos: 40,
};

const TYPICAL_ADMIN_FEE_PCT: Record<Category, number> = {
	imovel: 18.5,
	auto: 15,
	moto: 17,
	servicos: 17.5,
};

export interface PlanEstimateInput {
	category: Category;
	/** Valor do bem que o usuário quer (R$). */
	assetValue: number;
	/** Quando ele quer usar o valor (mês-alvo da contemplação). */
	targetMonth: number;
	/** Parcela que ele consegue pagar (R$/mês). Quando dada, o prazo estimado
	 * se ajusta a ela (interligação parcela↔prazo). */
	monthlyBudget?: number;
	/** Lance que ele consegue dar do bolso (R$). 0/ausente = sem lance. */
	lanceValue?: number;
	/** Quer considerar lance embutido (usa parte da carta como lance). */
	lanceEmbutido?: boolean;
}

export interface PlanEstimate {
	/** Prazo estimado do plano (meses) — típico da categoria, ou derivado da
	 * parcela quando o usuário a definiu. */
	termMonths: number;
	/** Parcela estimada (R$/mês) pro prazo acima. */
	monthlyPayment: number;
	/** Lance estimado pra contemplar no mês-alvo (% da carta e R$). */
	requiredLancePct: number;
	requiredLanceValue: number;
	/** Quanto sai da própria carta (lance embutido) e quanto do bolso. */
	embeddedBidValue: number;
	ownCashNeeded: number;
	/** O lance disponível declarado cobre a parte do bolso? */
	lanceCoberto: boolean;
	/** FIX-18: a parcela declarada fecha o valor do bem dentro do prazo máximo
	 * realista? `false` = combinação inviável (parcela baixa demais pro bem). */
	budgetFeasible: boolean;
	/** FIX-18: maior valor de bem que CABE na parcela declarada no prazo máximo
	 * realista — orientação pro confronto ("com R$ X/mês o bem viável é ~R$ Y").
	 * Igual a `assetValue` quando não há parcela declarada (nada a confrontar). */
	viableAssetForBudget: number;
	/** Valor que ele recebe se usar o embutido (carta − embutido). */
	receivedCredit: number;
	likelihood: DialLikelihood;
	/** Modo da contemplação no mês-alvo (lance necessário vs sorteio basta). */
	mode: "lance" | "sorteio";
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Parcela estimada pra um prazo: custo total típico (bem + taxa adm) diluído. */
function estimatePayment(assetValue: number, category: Category, termMonths: number): number {
	const total = assetValue * (1 + TYPICAL_ADMIN_FEE_PCT[category] / 100);
	return round2(total / Math.max(1, termMonths));
}

export function computePlanEstimate(input: PlanEstimateInput): PlanEstimate {
	const assetValue = Math.max(0, input.assetValue);
	const category = input.category;
	const typicalTerm = TYPICAL_TERM_MONTHS[category];
	// Teto realista de prazo (mesmo clamp usado na interligação parcela↔prazo).
	const maxTerm = typicalTerm * 1.5;
	const feeMult = 1 + TYPICAL_ADMIN_FEE_PCT[category] / 100;
	const total = assetValue * feeMult;

	const monthlyBudget = input.monthlyBudget && input.monthlyBudget > 0 ? input.monthlyBudget : 0;
	const hasBudget = monthlyBudget > 0;

	// Interligação parcela↔prazo: usuário definiu a parcela → o prazo estimado
	// é o necessário pra caber nela (clamp entre 12m e 1.5× o prazo típico).
	let termMonths = typicalTerm;
	if (hasBudget && assetValue > 0) {
		termMonths = Math.round(clamp(total / monthlyBudget, 12, maxTerm));
	}

	// FIX-18: a parcela declarada cabe no valor do bem dentro do prazo máximo
	// realista? Se o prazo necessário (total/parcela) estoura o teto, a combinação
	// é inviável — não existe grupo assim (jornada BB real: 250k a 1k/mês ≈ 24
	// anos). viableAssetForBudget = maior bem que CABE na parcela no prazo máximo
	// (orientação pro confronto, sem empurrar — decisão do Kairo: tom guia).
	const budgetFeasible = !hasBudget || assetValue <= 0 || total / monthlyBudget <= maxTerm;
	// floor (não round): o bem sugerido tem que CABER de fato na parcela — round
	// pra cima estouraria o teto por centavos e a sugestão se contradiria.
	const viableAssetForBudget = hasBudget
		? Math.floor((monthlyBudget * maxTerm) / feeMult)
		: assetValue;

	const monthlyPayment = estimatePayment(assetValue, category, termMonths);
	const targetMonth = clamp(Math.round(input.targetMonth), 1, termMonths);

	// Lance necessário pro mês-alvo — mesmo motor heurístico do dial do passo 4.
	const dial = computeContemplationDial({
		creditValue: assetValue,
		termMonths,
		targetMonth,
		monthlyPayment,
		maxEmbutidoPct: input.lanceEmbutido ? undefined : 0,
	});

	const ownCashNeeded = dial.ownCashValue;
	const lanceDisponivel = Math.max(0, input.lanceValue ?? 0);

	return {
		termMonths,
		monthlyPayment,
		requiredLancePct: dial.requiredLancePct,
		requiredLanceValue: dial.requiredLanceValue,
		embeddedBidValue: dial.embeddedBidValue,
		ownCashNeeded,
		lanceCoberto: dial.mode === "sorteio" || lanceDisponivel >= ownCashNeeded,
		budgetFeasible,
		viableAssetForBudget,
		receivedCredit: dial.receivedCredit,
		likelihood: dial.likelihood,
		mode: dial.mode,
	};
}

/** Teto do lance declarável: 80% do valor do bem (mesmo teto realista do
 * dial). QA-crítico P2: quando o usuário REDUZ o valor do bem, o lance
 * declarado precisa rebaixar pro teto novo — nunca fica acima. */
export function clampLanceToAsset(lanceValue: number, assetValue: number): number {
	const max = Math.round(Math.max(0, assetValue) * 0.8);
	return Math.min(Math.max(0, lanceValue), max);
}

export { TYPICAL_TERM_MONTHS, TYPICAL_ADMIN_FEE_PCT };

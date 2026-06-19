import type { Category, Objetivo } from "@/lib/agent/personas";

/**
 * Single source of truth for qualification ranges/buckets across channels.
 *
 * - **Web** uses `bounds` for sliders (continuous values).
 * - **WhatsApp** uses `buckets` for interactive lists (discrete choices).
 *
 * To change a range or add a new bucket: edit only this file.
 */

export type Bounds = {
	min: number;
	max: number;
	step: number;
	default: number;
};

export type Bucket = {
	token: string;
	title: string;
	desc?: string;
	min: number;
	max: number;
};

export type TimeframeOption = {
	token: string;
	title: string;
	desc: string;
	prazoMeses: number;
	/** Eixo Bevi derivado do prazo. Pressa => contemplacao_rapida; sem pressa => investimento. */
	objetivo: Objetivo;
};

// ---- Credit (valor do bem) ----

export const CREDIT_BOUNDS: Record<Category, Bounds> = {
	imovel: { min: 100_000, max: 2_000_000, step: 50_000, default: 400_000 },
	// FIX-54: teto elevado 300k → 500k (carros novos/premium passavam de 300k).
	// Alinha com `servicos` e cobre a faixa real sem virar irreal pra Bevi.
	auto: { min: 20_000, max: 500_000, step: 10_000, default: 80_000 },
	moto: { min: 8_000, max: 80_000, step: 1_000, default: 25_000 },
	servicos: { min: 10_000, max: 500_000, step: 10_000, default: 60_000 },
};

export type CreditClamp = {
	/** Valor ajustado pra dentro da faixa [min, max] da categoria. */
	value: number;
	/** true quando o valor original caiu fora da faixa (foi ajustado). */
	clamped: boolean;
	min: number;
	max: number;
};

/** FIX-33 — guardrail server-side do valor do bem na faixa da categoria. Os
 * sliders da UI já limitam por CREDIT_BOUNDS, mas o caminho de TEXTO LIVRE
 * ("quero uma carta de 5 milhões de auto") não tinha nada — passava cru até
 * morrer na Bevi (MinCreditError) ou retornar oferta absurda. Clampa pro teto/
 * piso da categoria e devolve a flag `clamped` + a faixa, pro agente confrontar
 * a realidade em vez de celebrar um valor que a administradora não entrega. */
export function clampCreditToCategory(credit: number, category: Category): CreditClamp {
	const { min, max } = CREDIT_BOUNDS[category];
	const value = Math.min(Math.max(credit, min), max);
	return { value, clamped: value !== credit, min, max };
}

export const CREDIT_BUCKETS: Record<Category, Bucket[]> = {
	imovel: [
		{ token: "200", title: "Até R$ 200 mil", desc: "Aptos compactos", min: 0, max: 200_000 },
		{
			token: "400",
			title: "R$ 200 a 400 mil",
			desc: "Aptos 2-3 quartos",
			min: 200_000,
			max: 400_000,
		},
		{
			token: "600",
			title: "R$ 400 a 600 mil",
			desc: "Casas, aptos maiores",
			min: 400_000,
			max: 600_000,
		},
		{
			token: "1000",
			title: "Acima de R$ 600 mil",
			desc: "Alto padrão, luxo",
			min: 600_000,
			max: 2_000_000,
		},
	],
	auto: [
		{ token: "50", title: "Até R$ 50 mil", desc: "Seminovos, populares", min: 0, max: 50_000 },
		{ token: "100", title: "R$ 50 a 100 mil", desc: "Populares, sedãs", min: 50_000, max: 100_000 },
		{
			token: "200",
			title: "R$ 100 a 200 mil",
			desc: "SUVs, premium",
			min: 100_000,
			max: 200_000,
		},
		{
			token: "300",
			title: "Acima de R$ 200 mil",
			desc: "Top de linha",
			min: 200_000,
			// FIX-54: acompanha o novo teto de auto (CREDIT_BOUNDS) — multicanal coerente.
			max: 500_000,
		},
	],
	moto: [
		{ token: "15", title: "Até R$ 15 mil", desc: "Entrada, custo benefício", min: 0, max: 15_000 },
		{ token: "30", title: "R$ 15 a 30 mil", desc: "Naked, scooter", min: 15_000, max: 30_000 },
		{
			token: "50",
			title: "R$ 30 a 50 mil",
			desc: "Trail, esportivas médias",
			min: 30_000,
			max: 50_000,
		},
		{
			token: "80",
			title: "Acima de R$ 50 mil",
			desc: "Big trail, esportiva",
			min: 50_000,
			max: 80_000,
		},
	],
	servicos: [
		{
			token: "30",
			title: "Até R$ 30 mil",
			desc: "Reformas simples, viagens",
			min: 0,
			max: 30_000,
		},
		{
			token: "100",
			title: "R$ 30 a 100 mil",
			desc: "Reformas médias, formaturas",
			min: 30_000,
			max: 100_000,
		},
		{
			token: "500",
			title: "Acima de R$ 100 mil",
			desc: "Grandes projetos",
			min: 100_000,
			max: 500_000,
		},
	],
};

// ---- Lance embutido (jornada do doc 2026-05-29) ----
//
// Quando o usuário tem reserva pra lance ("yes"), o doc manda educar sobre
// lance embutido e oferecer a opção de considerá-lo nas simulações. Decisão de
// design (D3): consolidamos a educação + opt-in num gate binário só, claro pra
// leigo. O percentual (Bevi aceita 30 ou 50) fica interno, default 30 — o valor
// mais comum na captura real do simulador Bevi.
export const LANCE_EMBUTIDO_DEFAULT_PERCENT = 30 as const;

export type LanceEmbutidoOption = {
	token: "yes" | "no";
	title: string;
	desc: string;
};

export const LANCE_EMBUTIDO_OPTIONS: LanceEmbutidoOption[] = [
	{
		token: "yes",
		title: "Sim, considerar lance embutido",
		desc: "Uso parte da carta como lance",
	},
	{
		token: "no",
		// FIX-4: rótulo neutro — o gate agora aparece TAMBÉM pra quem não tem
		// reserva ("recursos próprios" pressupunha dinheiro em mãos).
		title: "Não, prefiro sem lance embutido",
		desc: "Sigo sem usar a carta como lance",
	},
];

/** Deriva o eixo `objetivo` da Bevi a partir do prazo escolhido. Prazos longos
 * (>= 120 meses, "sem pressa, quero menor parcela") => investimento; o resto,
 * onde o usuário quer o bem logo => contemplacao_rapida. Fonte única pra web,
 * WhatsApp e extração de texto livre. */
export function objetivoForPrazo(prazoMeses: number): Objetivo {
	return prazoMeses >= 120 ? "investimento" : "contemplacao_rapida";
}

// ---- Valor do lance (docx passo 2: "Qual valor aproximado?") ----
//
// Faixas RELATIVAS ao crédito escolhido (10/20/30/40%+), com o valor absoluto
// no título — "aproximado" como o docx pede, e clicável nos dois canais
// (chips na web, lista no WhatsApp). token = valor médio da faixa em reais.

const fmtMil = (n: number) =>
	n >= 1_000_000
		? `R$ ${(n / 1_000_000).toFixed(1).replace(".", ",")} mi`
		: `R$ ${Math.round(n / 1000)} mil`;

export function lanceValueOptions(creditMax: number): Bucket[] {
	const pct = (p: number) => Math.round((creditMax * p) / 1000) * 1000;
	return [
		{
			token: String(pct(0.1)),
			title: `Até ${fmtMil(pct(0.1))}`,
			desc: "~10% da carta",
			min: 0,
			max: pct(0.1),
		},
		{
			token: String(pct(0.2)),
			title: `Uns ${fmtMil(pct(0.2))}`,
			desc: "~20% da carta",
			min: pct(0.1),
			max: pct(0.2),
		},
		{
			token: String(pct(0.3)),
			title: `Uns ${fmtMil(pct(0.3))}`,
			desc: "~30% da carta",
			min: pct(0.2),
			max: pct(0.3),
		},
		{
			token: String(pct(0.4)),
			title: `${fmtMil(pct(0.4))} ou mais`,
			desc: "40%+ da carta",
			min: pct(0.3),
			max: pct(0.5),
		},
	];
}

// ---- Monthly budget (parcela mensal) ----
// LEGADO do picker de 4 sliders. No picker novo (handoff, guiado por intenção) a
// parcela é RESULTADO, não input — estes bounds só servem ao caminho de texto livre.

export const MONTHLY_BOUNDS: Record<Category, Bounds> = {
	imovel: { min: 1_000, max: 15_000, step: 500, default: 3_000 },
	auto: { min: 300, max: 3_000, step: 100, default: 800 },
	moto: { min: 150, max: 1_500, step: 50, default: 500 },
	servicos: { min: 200, max: 2_000, step: 100, default: 500 },
};

// ---- Prazo do plano (handoff, re-UX por intenção) ----
// O usuário escolhe o prazo DIRETO num slider ("Em quantos meses quer pagar") e a
// parcela vira o resultado calmo (total / prazo). Ranges típicos de grupo por
// categoria (default = ponto típico de mercado, espelha TYPICAL_TERM_MONTHS).

export const TERM_BOUNDS: Record<Category, Bounds> = {
	imovel: { min: 120, max: 240, step: 12, default: 180 },
	auto: { min: 36, max: 100, step: 6, default: 72 },
	moto: { min: 24, max: 80, step: 6, default: 60 },
	servicos: { min: 12, max: 60, step: 6, default: 40 },
};

// ---- Intenção do "Planeje sua conquista" (segmented control do handoff) ----
// "O que mais importa pra você agora?" — dirige quais controles condicionais
// aparecem e o eixo `objetivo` da Bevi. Mapeia a pergunta "Em quanto tempo você
// quer o bem?" da jornada canônica num controle de prioridade, sem despejar 4
// sliders de uma vez.
export type PlanIntent = "parcela" | "rapido" | "lance";

/** Deriva o eixo `objetivo` da Bevi a partir da intenção escolhida. "Menor
 * parcela" = investimento (sem pressa); "receber rápido" e "tenho um lance"
 * miram contemplação acelerada. Fonte única do mapeamento intenção→objetivo. */
export function objetivoForIntent(intent: PlanIntent): Objetivo {
	return intent === "parcela" ? "investimento" : "contemplacao_rapida";
}

/** Prazo de contemplação (mês-alvo) IMPLÍCITO por intenção, quando o usuário não
 * escolhe um mês específico (só a intenção "receber rápido" coleta o mês exato no
 * slider). Preenche `prazoMeses` no qualifyAnswers pro funil PULAR o gate
 * timeframe — senão o agente re-pergunta "em quanto tempo você quer o bem?" logo
 * depois do usuário escolher a prioridade (quebra do híbrido vendedor).
 * "Menor parcela" = sem pressa (120m, eixo investimento); "tenho um lance" =
 * antecipar o quanto der (mais rápido possível). */
export function prazoMesesForIntent(intent: PlanIntent): number {
	return intent === "parcela" ? 120 : intent === "lance" ? 0 : 6;
}

// ---- Timeframe ----

// Jornada canônica do .docx (2026-05-29): 5 opções de prazo. Cada uma deriva o
// `objetivo` da Bevi (contemplacao_rapida × investimento), input nativo da simulação.
export const TIMEFRAME_OPTIONS: TimeframeOption[] = [
	{
		token: "0",
		title: "O mais rápido possível",
		desc: "Contemplação acelerada",
		prazoMeses: 0,
		objetivo: "contemplacao_rapida",
	},
	{
		token: "6",
		title: "Até 6 meses",
		desc: "Bem logo",
		prazoMeses: 6,
		objetivo: "contemplacao_rapida",
	},
	{
		token: "12",
		title: "1 ano",
		desc: "Curto prazo",
		prazoMeses: 12,
		objetivo: "contemplacao_rapida",
	},
	{
		token: "24",
		title: "2 anos ou mais",
		desc: "Médio prazo",
		prazoMeses: 24,
		objetivo: "contemplacao_rapida",
	},
	{
		token: "120",
		title: "Sem pressa, quero menor parcela",
		desc: "Parcela mais leve",
		prazoMeses: 120,
		objetivo: "investimento",
	},
];

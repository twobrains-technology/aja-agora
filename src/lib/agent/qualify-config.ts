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
	auto: { min: 20_000, max: 300_000, step: 10_000, default: 80_000 },
	moto: { min: 8_000, max: 80_000, step: 1_000, default: 25_000 },
	servicos: { min: 10_000, max: 500_000, step: 10_000, default: 60_000 },
};

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
			max: 300_000,
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

export const MONTHLY_BOUNDS: Record<Category, Bounds> = {
	imovel: { min: 1_000, max: 15_000, step: 500, default: 3_000 },
	auto: { min: 300, max: 3_000, step: 100, default: 800 },
	moto: { min: 150, max: 1_500, step: 50, default: 500 },
	servicos: { min: 200, max: 2_000, step: 100, default: 500 },
};

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

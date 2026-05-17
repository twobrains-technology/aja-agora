import type { Category } from "@/lib/agent/personas";

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
		{ token: "50", title: "R$ 30 a 50 mil", desc: "Trail, esportivas médias", min: 30_000, max: 50_000 },
		{ token: "80", title: "Acima de R$ 50 mil", desc: "Big trail, esportiva", min: 50_000, max: 80_000 },
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

// ---- Monthly budget (parcela mensal) ----

export const MONTHLY_BOUNDS: Record<Category, Bounds> = {
	imovel: { min: 1_000, max: 15_000, step: 500, default: 3_000 },
	auto: { min: 300, max: 3_000, step: 100, default: 800 },
	moto: { min: 150, max: 1_500, step: 50, default: 500 },
	servicos: { min: 200, max: 2_000, step: 100, default: 500 },
};

// ---- Timeframe ----

export const TIMEFRAME_OPTIONS: TimeframeOption[] = [
	{ token: "0", title: "Já! (com lance)", desc: "Quero contemplação rápida", prazoMeses: 0 },
	{ token: "24", title: "1 a 2 anos", desc: "Prazo curto", prazoMeses: 24 },
	{ token: "60", title: "3 a 5 anos", desc: "Prazo médio", prazoMeses: 60 },
	{ token: "120", title: "Sem pressa", desc: "Parcela mais leve", prazoMeses: 120 },
];

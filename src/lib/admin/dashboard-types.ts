/**
 * Dashboard API response types.
 * Shared between API route and UI components.
 */

import type { LeadStage } from "./lead-stages";

// ─── Funnel Stages (excludes "perdido" — it's a terminal state, not a funnel step) ──

export const FUNNEL_STAGES: { stage: Exclude<LeadStage, "perdido">; label: string }[] = [
	{ stage: "novo", label: "Novo" },
	{ stage: "engajado", label: "Engajado" },
	{ stage: "qualificado", label: "Qualificado" },
	{ stage: "em_negociacao", label: "Em Negociação" },
	{ stage: "proposta_enviada", label: "Proposta Enviada" },
	{ stage: "na_administradora", label: "Na Administradora" },
	{ stage: "aguardando_pagamento", label: "Aguardando Pagamento" },
	{ stage: "fechado_ganho", label: "Fechado Ganho" },
];

// ─── KPI Data ───────────────────────────────────────────────────────────────

export interface KpiData {
	totalLeads: number;
	leadsToday: number;
	avgFunnelDays: number;
	conversionRate: number;
	trends: {
		totalLeads: number;
		leadsToday: number;
		avgFunnelDays: number;
		conversionRate: number;
	};
}

// ─── Funnel Stage ───────────────────────────────────────────────────────────

export interface FunnelStage {
	stage: string;
	label: string;
	count: number;
	percentOfTotal: number;
	dropOffRate: number;
}

// ─── Daily Volume ───────────────────────────────────────────────────────────

export interface DailyVolume {
	date: string;
	count: number;
}

// ─── Channel Breakdown ──────────────────────────────────────────────────────

export interface ChannelBreakdown {
	channel: "web" | "whatsapp";
	count: number;
	percent: number;
}

// ─── Full Dashboard Response ────────────────────────────────────────────────

export interface DashboardResponse {
	kpis: KpiData;
	funnel_stages: FunnelStage[];
	daily_volume: DailyVolume[];
	channel_breakdown: ChannelBreakdown[];
}

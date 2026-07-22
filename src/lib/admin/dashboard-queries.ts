/**
 * Dashboard SQL aggregation queries.
 * All functions accept date range and return typed results.
 */

import { addDays, differenceInDays, format, subDays } from "date-fns";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import {
	type ChannelBreakdown,
	type DailyVolume,
	FUNNEL_STAGES,
	type FunnelStage,
	type KpiData,
} from "./dashboard-types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function trendPercent(current: number, previous: number): number {
	if (previous === 0) return current > 0 ? 100 : 0;
	return Math.round(((current - previous) / previous) * 100);
}

// Painéis comerciais não enxergam conversas/leads simulados (criados via /admin/simulator).
// Reutilizado em TODAS as queries deste arquivo. Se for removido por engano, métrica corrompe.
const realLeads = eq(leads.isSimulated, false);

// ─── KPIs ───────────────────────────────────────────────────────────────────

export async function computeKpis(fromDate: Date, toDate: Date): Promise<KpiData> {
	const periodLength = differenceInDays(toDate, fromDate) || 1;
	const prevFrom = subDays(fromDate, periodLength);
	const prevTo = subDays(toDate, periodLength);

	// Current period queries
	const [
		[totalResult],
		[todayResult],
		avgResult,
		convResult,
		// Previous period queries
		[prevTotalResult],
		[prevTodayResult],
		prevAvgResult,
		prevConvResult,
	] = await Promise.all([
		// --- Current period ---
		db
			.select({ count: count() })
			.from(leads)
			.where(and(realLeads, gte(leads.createdAt, fromDate), lte(leads.createdAt, toDate))),

		db
			.select({ count: count() })
			.from(leads)
			.where(
				and(realLeads, gte(leads.createdAt, sql`(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`)),
			),

		db.execute(sql`
      SELECT COALESCE(
        ROUND(AVG(EXTRACT(EPOCH FROM (le.created_at - l.created_at)) / 86400), 1),
        0
      ) as avg_days
      FROM leads l
      JOIN lead_events le ON le.lead_id = l.id
      WHERE l.created_at BETWEEN ${fromDate} AND ${toDate}
        AND l.is_simulated = false
        AND le.to_stage IN ('fechado_ganho', 'perdido')
    `),

		db.execute(sql`
      SELECT COALESCE(
        COUNT(*) FILTER (WHERE stage = 'fechado_ganho') * 100.0 / NULLIF(COUNT(*), 0),
        0
      ) as rate
      FROM leads
      WHERE created_at BETWEEN ${fromDate} AND ${toDate}
        AND is_simulated = false
    `),

		// --- Previous period ---
		db
			.select({ count: count() })
			.from(leads)
			.where(and(realLeads, gte(leads.createdAt, prevFrom), lte(leads.createdAt, prevTo))),

		db
			.select({ count: count() })
			.from(leads)
			.where(
				and(
					realLeads,
					gte(
						leads.createdAt,
						sql`((NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '1 day')::date`,
					),
					lte(leads.createdAt, sql`(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`),
				),
			),

		db.execute(sql`
      SELECT COALESCE(
        ROUND(AVG(EXTRACT(EPOCH FROM (le.created_at - l.created_at)) / 86400), 1),
        0
      ) as avg_days
      FROM leads l
      JOIN lead_events le ON le.lead_id = l.id
      WHERE l.created_at BETWEEN ${prevFrom} AND ${prevTo}
        AND l.is_simulated = false
        AND le.to_stage IN ('fechado_ganho', 'perdido')
    `),

		db.execute(sql`
      SELECT COALESCE(
        COUNT(*) FILTER (WHERE stage = 'fechado_ganho') * 100.0 / NULLIF(COUNT(*), 0),
        0
      ) as rate
      FROM leads
      WHERE created_at BETWEEN ${prevFrom} AND ${prevTo}
        AND is_simulated = false
    `),
	]);

	const totalLeads = totalResult.count;
	const leadsToday = todayResult.count;
	const avgRow = (avgResult as { rows: Array<Record<string, unknown>> }).rows?.[0] ?? avgResult;
	const avgFunnelDays = Number((avgRow as Record<string, unknown>).avg_days) || 0;
	const convRow = (convResult as { rows: Array<Record<string, unknown>> }).rows?.[0] ?? convResult;
	const conversionRate =
		Math.round((Number((convRow as Record<string, unknown>).rate) || 0) * 10) / 10;

	const prevTotal = prevTotalResult.count;
	const prevToday = prevTodayResult.count;
	const prevAvgRow =
		(prevAvgResult as { rows: Array<Record<string, unknown>> }).rows?.[0] ?? prevAvgResult;
	const prevAvg = Number((prevAvgRow as Record<string, unknown>).avg_days) || 0;
	const prevConvRow =
		(prevConvResult as { rows: Array<Record<string, unknown>> }).rows?.[0] ?? prevConvResult;
	const prevConv =
		Math.round((Number((prevConvRow as Record<string, unknown>).rate) || 0) * 10) / 10;

	return {
		totalLeads,
		leadsToday,
		avgFunnelDays,
		conversionRate,
		trends: {
			totalLeads: trendPercent(totalLeads, prevTotal),
			leadsToday: trendPercent(leadsToday, prevToday),
			avgFunnelDays: trendPercent(avgFunnelDays, prevAvg),
			conversionRate: trendPercent(conversionRate, prevConv),
		},
	};
}

// ─── Funnel Stages ──────────────────────────────────────────────────────────

export async function computeFunnelStages(fromDate: Date, toDate: Date): Promise<FunnelStage[]> {
	const rows = await db
		.select({ stage: leads.stage, count: count() })
		.from(leads)
		.where(and(realLeads, gte(leads.createdAt, fromDate), lte(leads.createdAt, toDate)))
		.groupBy(leads.stage);

	// Build a lookup map from query results
	const countByStage = new Map<string, number>();
	for (const row of rows) {
		countByStage.set(row.stage, row.count);
	}

	// Map into FUNNEL_STAGES order (excludes "perdido")
	const stages: FunnelStage[] = [];
	let firstCount = 0;
	let prevCount = 0;

	for (let i = 0; i < FUNNEL_STAGES.length; i++) {
		const { stage, label } = FUNNEL_STAGES[i];
		const stageCount = countByStage.get(stage) ?? 0;

		if (i === 0) {
			firstCount = stageCount;
			prevCount = stageCount;
		}

		const percentOfTotal = firstCount > 0 ? Math.round((stageCount / firstCount) * 1000) / 10 : 0;
		const dropOffRate =
			i === 0 || prevCount === 0
				? 0
				: Math.max(0, Math.round(((prevCount - stageCount) / prevCount) * 1000) / 10);

		stages.push({ stage, label, count: stageCount, percentOfTotal, dropOffRate });
		prevCount = stageCount;
	}

	return stages;
}

// ─── Daily Volume ───────────────────────────────────────────────────────────

export async function computeDailyVolume(fromDate: Date, toDate: Date): Promise<DailyVolume[]> {
	const rows = await db
		.select({
			date: sql<string>`DATE(${leads.createdAt} AT TIME ZONE 'America/Sao_Paulo')`.as("date"),
			count: count(),
		})
		.from(leads)
		.where(and(realLeads, gte(leads.createdAt, fromDate), lte(leads.createdAt, toDate)))
		.groupBy(sql`DATE(${leads.createdAt} AT TIME ZONE 'America/Sao_Paulo')`)
		.orderBy(sql`DATE(${leads.createdAt} AT TIME ZONE 'America/Sao_Paulo')`);

	// Build lookup from query results
	const countByDate = new Map<string, number>();
	for (const row of rows) {
		countByDate.set(row.date, row.count);
	}

	// Fill gaps — every day from fromDate to toDate
	const result: DailyVolume[] = [];
	const totalDays = differenceInDays(toDate, fromDate);
	for (let i = 0; i <= totalDays; i++) {
		const day = addDays(fromDate, i);
		const key = format(day, "yyyy-MM-dd");
		result.push({ date: key, count: countByDate.get(key) ?? 0 });
	}

	return result;
}

// ─── Channel Breakdown ──────────────────────────────────────────────────────

export async function computeChannelBreakdown(
	fromDate: Date,
	toDate: Date,
): Promise<ChannelBreakdown[]> {
	const rows = await db
		.select({
			channel: conversations.channel,
			count: count(),
		})
		.from(leads)
		.innerJoin(conversations, eq(leads.conversationId, conversations.id))
		.where(and(realLeads, gte(leads.createdAt, fromDate), lte(leads.createdAt, toDate)))
		.groupBy(conversations.channel);

	// Build lookup
	const countByChannel = new Map<string, number>();
	let total = 0;
	for (const row of rows) {
		countByChannel.set(row.channel, row.count);
		total += row.count;
	}

	// Ensure both channels are always present
	const channels: ("web" | "whatsapp")[] = ["web", "whatsapp"];
	return channels.map((channel) => {
		const channelCount = countByChannel.get(channel) ?? 0;
		return {
			channel,
			count: channelCount,
			percent: total > 0 ? Math.round((channelCount / total) * 1000) / 10 : 0,
		};
	});
}

import {
	computeChannelBreakdown,
	computeDailyVolume,
	computeFunnelStages,
	computeKpis,
} from "@/lib/admin/dashboard-queries";
import type { DashboardResponse } from "@/lib/admin/dashboard-types";
import { resolverPeriodo } from "@/lib/admin/periodo";
import { requireRole } from "@/lib/admin/require-role";

export async function GET(request: Request) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { searchParams } = new URL(request.url);

	// Dia inteiro, no fuso do negócio, e HOJE quando não vem nada — a mesma regra
	// que o filtro da tela usa (`periodo.ts`).
	const periodo = resolverPeriodo(searchParams.get("from"), searchParams.get("to"));

	if (!periodo) {
		return Response.json(
			{ error: "Formato de data inválido. Use ISO 8601 (ex.: 2026-08-01)." },
			{ status: 400 },
		);
	}

	const { de: fromDate, ate: toDate } = periodo;

	// Run all aggregations in parallel
	const [kpis, funnelStages, dailyVolume, channelBreakdown] = await Promise.all([
		computeKpis(fromDate, toDate),
		computeFunnelStages(fromDate, toDate),
		computeDailyVolume(fromDate, toDate),
		computeChannelBreakdown(fromDate, toDate),
	]);

	const response: DashboardResponse = {
		kpis,
		funnel_stages: funnelStages,
		daily_volume: dailyVolume,
		channel_breakdown: channelBreakdown,
	};

	return Response.json(response);
}

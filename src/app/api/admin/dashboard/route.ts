import {
	computeChannelBreakdown,
	computeDailyVolume,
	computeFunnelStages,
	computeKpis,
} from "@/lib/admin/dashboard-queries";
import type { DashboardResponse } from "@/lib/admin/dashboard-types";
import { periodoDaRequisicao } from "@/lib/admin/periodo-da-requisicao";
import { requireRole } from "@/lib/admin/require-role";

export async function GET(request: Request) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	// Dia inteiro, no fuso do negócio, com a precedência URL > cookie > hoje — a
	// mesma regra que o filtro da tela usa, resolvida num lugar só.
	const { de: fromDate, ate: toDate } = periodoDaRequisicao(request);

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

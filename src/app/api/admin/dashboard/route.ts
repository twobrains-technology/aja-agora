import { requireRole } from "@/lib/admin/require-role";
import {
  computeKpis,
  computeFunnelStages,
  computeDailyVolume,
  computeChannelBreakdown,
} from "@/lib/admin/dashboard-queries";
import { subDays } from "date-fns";
import type { DashboardResponse } from "@/lib/admin/dashboard-types";

export async function GET(request: Request) {
  const { error } = await requireRole("admin", "viewer");
  if (error) return error;

  // Parse date range from query params (defaults: last 30 days)
  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const toDate = toParam ? new Date(toParam) : new Date();
  const fromDate = fromParam ? new Date(fromParam) : subDays(new Date(), 30);

  // Validate dates
  if (Number.isNaN(toDate.getTime()) || Number.isNaN(fromDate.getTime())) {
    return Response.json(
      { error: "Invalid date format. Use ISO 8601 (e.g. 2026-04-01)." },
      { status: 400 },
    );
  }

  // Run all aggregations in parallel
  const [kpis, funnelStages, dailyVolume, channelBreakdown] =
    await Promise.all([
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

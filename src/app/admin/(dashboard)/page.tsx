"use client";

import { useEffect, useState, useCallback } from "react";
import { useQueryState, parseAsIsoDate } from "nuqs";
import { subDays } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { KpiCards } from "@/components/admin/dashboard/kpi-cards";
import { FunnelChart } from "@/components/admin/dashboard/funnel-chart";
import { LeadVolumeChart } from "@/components/admin/dashboard/lead-volume-chart";
import { ChannelBreakdownChart } from "@/components/admin/dashboard/channel-breakdown-chart";
import type { DashboardResponse } from "@/lib/admin/dashboard-types";

function defaultFrom() {
  return subDays(new Date(), 30);
}

function defaultTo() {
  return new Date();
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChartSkeleton({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[300px] w-full" />
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const [from] = useQueryState(
    "from",
    parseAsIsoDate.withDefault(defaultFrom()),
  );
  const [to] = useQueryState(
    "to",
    parseAsIsoDate.withDefault(defaultTo()),
  );

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from.toISOString());
      if (to) params.set("to", to.toISOString());

      const res = await fetch(`/api/admin/dashboard?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Erro ao carregar dashboard: ${res.status}`);
      }
      const json: DashboardResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Visao geral do funil de vendas
          </p>
        </div>
        <DateRangeFilter />
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {loading || !data ? <KpiSkeleton /> : <KpiCards kpis={data.kpis} />}

      {/* Funnel Chart */}
      {loading || !data ? (
        <ChartSkeleton title="Funil de Conversao" />
      ) : (
        <FunnelChart stages={data.funnel_stages} />
      )}

      {/* Bottom charts: side-by-side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading || !data ? (
          <>
            <ChartSkeleton title="Volume de Leads" />
            <ChartSkeleton title="Canais" />
          </>
        ) : (
          <>
            <LeadVolumeChart data={data.daily_volume} />
            <ChannelBreakdownChart data={data.channel_breakdown} />
          </>
        )}
      </div>
    </div>
  );
}

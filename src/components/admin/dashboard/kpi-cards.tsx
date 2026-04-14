"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users,
  UserPlus,
  Clock,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { KpiData } from "@/lib/admin/dashboard-types";

interface KpiCardProps {
  title: string;
  value: string | number;
  trend: number;
  icon: React.ComponentType<{ className?: string }>;
  invertTrend?: boolean;
}

function KpiCard({ title, value, trend, icon: Icon, invertTrend }: KpiCardProps) {
  // For avgFunnelDays, lower is better — invert the color logic
  const isPositive = invertTrend ? trend <= 0 : trend >= 0;
  const TrendIcon = trend >= 0 ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p
          className={`text-xs flex items-center gap-1 mt-1 ${
            isPositive ? "text-green-600" : "text-red-600"
          }`}
        >
          <TrendIcon className="size-3" />
          {Math.abs(trend)}% vs periodo anterior
        </p>
      </CardContent>
    </Card>
  );
}

export function KpiCards({ kpis }: { kpis: KpiData }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total Leads"
        value={kpis.totalLeads}
        trend={kpis.trends.totalLeads}
        icon={Users}
      />
      <KpiCard
        title="Leads Hoje"
        value={kpis.leadsToday}
        trend={kpis.trends.leadsToday}
        icon={UserPlus}
      />
      <KpiCard
        title="Tempo Medio no Funil"
        value={`${kpis.avgFunnelDays} dias`}
        trend={kpis.trends.avgFunnelDays}
        icon={Clock}
        invertTrend
      />
      <KpiCard
        title="Taxa de Conversao"
        value={`${kpis.conversionRate.toFixed(1)}%`}
        trend={kpis.trends.conversionRate}
        icon={TrendingUp}
      />
    </div>
  );
}

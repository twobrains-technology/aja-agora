"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { format, parseISO } from "date-fns";
import type { DailyVolume } from "@/lib/admin/dashboard-types";

const chartConfig: ChartConfig = {
  count: {
    label: "Leads",
    color: "var(--chart-1)",
  },
};

function formatTick(value: string) {
  try {
    return format(parseISO(value), "dd/MM");
  } catch {
    return value;
  }
}

export function LeadVolumeChart({ data }: { data: DailyVolume[] }) {
  const isEmpty = data.length === 0 || data.every((d) => d.count === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Volume de Leads</CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
            Sem dados no periodo
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={formatTick}
                tick={{ fontSize: 12 }}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <ChartTooltip
                content={<ChartTooltipContent />}
                labelFormatter={(label) => formatTick(String(label))}
              />
              <Area
                type="monotone"
                dataKey="count"
                fill="var(--color-count)"
                stroke="var(--color-count)"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

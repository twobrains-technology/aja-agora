"use client";

import { Pie, PieChart, Cell, Label } from "recharts";
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
import type { ChannelBreakdown } from "@/lib/admin/dashboard-types";

const CHANNEL_COLORS: Record<string, string> = {
  web: "var(--chart-1)",
  whatsapp: "var(--chart-2)",
};

const CHANNEL_LABELS: Record<string, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
};

const chartConfig: ChartConfig = {
  web: {
    label: "Web",
    color: "var(--chart-1)",
  },
  whatsapp: {
    label: "WhatsApp",
    color: "var(--chart-2)",
  },
};

export function ChannelBreakdownChart({ data }: { data: ChannelBreakdown[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const isEmpty = total === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Canais</CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
            Sem dados
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="channel"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.channel}
                      fill={CHANNEL_COLORS[entry.channel] ?? "var(--chart-3)"}
                    />
                  ))}
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-2xl font-bold"
                            >
                              {total}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy ?? 0) + 20}
                              className="fill-muted-foreground text-xs"
                            >
                              total
                            </tspan>
                          </text>
                        );
                      }
                      return null;
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-2">
              {data.map((entry) => (
                <div key={entry.channel} className="flex items-center gap-2">
                  <div
                    className="size-3 rounded-full"
                    style={{
                      backgroundColor:
                        CHANNEL_COLORS[entry.channel] ?? "var(--chart-3)",
                    }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {CHANNEL_LABELS[entry.channel] ?? entry.channel}
                  </span>
                  <span className="text-sm font-medium">
                    {entry.count} ({entry.percent}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

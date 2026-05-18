"use client";

import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
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
		<Card className="shadow-sm">
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
							<defs>
								<linearGradient id="leadVolumeGradient" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.4} />
									<stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.05} />
								</linearGradient>
							</defs>
							<CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
							<XAxis
								dataKey="date"
								tickFormatter={formatTick}
								tick={{ fontSize: 12 }}
								tickLine={false}
								axisLine={false}
							/>
							<YAxis
								allowDecimals={false}
								tick={{ fontSize: 12 }}
								tickLine={false}
								axisLine={false}
							/>
							<ChartTooltip
								content={<ChartTooltipContent indicator="line" />}
								labelFormatter={(label) => formatTick(String(label))}
							/>
							<Area
								type="monotone"
								dataKey="count"
								fill="url(#leadVolumeGradient)"
								stroke="var(--color-count)"
								strokeWidth={2}
							/>
						</AreaChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}

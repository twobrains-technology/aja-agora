"use client";

import { BarList } from "@/components/ui/bar-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChannelBreakdown } from "@/lib/admin/dashboard-types";

const CHANNEL_LABELS: Record<string, string> = {
	web: "Web",
	whatsapp: "WhatsApp",
};

const CHANNEL_BAR_CLASSES: Record<string, string> = {
	web: "bg-[var(--chart-1)]/15 dark:bg-[var(--chart-1)]/25",
	whatsapp: "bg-[var(--chart-2)]/15 dark:bg-[var(--chart-2)]/25",
};

export function ChannelBreakdownChart({ data }: { data: ChannelBreakdown[] }) {
	const total = data.reduce((sum, d) => sum + d.count, 0);
	const isEmpty = total === 0;

	const barData = data.map((entry) => ({
		name: CHANNEL_LABELS[entry.channel] ?? entry.channel,
		value: entry.count,
		barClassName: CHANNEL_BAR_CLASSES[entry.channel],
		percent: entry.percent,
	}));

	return (
		<Card className="shadow-sm">
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle>Canais</CardTitle>
				<span className="text-sm text-muted-foreground">{total} total</span>
			</CardHeader>
			<CardContent>
				{isEmpty ? (
					<div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
						Sem dados
					</div>
				) : (
					<div className="space-y-4">
						<BarList
							data={barData}
							valueFormatter={(value) => {
								const entry = barData.find((d) => d.value === value);
								return `${value} (${entry?.percent ?? 0}%)`;
							}}
							sortOrder="descending"
							showAnimation
							barHeight={40}
							barGap={8}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

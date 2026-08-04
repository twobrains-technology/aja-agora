"use client";

import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import type { PontoSerie } from "@/lib/admin/performance-types";

const chartConfig: ChartConfig = {
	visitas: { label: "Visitas", color: "var(--chart-1)" },
	conversas: { label: "Conversas", color: "var(--chart-2)" },
	identificados: { label: "Identificados", color: "var(--chart-3)" },
};

function formatTick(value: string) {
	try {
		return format(parseISO(value), "dd/MM");
	} catch {
		return value;
	}
}

export function SerieAquisicaoChart({ data }: { data: PontoSerie[] }) {
	const vazio =
		data.length === 0 ||
		data.every((d) => d.visitas === 0 && d.conversas === 0 && d.identificados === 0);

	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Aquisição no tempo</CardTitle>
				<CardDescription>
					As três linhas juntas mostram onde a queda começou a mudar de forma
				</CardDescription>
			</CardHeader>
			<CardContent>
				{vazio ? (
					<div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
						Sem dados no período
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-[300px] w-full">
						<LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
							<CartesianGrid vertical={false} />
							<XAxis
								dataKey="date"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								tickFormatter={formatTick}
							/>
							<YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
							<ChartTooltip
								content={
									<ChartTooltipContent labelFormatter={(label) => formatTick(String(label))} />
								}
							/>
							<ChartLegend content={<ChartLegendContent />} />
							{/* Linhas com espessura e marcador próprios, não só cor — três séries
							    distinguíveis por forma além do matiz. */}
							<Line dataKey="visitas" stroke="var(--color-visitas)" strokeWidth={2} dot={false} />
							<Line
								dataKey="conversas"
								stroke="var(--color-conversas)"
								strokeWidth={2}
								strokeDasharray="6 3"
								dot={false}
							/>
							<Line
								dataKey="identificados"
								stroke="var(--color-identificados)"
								strokeWidth={2}
								strokeDasharray="2 3"
								dot={false}
							/>
						</LineChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}

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

const nf = new Intl.NumberFormat("pt-BR");

/** Milhar abreviado no eixo: "10 mil" cabe onde "10000" era cortado. */
function formatarEixo(valor: number): string {
	if (valor >= 1000) return `${nf.format(valor / 1000)} mil`;
	return nf.format(valor);
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
					Visitas na escala da esquerda; conversas e identificados na da direita — sem isso as duas
					sumiriam coladas no zero
				</CardDescription>
			</CardHeader>
			<CardContent>
				{vazio ? (
					<div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
						Sem dados no período
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-[300px] w-full">
						<LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
							<CartesianGrid vertical={false} />
							<XAxis
								dataKey="date"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								tickFormatter={formatTick}
								minTickGap={24}
							/>
							{/* DUAS ESCALAS, e não uma.
							    São 30.147 visitas contra 19 conversas: no eixo único as duas
							    séries pequenas viram uma linha reta em cima do zero, e a
							    descrição do card promete justamente comparar a FORMA das três.
							    O eixo próprio devolve a leitura; o rótulo em cada lado diz a
							    quem cada escala pertence, porque a informação não pode
							    depender de adivinhar a cor. */}
							<YAxis
								yAxisId="visitas"
								tickLine={false}
								axisLine={false}
								width={52}
								allowDecimals={false}
								tickFormatter={formatarEixo}
								label={{
									value: "Visitas",
									angle: -90,
									position: "insideLeft",
									// `textAnchor: middle` não é enfeite: sem ele o recharts ancora
									// o texto rotacionado pelo início e o rótulo sai cortado pelo
									// topo do gráfico — foi o que apareceu na tela com o rótulo
									// mais longo, o da direita.
									style: { fontSize: 11, fill: "var(--muted-foreground)", textAnchor: "middle" },
								}}
							/>
							<YAxis
								yAxisId="pessoas"
								orientation="right"
								tickLine={false}
								axisLine={false}
								width={52}
								allowDecimals={false}
								tickFormatter={formatarEixo}
								label={{
									value: "Conversas e identificados",
									angle: 90,
									position: "insideRight",
									style: { fontSize: 11, fill: "var(--muted-foreground)", textAnchor: "middle" },
								}}
							/>
							<ChartTooltip
								content={
									<ChartTooltipContent labelFormatter={(label) => formatTick(String(label))} />
								}
							/>
							<ChartLegend content={<ChartLegendContent />} />
							{/* Linhas com traço próprio, não só cor — três séries distinguíveis
							    por forma além do matiz. O ponto marcado aparece no hover para
							    ancorar a leitura no dia exato. */}
							<Line
								yAxisId="visitas"
								dataKey="visitas"
								stroke="var(--color-visitas)"
								strokeWidth={2}
								dot={false}
								activeDot={{ r: 4 }}
							/>
							<Line
								yAxisId="pessoas"
								dataKey="conversas"
								stroke="var(--color-conversas)"
								strokeWidth={2}
								strokeDasharray="6 3"
								dot={false}
								activeDot={{ r: 4 }}
							/>
							<Line
								yAxisId="pessoas"
								dataKey="identificados"
								stroke="var(--color-identificados)"
								strokeWidth={2}
								strokeDasharray="2 3"
								dot={false}
								activeDot={{ r: 4 }}
							/>
						</LineChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}

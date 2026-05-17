"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { FinancingComparisonPayload } from "@/lib/chat/types";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function FinancingComparison({ payload }: { payload: FinancingComparisonPayload }) {
	const consorcioBest =
		payload.diff.monthlyDelta < 0 || payload.diff.totalDelta < 0;
	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<p className="text-sm font-medium text-muted-foreground">
					Consórcio × Financiamento · {formatBRL(payload.creditValue)} / {payload.termMonths}m
				</p>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="grid grid-cols-2 gap-3">
					<div className="rounded-md border bg-card p-3" data-testid="comparison-consorcio">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Consórcio
						</p>
						<p className="text-lg font-mono mt-1">{formatBRL(payload.consorcio.monthlyPayment)}/mês</p>
						<p className="text-xs text-muted-foreground mt-1">
							Total: <span className="font-mono">{formatBRL(payload.consorcio.totalCost)}</span>
						</p>
					</div>
					<div className="rounded-md border bg-card p-3" data-testid="comparison-financing">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Financiamento
						</p>
						<p className="text-lg font-mono mt-1">{formatBRL(payload.financing.monthlyPayment)}/mês</p>
						<p className="text-xs text-muted-foreground mt-1">
							Total: <span className="font-mono">{formatBRL(payload.financing.totalCost)}</span>
						</p>
						<p className="text-[10px] text-muted-foreground mt-1">
							Premissa CET: {payload.financing.annualRate}%/ano
						</p>
					</div>
				</div>
				<div className="rounded-md bg-muted/40 px-3 py-2">
					<p className="text-xs">
						{consorcioBest ? "Consórcio fica mais barato em" : "Financiamento fica mais barato em"}{" "}
						<span className="font-mono font-semibold">
							{formatBRL(Math.abs(payload.diff.monthlyDelta))}/mês
						</span>{" "}
						·{" "}
						<span className="font-mono font-semibold">
							{formatBRL(Math.abs(payload.diff.totalDelta))} no total
						</span>
					</p>
				</div>
				<p className="text-[10px] text-muted-foreground italic">{payload.disclaimer}</p>
			</CardContent>
		</Card>
	);
}

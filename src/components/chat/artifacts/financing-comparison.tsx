"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { FinancingComparisonPayload } from "@/lib/chat/types";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function FinancingComparison({ payload }: { payload: FinancingComparisonPayload }) {
	const consorcioBest = payload.diff.monthlyDelta < 0 || payload.diff.totalDelta < 0;
	return (
		<Card className="w-full max-w-[360px] rounded-[18px] shadow-lg overflow-hidden">
			<CardHeader className="pb-0 pt-4 px-4">
				<p className="aja-eyebrow">
					Consórcio × Financiamento ·{" "}
					<span className="aja-num">{formatBRL(payload.creditValue)}</span> / {payload.termMonths}m
				</p>
			</CardHeader>
			<CardContent className="space-y-3 p-4 pt-3">
				<div className="grid grid-cols-2 gap-3">
					{/* Coluna vencedora — consórcio */}
					<div
						className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3"
						data-testid="comparison-consorcio"
					>
						<p className="aja-eyebrow mb-1">Consórcio</p>
						<p className="aja-num text-lg font-bold text-foreground leading-tight">
							{formatBRL(payload.consorcio.monthlyPayment)}
							<span className="text-xs font-normal text-muted-foreground">/mês</span>
						</p>
						<p className="aja-num text-xs text-muted-foreground mt-1">
							Total: {formatBRL(payload.consorcio.totalCost)}
						</p>
					</div>
					{/* Coluna de referência — financiamento */}
					<div
						className="rounded-xl border border-border bg-card p-3"
						data-testid="comparison-financing"
					>
						<p className="aja-eyebrow mb-1">Financiamento</p>
						<p className="aja-num text-lg font-bold text-foreground leading-tight">
							{formatBRL(payload.financing.monthlyPayment)}
							<span className="text-xs font-normal text-muted-foreground">/mês</span>
						</p>
						<p className="aja-num text-xs text-muted-foreground mt-1">
							Total: {formatBRL(payload.financing.totalCost)}
						</p>
						<p className="text-[10px] text-muted-foreground mt-1">
							Premissa CET: {payload.financing.annualRate}%/ano
						</p>
					</div>
				</div>

				{/* Destaque de economia */}
				<div className="rounded-xl bg-muted/40 px-3 py-2.5">
					<p className="text-xs leading-relaxed">
						{consorcioBest ? "Consórcio fica mais barato em" : "Financiamento fica mais barato em"}{" "}
						<span className="aja-num font-semibold">
							{formatBRL(Math.abs(payload.diff.monthlyDelta))}/mês
						</span>{" "}
						·{" "}
						<span className="aja-num font-semibold">
							{formatBRL(Math.abs(payload.diff.totalDelta))} no total
						</span>
					</p>
				</div>

				<p className="text-[10px] text-muted-foreground italic leading-snug">
					{payload.disclaimer}
				</p>
			</CardContent>
		</Card>
	);
}

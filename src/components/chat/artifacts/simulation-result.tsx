"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useChatContext } from "@/lib/chat/provider";
import type { SimulationResultPayload } from "@/lib/chat/types";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);

const formatPercent = (value: number, decimals = 1): string => `${value.toFixed(decimals)}%`;

interface CostLineProps {
	label: string;
	value: string;
	bold?: boolean;
}

function CostLine({ label, value, bold = false }: CostLineProps) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className={bold ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>
				{label}
			</span>
			<span className={bold ? "text-sm font-bold font-mono" : "text-sm font-mono"}>{value}</span>
		</div>
	);
}

export function SimulationResult({ payload }: { payload: SimulationResultPayload }) {
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	const handleInterest = () => {
		if (isStreaming) return;
		const label = "Tenho interesse";
		void sendAction({ kind: "interest", administradora: payload.administradora, label }, label);
	};

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<p className="text-sm font-medium text-muted-foreground">
					Simulação · {payload.administradora}
				</p>
			</CardHeader>

			<CardContent className="space-y-4">
				{/* Hero monthly payment */}
				<div>
					<p className="text-2xl font-bold font-mono leading-tight text-primary">
						{formatBRL(payload.monthlyPayment)}
						<span className="text-base font-normal text-muted-foreground">/mês</span>
					</p>
					<p className="text-sm text-muted-foreground mt-1">por {payload.termMonths} meses</p>
				</div>

				<Separator />

				{/* Cost breakdown */}
				<div className="space-y-2">
					<CostLine label="Valor do crédito" value={formatBRL(payload.creditValue)} />
					<CostLine
						label="Taxa de administração"
						value={`${formatBRL(payload.adminFee)} (${formatPercent(
							payload.adminFee > 0 && payload.creditValue > 0
								? (payload.adminFee / payload.creditValue) * 100
								: 0,
						)})`}
					/>
					<CostLine label="Fundo de reserva" value={formatBRL(payload.reserveFund)} />
					<CostLine label="Seguro" value={formatBRL(payload.insurance)} />

					{/* Total cost - visually distinct */}
					<div className="border-t border-border pt-2 mt-2">
						<CostLine label="Custo total" value={formatBRL(payload.totalCost)} bold />
					</div>
				</div>

				{/* Effective rate */}
				<p className="text-xs text-muted-foreground">
					Taxa efetiva:{" "}
					<span className="font-mono font-medium">{formatPercent(payload.effectiveRate, 2)}</span>
				</p>

				<Separator />

				<Button
					size="lg"
					className="w-full gap-1.5 min-h-[44px]"
					onClick={handleInterest}
					disabled={isStreaming}
				>
					<Sparkles className="size-4" />
					Tenho interesse
				</Button>
			</CardContent>
		</Card>
	);
}

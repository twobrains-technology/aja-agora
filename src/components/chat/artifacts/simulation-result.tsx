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

	const handleAction = (action: { label: string; intent: string }) => {
		if (isStreaming) return;
		void sendAction(
			{ kind: "interest", administradora: payload.administradora, label: action.label },
			action.label,
		);
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
					<CostLine label="Valor do bem" value={formatBRL(payload.creditValue)} />
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

				{/* Cenário com lance (bug #10) */}
				{payload.lanceScenario && (
					<div className="rounded-md bg-muted/40 px-3 py-2">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Cenário com lance
						</p>
						<p className="text-sm mt-1">
							Com lance de {payload.lanceScenario.lancePercent}% do valor do bem, expectativa de
							contemplação em ~{payload.lanceScenario.expectedTermMonths} meses (estimativa, não
							garantia).
						</p>
					</div>
				)}

				{/* Cenário de lance embutido (jornada do .docx) — variação com/sem */}
				{payload.embeddedBid && (
					<div className="rounded-md bg-muted/40 px-3 py-2">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Com lance embutido ({payload.embeddedBid.percent}%)
						</p>
						<div className="mt-1 space-y-1">
							<CostLine
								label="Valor que você recebe"
								value={formatBRL(payload.embeddedBid.receivedCredit)}
							/>
							{/* FIX-8: só com dado real (> 0) — "R$ 0,00" aqui é enganoso. */}
							{(payload.embeddedBid.necessaryBidToContemplate ?? 0) > 0 && (
								<CostLine
									label="Lance estimado p/ contemplar"
									value={formatBRL(payload.embeddedBid.necessaryBidToContemplate as number)}
								/>
							)}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Usa parte da própria carta como lance — sem precisar do valor todo em dinheiro
							(estimativa, não garantia).
						</p>
					</div>
				)}

				{/* Correção prevista (bug #10) */}
				{payload.expectedAdjustment && (
					<p className="text-xs text-muted-foreground">
						Correção prevista:{" "}
						<span className="font-medium">{payload.expectedAdjustment.index}</span> ~
						{formatPercent(payload.expectedAdjustment.annualPercent, 1)}/ano (estimativa).
					</p>
				)}

				<Separator />

				<Button
					size="lg"
					data-testid="tenho-interesse-cta"
					className="w-full gap-1.5 min-h-[44px] shadow-lg shadow-primary/30 ring-1 ring-primary/40 hover:shadow-primary/50 transition-shadow"
					onClick={handleInterest}
					disabled={isStreaming}
				>
					<Sparkles className="size-4" />
					Tenho interesse
				</Button>

				{/* CTAs secundárias (bug #12) */}
				{payload.actions && payload.actions.length > 0 && (
					<div className="flex flex-col gap-2">
						{payload.actions.map((action) => (
							<Button
								key={action.intent}
								type="button"
								variant="outline"
								size="sm"
								className="w-full min-h-[40px]"
								onClick={() => handleAction(action)}
								disabled={isStreaming}
							>
								{action.label}
							</Button>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

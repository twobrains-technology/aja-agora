"use client";

import { Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useChatContext } from "@/lib/chat/provider";
import type { ComparisonTablePayload, GroupCardPayload } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	}).format(value);

export function ComparisonTable({ payload }: { payload: ComparisonTablePayload }) {
	const { groups, highlightBestIndex } = payload;
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	if (!groups || groups.length === 0) return null;

	const handleSelect = (group: GroupCardPayload) => {
		if (isStreaming) return;
		const label = `Simular ${group.administradora} — ${formatBRL(group.creditValue)}`;
		void sendAction(
			{
				kind: "select-group",
				groupId: group.id,
				administradora: group.administradora,
				creditValue: group.creditValue,
				termMonths: group.termMonths,
				label,
			},
			label,
		);
	};

	return (
		<div className="flex gap-2.5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
			{groups.map((group, index) => {
				const isBest = highlightBestIndex === index;
				return (
					<Card
						key={group.id}
						role="button"
						tabIndex={0}
						aria-label={`Simular ${group.administradora}, parcela ${formatBRL(group.monthlyPayment)} por mês`}
						onClick={() => handleSelect(group)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								handleSelect(group);
							}
						}}
						className={cn(
							"w-[180px] shrink-0 cursor-pointer transition-colors",
							"hover:ring-accent/50 hover:ring-2",
							"focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2",
							isStreaming && "pointer-events-none opacity-60",
							isBest && "border-primary bg-primary/5",
						)}
					>
						<CardContent className="space-y-2 p-3">
							{/* Header */}
							<div className="flex items-center justify-between">
								<span className="text-xs font-medium text-muted-foreground truncate">
									{group.administradora}
								</span>
								{isBest && (
									<Badge className="gap-0.5 px-1.5 py-0 text-[10px]">
										<Crown className="size-2.5" />
										Top
									</Badge>
								)}
							</div>

							{/* Main value */}
							<div>
								<p className="font-mono text-lg font-bold leading-tight">
									{formatBRL(group.monthlyPayment)}
								</p>
								<p className="text-[10px] text-muted-foreground">/mês</p>
							</div>

							<Separator />

							{/* Details */}
							<div className="space-y-1 text-xs">
								<div className="flex justify-between">
									<span className="text-muted-foreground">Valor do bem</span>
									<span className="font-mono font-medium">{formatBRL(group.creditValue)}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Taxa</span>
									<span className="font-mono font-medium">{group.adminFeePercent.toFixed(1)}%</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Prazo</span>
									<span className="font-mono font-medium">{group.termMonths}m</span>
								</div>
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}

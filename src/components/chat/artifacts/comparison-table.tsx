"use client";

import { Crown } from "lucide-react";
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
		<div
			className={cn(
				"flex gap-[11px] w-full overflow-x-auto pb-1.5",
				"[-webkit-overflow-scrolling:touch]",
				isStreaming && "pointer-events-none opacity-60",
			)}
		>
			{groups.map((group, index) => {
				const isBest = highlightBestIndex === index;
				return (
					<button
						key={group.id}
						type="button"
						tabIndex={0}
						aria-label={`Simular ${group.administradora}, parcela ${formatBRL(group.monthlyPayment)} por mês`}
						onClick={() => handleSelect(group)}
						className={cn(
							"shrink-0 w-[150px] rounded-[14px] p-[13px] text-left",
							"flex flex-col gap-2 border bg-card cursor-pointer",
							"transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
							isBest
								? "border-primary bg-primary/[0.04] hover:bg-primary/[0.07]"
								: "border-border hover:border-border/60 hover:bg-muted/40",
						)}
					>
						{/* Header: administradora + optional crown */}
						<div className="flex items-center justify-between gap-1.5 min-w-0">
							<span className="text-xs font-medium text-muted-foreground truncate">
								{group.administradora}
							</span>
							{isBest && (
								<span
									className="inline-flex items-center gap-[3px] shrink-0 h-5 px-[7px] rounded-full text-[10px] font-semibold"
									style={{ background: "var(--surface-ink)", color: "#fff" }}
								>
									<Crown className="size-[11px]" />
									Top
								</span>
							)}
						</div>

						{/* Main value — parcela herói */}
						<div>
							<p className="aja-num text-lg font-bold leading-none text-foreground">
								{formatBRL(group.monthlyPayment)}
							</p>
							<p className="text-[10px] text-muted-foreground mt-0.5">/mês</p>
						</div>

						{/* Divider */}
						<div className="h-px bg-border" />

						{/* Details — NÃO exibir taxa (assusta o leigo) */}
						{/* Bernardo 2026-06-11: sem "Taxa" no carrossel — composição completa na proposta (PDF). Ver CONTEXT.md (D14). */}
						<div className="flex flex-col gap-1">
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">Valor do bem</span>
								<b className="aja-num font-semibold">{formatBRL(group.creditValue)}</b>
							</div>
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">Prazo</span>
								<b className="aja-num font-semibold">{group.termMonths}m</b>
							</div>
						</div>
					</button>
				);
			})}
		</div>
	);
}

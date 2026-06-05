"use client";

import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useChatContext } from "@/lib/chat/provider";
import type { GroupCardPayload } from "@/lib/chat/types";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const CATEGORY_STYLES: Record<GroupCardPayload["category"], { label: string; className: string }> =
	{
		imovel: {
			label: "Imovel",
			className:
				"bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
		},
		auto: {
			label: "Auto",
			className:
				"bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
		},
		moto: {
			label: "Moto",
			className:
				"bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800",
		},
		servicos: {
			label: "Servicos",
			className:
				"bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
		},
	};

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);

const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

const cardSpring = { type: "spring" as const, stiffness: 400, damping: 17 };

export function GroupCard({ payload }: { payload: GroupCardPayload }) {
	const category = CATEGORY_STYLES[payload.category] ?? CATEGORY_STYLES.servicos;
	const prefersReduced = useReducedMotion();
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	const handleClick = () => {
		if (isStreaming) return;
		const label = `Simular ${payload.administradora} — ${formatBRL(payload.creditValue)}`;
		void sendAction(
			{
				kind: "select-group",
				groupId: payload.id,
				administradora: payload.administradora,
				creditValue: payload.creditValue,
				termMonths: payload.termMonths,
				label,
			},
			label,
		);
	};

	return (
		<motion.div
			whileHover={prefersReduced ? undefined : { scale: 1.02 }}
			whileTap={prefersReduced ? undefined : { scale: 0.98 }}
			transition={cardSpring}
		>
			<Card
				className={cn(
					"w-full cursor-pointer transition-colors",
					"hover:ring-accent/50 hover:ring-2",
					"focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2",
				)}
				role="button"
				tabIndex={0}
				aria-label={`Grupo ${payload.administradora} — credito ${formatBRL(payload.creditValue)}, parcela ${formatBRL(payload.monthlyPayment)}`}
				onClick={handleClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleClick();
					}
				}}
			>
				<CardHeader>
					<div className="flex items-center justify-between gap-2">
						<Badge variant="outline" className={cn("text-xs font-medium", category.className)}>
							{category.label}
						</Badge>
					</div>
					<p className="truncate text-sm text-muted-foreground">{payload.administradora}</p>
				</CardHeader>

				<CardContent className="space-y-3">
					{/* Credit value - primary visual anchor */}
					<div>
						<p className="text-xs text-muted-foreground">Valor do bem</p>
						<p className="text-xl font-bold font-mono leading-tight text-foreground">
							{formatBRL(payload.creditValue)}
						</p>
					</div>

					{/* Monthly payment - financial highlight */}
					<div>
						<p className="text-xs text-muted-foreground">Parcela mensal</p>
						<p className="text-2xl font-bold font-mono leading-tight text-primary">
							{formatBRL(payload.monthlyPayment)}
						</p>
					</div>

					{/* Admin fee + Term - 2-column grid */}
					<div className="grid grid-cols-2 gap-3">
						<div>
							<p className="text-xs text-muted-foreground">Taxa adm.</p>
							<p className="text-sm font-medium font-mono">
								{formatPercent(payload.adminFeePercent)}
							</p>
						</div>
						<div>
							<p className="text-xs text-muted-foreground">Prazo</p>
							<p className="text-sm font-medium font-mono">{payload.termMonths} meses</p>
						</div>
					</div>

					{/* Available slots + Contemplation rate - 2-column grid */}
					<div className="grid grid-cols-2 gap-3">
						<div>
							<p className="text-xs text-muted-foreground">Vagas</p>
							<p className="text-sm font-medium font-mono">{payload.availableSlots}</p>
						</div>
						<div>
							<p className="text-xs text-muted-foreground">Contemplação</p>
							<p className="text-sm font-medium font-mono">
								{formatPercent(payload.contemplationRate)}
							</p>
						</div>
					</div>

					{/* CTA */}
					<Button
						size="sm"
						variant="outline"
						className="w-full gap-1 text-xs"
						disabled={isStreaming}
						onClick={(e) => {
							e.stopPropagation();
							handleClick();
						}}
					>
						Simular esse
						<ChevronRight className="size-3.5" />
					</Button>
				</CardContent>
			</Card>
		</motion.div>
	);
}

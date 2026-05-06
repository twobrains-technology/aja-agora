"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useChatContext } from "@/lib/chat/provider";
import type { RecommendationCardPayload } from "@/lib/chat/types";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);

const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

const FACTOR_LABELS: Record<keyof RecommendationCardPayload["scoreBreakdown"], string> = {
	monthlyFit: "Orcamento",
	contemplation: "Contemplacao",
	adminFee: "Taxa adm",
	termMatch: "Prazo",
};

function ScoreBar({ label, value }: { label: string; value: number }) {
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<span className="text-xs text-muted-foreground">{label}</span>
				<span className="text-xs font-mono text-muted-foreground">{(value * 100).toFixed(0)}%</span>
			</div>
			<div className="bg-muted h-2 rounded-full overflow-hidden">
				<div
					className="bg-primary h-full rounded-full transition-all duration-300"
					style={{ width: `${(value * 100).toFixed(0)}%` }}
				/>
			</div>
		</div>
	);
}

export function RecommendationCard({ payload }: { payload: RecommendationCardPayload }) {
	const [expanded, setExpanded] = useState(false);
	const prefersReduced = useReducedMotion();

	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	const handleCTA = () => {
		if (isStreaming) return;
		const label = "Tenho interesse";
		void sendAction({ kind: "interest", administradora: payload.administradora, label }, label);
	};

	return (
		<Card className={cn("w-full", "border-primary/30 ring-1 ring-primary/20")}>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
						Recomendacao
					</Badge>
					<span className="text-sm font-mono font-medium text-primary">
						{(payload.score * 100).toFixed(0)}% compativel
					</span>
				</div>
				<p className="truncate text-sm text-muted-foreground">{payload.administradora}</p>
			</CardHeader>

			<CardContent className="space-y-4">
				{/* Hero monthly payment */}
				<div>
					<p className="text-xs text-muted-foreground">Parcela mensal</p>
					<p className="text-2xl font-bold font-mono leading-tight text-primary">
						{formatBRL(payload.monthlyPayment)}
						<span className="text-base font-normal text-muted-foreground">/mes</span>
					</p>
				</div>

				{/* Key metrics grid */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<p className="text-xs text-muted-foreground">Credito</p>
						<p className="text-sm font-medium font-mono">{formatBRL(payload.creditValue)}</p>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Prazo</p>
						<p className="text-sm font-medium font-mono">{payload.termMonths} meses</p>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Taxa adm</p>
						<p className="text-sm font-medium font-mono">
							{formatPercent(payload.adminFeePercent)}
						</p>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Contemplacao</p>
						<p className="text-sm font-medium font-mono">
							{formatPercent(payload.contemplationRate)}
						</p>
					</div>
				</div>

				{/* Expandable score breakdown */}
				<div>
					<button
						type="button"
						onClick={() => setExpanded(!expanded)}
						className="flex items-center justify-between w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
						aria-expanded={expanded}
						aria-controls={`score-breakdown-${payload.id}`}
					>
						<span>Por que esta recomendacao?</span>
						<ChevronDown
							className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")}
						/>
					</button>
					<AnimatePresence>
						{expanded && (
							<motion.div
								id={`score-breakdown-${payload.id}`}
								initial={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
								animate={prefersReduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
								exit={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
								transition={{ duration: 0.2 }}
								className="overflow-hidden"
							>
								<div className="space-y-3 pt-3">
									{(
										Object.entries(FACTOR_LABELS) as Array<
											[keyof RecommendationCardPayload["scoreBreakdown"], string]
										>
									).map(([key, label]) => (
										<ScoreBar key={key} label={label} value={payload.scoreBreakdown[key]} />
									))}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				<Separator />

				{/* CTA Button */}
				<Button
					className="w-full min-h-[44px]"
					size="lg"
					onClick={handleCTA}
					disabled={isStreaming}
				>
					Tenho interesse
				</Button>
			</CardContent>
		</Card>
	);
}

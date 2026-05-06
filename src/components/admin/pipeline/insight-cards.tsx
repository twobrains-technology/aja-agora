"use client";

import { AlertTriangle, ArrowRight, DollarSign, Target } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface InsightsData {
	intent: string;
	budget: { monthly: number | null; total: number | null; notes: string };
	objections: string[];
	next_action: string;
}

const currencyFmt = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

const MIN_MESSAGES = 6;

interface InsightCardsProps {
	source: "lead" | "conversation";
	id: string;
	messageCount?: number;
}

export function InsightCards({ source, id, messageCount }: InsightCardsProps) {
	const [insights, setInsights] = useState<InsightsData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const endpoint =
		source === "lead"
			? `/api/admin/leads/${id}/insights`
			: `/api/admin/conversations/${id}/insights`;

	const fetchInsights = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(endpoint, { method: "POST" });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? "Erro ao carregar insights");
			}
			const data = await res.json();
			setInsights(data.insights);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro desconhecido");
		} finally {
			setLoading(false);
		}
	}, [endpoint]);

	const belowThreshold = messageCount !== undefined && messageCount < MIN_MESSAGES;

	// biome-ignore lint/correctness/useExhaustiveDependencies: id change is the trigger to reset
	useEffect(() => {
		setInsights(null);
		setError(null);
	}, [id]);

	useEffect(() => {
		if (belowThreshold) return;
		fetchInsights();
	}, [belowThreshold, fetchInsights]);

	if (belowThreshold && !insights) {
		return (
			<div className="flex items-center justify-center py-8 text-center">
				<p className="text-sm text-muted-foreground">Aguardando mais contexto da conversa.</p>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="grid grid-cols-1 gap-3">
				{Array.from({ length: 4 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
					<Skeleton key={i} className="h-24 w-full rounded-lg" />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 py-8">
				<p className="text-sm text-destructive">{error}</p>
				<Button variant="outline" size="sm" onClick={fetchInsights}>
					Tentar novamente
				</Button>
			</div>
		);
	}

	if (!insights) return null;

	return (
		<div className="grid grid-cols-1 gap-3">
			{/* Intent Card */}
			<Card>
				<CardContent className="flex items-start gap-3 py-3">
					<div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
						<Target className="size-5 text-blue-600" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold">Intencao</p>
						<p className="text-sm text-muted-foreground">{insights.intent || "Nao identificada"}</p>
					</div>
				</CardContent>
			</Card>

			{/* Budget Card */}
			<Card>
				<CardContent className="flex items-start gap-3 py-3">
					<div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
						<DollarSign className="size-5 text-green-600" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold">Orcamento</p>
						<div className="text-sm text-muted-foreground space-y-0.5">
							{insights.budget.monthly != null && (
								<p>{currencyFmt.format(insights.budget.monthly)}/mes</p>
							)}
							{insights.budget.total != null && (
								<p>Total: {currencyFmt.format(insights.budget.total)}</p>
							)}
							{insights.budget.notes && <p>{insights.budget.notes}</p>}
							{insights.budget.monthly == null &&
								insights.budget.total == null &&
								!insights.budget.notes && <p>Nao informado</p>}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Objections Card */}
			<Card>
				<CardContent className="flex items-start gap-3 py-3">
					<div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
						<AlertTriangle className="size-5 text-amber-600" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold">Objecoes</p>
						{insights.objections.length === 0 ? (
							<p className="text-sm text-muted-foreground italic">Nenhuma objecao identificada</p>
						) : (
							<ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
								{insights.objections.map((obj, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: objections rendered atomically per response
									<li key={i}>{obj}</li>
								))}
							</ul>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Next Action Card */}
			<Card className="border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
				<CardContent className="flex items-start gap-3 py-3">
					<div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/30">
						<ArrowRight className="size-5 text-purple-600" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold">Proxima Acao</p>
						<p className="text-sm text-muted-foreground">
							{insights.next_action || "Nao definida"}
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

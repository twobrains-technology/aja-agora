"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Execution = {
	id: string;
	nodeId: string;
	nodeType: string;
	status: "pending" | "running" | "completed" | "failed" | "skipped";
	startedAt: string;
	completedAt: string | null;
	output: Record<string, unknown> | null;
	errorMessage: string | null;
};

type Run = {
	id: string;
	leadId: string;
	leadName: string | null;
	status: "pending" | "running" | "completed" | "failed" | "cancelled";
	startedAt: string;
	completedAt: string | null;
	stepCount: number;
	errorMessage: string | null;
	currentNodeId: string | null;
	executions: Execution[];
};

const STATUS_VARIANT: Record<Run["status"], "default" | "secondary" | "destructive" | "outline"> = {
	pending: "outline",
	running: "secondary",
	completed: "default",
	failed: "destructive",
	cancelled: "outline",
};

interface Props {
	automationId: string;
}

export function RunsTimeline({ automationId }: Props) {
	const [runs, setRuns] = useState<Run[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch(`/api/admin/automations/${automationId}/runs`)
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				const data = (await r.json()) as { runs: Run[] };
				setRuns(data.runs);
			})
			.catch((e) => setError(e.message));
	}, [automationId]);

	if (error)
		return (
			<div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
				{error}
			</div>
		);
	if (!runs)
		return (
			<div className="space-y-2">
				<Skeleton className="h-20 w-full" />
				<Skeleton className="h-20 w-full" />
			</div>
		);
	if (runs.length === 0)
		return (
			<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
				Sem execuções ainda. Mude o stage de um lead pra disparar.
			</div>
		);

	return (
		<div className="space-y-3">
			{runs.map((r) => (
				<div key={r.id} className="rounded-lg border bg-card p-3">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2 text-sm">
							<Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
							<span className="font-medium">{r.leadName ?? r.leadId.slice(0, 8)}</span>
							<span className="text-muted-foreground">
								{new Date(r.startedAt).toLocaleString()}
							</span>
						</div>
						<span className="text-xs text-muted-foreground">{r.stepCount} step(s)</span>
					</div>
					{r.errorMessage ? (
						<p className="text-xs text-destructive mt-1 font-mono">{r.errorMessage}</p>
					) : null}
					{r.executions.length > 0 ? (
						<ul className="mt-2 space-y-1 text-xs">
							{r.executions.map((ex) => (
								<li key={ex.id} className="flex items-center gap-2">
									<span
										className={
											ex.status === "failed"
												? "text-destructive"
												: ex.status === "completed"
													? "text-emerald-600"
													: "text-muted-foreground"
										}
									>
										●
									</span>
									<span className="font-mono">{ex.nodeType}</span>
									<span className="text-muted-foreground">({ex.status})</span>
									{ex.errorMessage ? (
										<span className="text-destructive">— {ex.errorMessage}</span>
									) : null}
								</li>
							))}
						</ul>
					) : null}
				</div>
			))}
		</div>
	);
}

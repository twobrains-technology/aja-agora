"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type AutomationRow = {
	id: string;
	name: string;
	description: string | null;
	triggerType: "stage_changed" | "idle_in_stage" | "chat_event";
	enabled: boolean;
	version: number;
	createdAt: string;
	updatedAt: string;
};

const TRIGGER_LABEL: Record<AutomationRow["triggerType"], string> = {
	stage_changed: "Mudança de stage",
	idle_in_stage: "Lead parado",
	chat_event: "Evento de chat",
};

export function AutomationsList() {
	const [rows, setRows] = useState<AutomationRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/admin/automations")
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				const data = (await r.json()) as { automations: AutomationRow[] };
				setRows(data.automations);
			})
			.catch((e) => setError(e.message));
	}, []);

	if (error) {
		return (
			<div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
				Erro: {error}
			</div>
		);
	}
	if (!rows) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
			</div>
		);
	}
	if (rows.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
				Nenhuma automação criada. Clique em &ldquo;Nova automação&rdquo; ou em &ldquo;Gerar com
				IA&rdquo; para começar.
			</div>
		);
	}

	return (
		<div className="grid gap-3">
			{rows.map((a) => (
				<Link
					key={a.id}
					href={`/admin/automations/${a.id}`}
					className="block rounded-lg border bg-card p-4 transition hover:bg-accent"
				>
					<div className="flex items-start justify-between gap-3">
						<div>
							<div className="flex items-center gap-2">
								<h3 className="font-medium">{a.name}</h3>
								<Badge variant={a.enabled ? "default" : "outline"}>
									{a.enabled ? "Ativa" : "Inativa"}
								</Badge>
							</div>
							{a.description ? (
								<p className="text-sm text-muted-foreground mt-1">{a.description}</p>
							) : null}
							<p className="text-xs text-muted-foreground mt-2">
								Trigger: {TRIGGER_LABEL[a.triggerType]} • v{a.version}
							</p>
						</div>
					</div>
				</Link>
			))}
		</div>
	);
}

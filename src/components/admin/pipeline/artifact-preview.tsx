"use client";

import { BarChart3, Calculator, FileText, Star, Users } from "lucide-react";
import type { ComponentType } from "react";

const ARTIFACT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
	group_card: Users,
	simulation_result: Calculator,
	recommendation_card: Star,
	comparison_table: BarChart3,
};

const ARTIFACT_LABELS: Record<string, string> = {
	group_card: "Grupo",
	simulation_result: "Simulacao",
	recommendation_card: "Recomendacao",
	comparison_table: "Comparacao",
};

const brlFormatter = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function formatBRL(value: unknown): string {
	const num = Number(value);
	if (Number.isNaN(num)) return "—";
	return brlFormatter.format(num);
}

function getArtifactSummary(type: string, payload: Record<string, unknown>): string {
	switch (type) {
		case "group_card":
			return `${payload.administradora} - ${formatBRL(payload.creditValue)} (${payload.termMonths} meses)`;
		case "simulation_result":
			return `${formatBRL(payload.monthlyPayment)}/mes, ${payload.termMonths} meses`;
		case "recommendation_card":
			return `${payload.administradora} - Score ${Math.round((payload.score as number) * 100)}%`;
		case "comparison_table": {
			const groups = payload.groups as unknown[] | undefined;
			return `${groups?.length ?? 0} grupos comparados`;
		}
		default:
			return type;
	}
}

export function ArtifactPreview({
	type,
	payload,
}: {
	type: string;
	payload: Record<string, unknown>;
}) {
	const Icon = ARTIFACT_ICONS[type] ?? FileText;
	const label = ARTIFACT_LABELS[type] ?? type;
	const summary = getArtifactSummary(type, payload);

	return (
		<div className="bg-muted/50 rounded-md px-3 py-2 flex items-center gap-2">
			<Icon className="size-4 text-muted-foreground shrink-0" />
			<span className="text-xs font-bold">{label}</span>
			<span className="text-xs text-muted-foreground truncate">{summary}</span>
		</div>
	);
}

import { cn } from "@/lib/utils";

type Props = {
	score: number | null;
	className?: string;
};

export function EvaluationBadge({ score, className }: Props) {
	if (score === null) {
		return (
			<span
				className={cn(
					"inline-flex items-center justify-center rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground tabular-nums",
					className,
				)}
				title="Ainda não avaliada"
			>
				—
			</span>
		);
	}

	const pct = Math.round(score * 100);
	const tone = score < 0.4 ? "danger" : score < 0.75 ? "warning" : "success";
	const styles =
		tone === "danger"
			? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
			: tone === "warning"
				? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
				: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

	return (
		<span
			className={cn(
				"inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums",
				styles,
				className,
			)}
			title={`Avaliação: ${pct}%`}
		>
			{pct}%
		</span>
	);
}

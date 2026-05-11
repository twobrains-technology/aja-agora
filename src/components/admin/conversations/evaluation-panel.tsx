"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import type { LucideIcon } from "lucide-react";
import {
	AlertTriangle,
	Award,
	BarChart3,
	CheckCircle2,
	GitBranch,
	Hourglass,
	RefreshCw,
	Search,
	ShieldCheck,
	Sparkles,
	TrendingUp,
	XCircle,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyStateCard } from "@/components/admin/empty-state-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { EvalDimensionPayload, EvalDimensionsPayload, EvalFlagsPayload } from "@/db/schema";
import { MIN_USER_TURNS } from "@/lib/eval/eligibility";
import { cn } from "@/lib/utils";

type EvalRow = {
	id: string;
	overallScore: string | null;
	dimensions: EvalDimensionsPayload | null;
	flags: EvalFlagsPayload | null;
	topIssues: string[] | null;
	topStrengths: string[] | null;
	rubricVersion: string;
	judgeModel: string;
	tokensInput: number | null;
	tokensOutput: number | null;
	evaluatedAt: string;
	error: string | null;
};

type Response = { evaluation: EvalRow; source: string };

const DIMENSION_META: Record<string, { label: string; icon: LucideIcon }> = {
	engajamento: { label: "Engajamento", icon: Zap },
	discovery: { label: "Discovery", icon: Search },
	continuidade: { label: "Continuidade", icon: GitBranch },
	naturalidade: { label: "Naturalidade", icon: Sparkles },
	assertividade: { label: "Assertividade", icon: ShieldCheck },
	conversao: { label: "Conversão", icon: TrendingUp },
};

const FLAG_LABELS: Record<string, string> = {
	hallucination: "Alucinação",
	missedHandoff: "Handoff perdido",
	incompleteDiscovery: "Discovery incompleto",
	lowEngagement: "Baixo engajamento",
};

type Tone = "danger" | "warning" | "success";

function toneOf(score: number): Tone {
	if (score < 0.4) return "danger";
	if (score < 0.75) return "warning";
	return "success";
}

const TONE_BG: Record<Tone, string> = {
	danger: "bg-red-100 dark:bg-red-900/30",
	warning: "bg-amber-100 dark:bg-amber-900/30",
	success: "bg-emerald-100 dark:bg-emerald-900/30",
};

const TONE_TEXT: Record<Tone, string> = {
	danger: "text-red-600 dark:text-red-400",
	warning: "text-amber-600 dark:text-amber-400",
	success: "text-emerald-600 dark:text-emerald-400",
};

const TONE_BAR: Record<Tone, string> = {
	danger: "bg-red-500",
	warning: "bg-amber-500",
	success: "bg-emerald-500",
};

const TONE_LABEL: Record<Tone, string> = {
	danger: "Atenção",
	warning: "Médio",
	success: "Bom",
};

interface EvaluationPanelProps {
	conversationId: string;
	userTurnCount?: number;
}

export function EvaluationPanel({ conversationId, userTurnCount }: EvaluationPanelProps) {
	const [data, setData] = useState<EvalRow | null>(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const belowThreshold = userTurnCount !== undefined && userTurnCount < MIN_USER_TURNS;

	const fetchEval = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/conversations/${conversationId}/eval`, {
				cache: "no-store",
			});
			if (res.status === 404) {
				setData(null);
				return;
			}
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			const json = (await res.json()) as Response;
			setData(json.evaluation);
		} catch (err) {
			console.error("[evaluation-panel] fetch failed:", err);
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [conversationId]);

	useEffect(() => {
		void fetchEval();
	}, [fetchEval]);

	const triggerEval = useCallback(async () => {
		setSubmitting(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/conversations/${conversationId}/eval`, {
				method: "POST",
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
				const message = body.reason ? `${body.error ?? "Erro"}: ${body.reason}` : body.error;
				throw new Error(message ?? `HTTP ${res.status}`);
			}
			const json = (await res.json()) as Response;
			setData(json.evaluation);
		} catch (err) {
			console.error("[evaluation-panel] trigger failed:", err);
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSubmitting(false);
		}
	}, [conversationId]);

	if (belowThreshold && !data) {
		return (
			<EmptyStateCard
				icon={Hourglass}
				iconBg="bg-blue-100 dark:bg-blue-900/30"
				iconColor="text-blue-600 dark:text-blue-400"
				title="Aguardando mais contexto"
				description={`A avaliação fica disponível quando a conversa tiver pelo menos ${MIN_USER_TURNS} turnos do usuário.`}
			/>
		);
	}

	if (loading) {
		return (
			<div className="grid grid-cols-1 gap-3 p-4">
				{Array.from({ length: 4 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
					<Skeleton key={i} className="h-24 w-full rounded-lg" />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<EmptyStateCard
				icon={AlertTriangle}
				iconBg="bg-red-100 dark:bg-red-900/30"
				iconColor="text-red-600 dark:text-red-400"
				title="Não foi possível carregar"
				description="Tente novamente em instantes."
				action={{
					label: "Tentar novamente",
					onClick: triggerEval,
					disabled: submitting,
				}}
			/>
		);
	}

	if (!data) {
		return (
			<EmptyStateCard
				icon={Award}
				iconBg="bg-muted"
				iconColor="text-muted-foreground"
				title="Ainda não avaliada"
				description="Gere a primeira análise de qualidade desta conversa."
				action={{
					label: submitting ? "Avaliando..." : "Avaliar agora",
					onClick: triggerEval,
					disabled: submitting,
				}}
			/>
		);
	}

	if (data.error) {
		return (
			<EmptyStateCard
				icon={AlertTriangle}
				iconBg="bg-red-100 dark:bg-red-900/30"
				iconColor="text-red-600 dark:text-red-400"
				title="Falha ao avaliar"
				description="Tivemos um problema ao gerar a avaliação. Você pode tentar novamente."
				action={{
					label: "Tentar novamente",
					onClick: triggerEval,
					disabled: submitting,
				}}
			/>
		);
	}

	const overall = data.overallScore !== null ? Number(data.overallScore) : null;
	const activeFlags = data.flags
		? Object.entries(data.flags)
				.filter(([, v]) => v)
				.map(([k]) => k)
		: [];

	return (
		<div className="grid grid-cols-1 gap-3 p-4">
			{overall !== null && <OverallCard score={overall} />}

			{activeFlags.length > 0 && <FlagsCard flags={activeFlags} />}

			{data.dimensions && <DimensionsCard dimensions={data.dimensions} />}

			{data.topStrengths && data.topStrengths.length > 0 && (
				<ListCard
					icon={CheckCircle2}
					iconBg="bg-emerald-100 dark:bg-emerald-900/30"
					iconColor="text-emerald-600 dark:text-emerald-400"
					title="Pontos fortes"
					items={data.topStrengths}
				/>
			)}

			{data.topIssues && data.topIssues.length > 0 && (
				<ListCard
					icon={XCircle}
					iconBg="bg-amber-100 dark:bg-amber-900/30"
					iconColor="text-amber-600 dark:text-amber-400"
					title="Problemas"
					items={data.topIssues}
				/>
			)}

			<div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
				<span>
					Avaliada em {format(new Date(data.evaluatedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
				</span>
				<Button onClick={triggerEval} disabled={submitting} size="sm" variant="ghost">
					<RefreshCw className={submitting ? "size-3.5 animate-spin" : "size-3.5"} />
					{submitting ? "Avaliando..." : "Reavaliar"}
				</Button>
			</div>
		</div>
	);
}

function OverallCard({ score }: { score: number }) {
	const pct = Math.round(score * 100);
	const tone = toneOf(score);
	const wrapper =
		tone === "success"
			? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
			: tone === "warning"
				? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
				: "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20";
	return (
		<Card className={wrapper}>
			<CardContent className="flex items-start gap-3 py-3">
				<div className={cn("p-2 rounded-full", TONE_BG[tone])}>
					<Award className={cn("size-5", TONE_TEXT[tone])} />
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold">Qualidade geral</p>
					<div className="flex items-baseline gap-2 mt-0.5">
						<span className="text-2xl font-bold tabular-nums leading-none">{pct}%</span>
						<span className={cn("text-xs font-medium", TONE_TEXT[tone])}>{TONE_LABEL[tone]}</span>
					</div>
					<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
						<div className={cn("h-full", TONE_BAR[tone])} style={{ width: `${pct}%` }} />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function FlagsCard({ flags }: { flags: string[] }) {
	return (
		<Card>
			<CardContent className="flex items-start gap-3 py-3">
				<div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
					<AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold">Alertas</p>
					<div className="mt-1.5 flex flex-wrap gap-1.5">
						{flags.map((key) => (
							<span
								key={key}
								className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
							>
								{FLAG_LABELS[key] ?? key}
							</span>
						))}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function DimensionsCard({ dimensions }: { dimensions: EvalDimensionsPayload }) {
	return (
		<Card>
			<CardContent className="flex items-start gap-3 py-3">
				<div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
					<BarChart3 className="size-5 text-blue-600 dark:text-blue-400" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold">Dimensões</p>
					<div className="mt-2 space-y-2">
						{Object.entries(DIMENSION_META).map(([key, meta]) => {
							const dim = dimensions[key as keyof EvalDimensionsPayload] as
								| EvalDimensionPayload
								| undefined;
							if (!dim) return null;
							return (
								<DimensionRow
									key={key}
									label={meta.label}
									icon={meta.icon}
									score={dim.score}
									reasoning={dim.reasoning}
								/>
							);
						})}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function DimensionRow({
	label,
	icon: Icon,
	score,
	reasoning,
}: {
	label: string;
	icon: LucideIcon;
	score: number;
	reasoning: string;
}) {
	const pct = Math.round(score * 100);
	const tone = toneOf(score);
	return (
		<div className="space-y-1" title={reasoning}>
			<div className="flex items-center justify-between text-xs">
				<span className="flex items-center gap-1.5 text-foreground">
					<Icon className={cn("size-3.5", TONE_TEXT[tone])} />
					<span className="font-medium">{label}</span>
				</span>
				<span className="font-semibold tabular-nums">{pct}%</span>
			</div>
			<div className="h-1 w-full overflow-hidden rounded-full bg-muted">
				<div className={cn("h-full", TONE_BAR[tone])} style={{ width: `${pct}%` }} />
			</div>
		</div>
	);
}

function ListCard({
	icon: Icon,
	iconBg,
	iconColor,
	title,
	items,
}: {
	icon: LucideIcon;
	iconBg: string;
	iconColor: string;
	title: string;
	items: string[];
}) {
	return (
		<Card>
			<CardContent className="flex items-start gap-3 py-3">
				<div className={cn("p-2 rounded-full", iconBg)}>
					<Icon className={cn("size-5", iconColor)} />
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold">{title}</p>
					<ul className="mt-1 text-sm text-muted-foreground list-disc list-inside space-y-0.5">
						{items.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</div>
			</CardContent>
		</Card>
	);
}

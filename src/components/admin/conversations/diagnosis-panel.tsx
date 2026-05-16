"use client";

import { AlertOctagon, BookOpen, ListChecks, ShieldAlert, Sparkles, X } from "lucide-react";
import { useCallback, useState } from "react";
import { EmptyStateCard } from "@/components/admin/empty-state-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
	DiagnosisResult,
	SuggestedExample,
	SuggestedForbiddenTopic,
	SuggestedHandoffTrigger,
} from "@/lib/diagnose/types";

type Props = {
	conversationId: string;
	canDiagnose: boolean;
};

type DiagnosisResponse = {
	diagnosis: DiagnosisResult;
	meta: { personaId: string; evaluationId: string };
};

type ApplyState = "idle" | "applying" | "applied" | "error";

export function DiagnosisPanel({ conversationId, canDiagnose }: Props) {
	const [data, setData] = useState<DiagnosisResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [applyStates, setApplyStates] = useState<Record<string, ApplyState>>({});
	const [dismissed, setDismissed] = useState<Set<string>>(new Set());

	const runDiagnosis = useCallback(async () => {
		setLoading(true);
		setError(null);
		setApplyStates({});
		setDismissed(new Set());
		try {
			const res = await fetch(`/api/admin/conversations/${conversationId}/diagnose`, {
				method: "POST",
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
				throw new Error(body.reason ? `${body.error ?? "Erro"}: ${body.reason}` : (body.error ?? `HTTP ${res.status}`));
			}
			const json = (await res.json()) as DiagnosisResponse;
			setData(json);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [conversationId]);

	const applyItem = useCallback(
		async (key: string, endpoint: string, payload: Record<string, unknown>) => {
			if (!data) return;
			setApplyStates((s) => ({ ...s, [key]: "applying" }));
			try {
				const res = await fetch(`/api/admin/personas/${data.meta.personaId}/${endpoint}`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { error?: string };
					throw new Error(body.error ?? `HTTP ${res.status}`);
				}
				setApplyStates((s) => ({ ...s, [key]: "applied" }));
			} catch (err) {
				console.error("[diagnosis-panel] apply failed:", err);
				setApplyStates((s) => ({ ...s, [key]: "error" }));
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[data],
	);

	const dismiss = useCallback((key: string) => {
		setDismissed((s) => new Set(s).add(key));
	}, []);

	if (!canDiagnose) return null;

	if (!data && !loading && !error) {
		return (
			<Card>
				<CardContent className="flex items-start gap-3 py-3">
					<div className="p-2 rounded-full bg-violet-100 dark:bg-violet-900/30">
						<Sparkles className="size-5 text-violet-600 dark:text-violet-400" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold">Diagnosticar com IA</p>
						<p className="text-xs text-muted-foreground mt-0.5">
							A IA analisa a conversa e sugere correções pra persona.
						</p>
						<Button size="sm" className="mt-2" onClick={runDiagnosis}>
							<Sparkles className="size-3.5" />
							Diagnosticar
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (loading) {
		return (
			<Card>
				<CardContent className="flex items-center gap-3 py-3">
					<Sparkles className="size-5 text-violet-600 animate-pulse" />
					<p className="text-sm text-muted-foreground">Diagnosticando... isso leva uns 10s.</p>
				</CardContent>
			</Card>
		);
	}

	if (error && !data) {
		return (
			<EmptyStateCard
				icon={AlertOctagon}
				iconBg="bg-red-100 dark:bg-red-900/30"
				iconColor="text-red-600 dark:text-red-400"
				title="Falha no diagnóstico"
				description={error}
				action={{ label: "Tentar novamente", onClick: runDiagnosis }}
			/>
		);
	}

	if (!data) return null;

	const { diagnosis, meta } = data;
	const totalSuggestions =
		diagnosis.suggestedExamples.length +
		diagnosis.suggestedForbiddenTopics.length +
		diagnosis.suggestedHandoffTriggers.length;

	return (
		<div className="space-y-3">
			<Card>
				<CardContent className="flex items-start gap-3 py-3">
					<div className="p-2 rounded-full bg-violet-100 dark:bg-violet-900/30">
						<Sparkles className="size-5 text-violet-600 dark:text-violet-400" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold">Causa raiz</p>
						<p className="text-sm text-muted-foreground mt-1">{diagnosis.rootCause}</p>
						<p className="text-xs text-muted-foreground mt-2">
							{totalSuggestions === 0
								? "Sem correções acionáveis sugeridas."
								: `${totalSuggestions} sugestão(ões) — aplique as que fazem sentido.`}
						</p>
					</div>
				</CardContent>
			</Card>

			{diagnosis.suggestedExamples.map((ex, i) => {
				const key = `example-${i}`;
				if (dismissed.has(key)) return null;
				return (
					<SuggestionCard
						key={key}
						icon={BookOpen}
						iconColor="text-blue-600 dark:text-blue-400"
						iconBg="bg-blue-100 dark:bg-blue-900/30"
						label="Exemplo"
						state={applyStates[key] ?? "idle"}
						onApply={() =>
							applyItem(key, "examples", {
								whenExpertise: ex.whenExpertise,
								whenCategory: ex.whenCategory,
								whenChannel: ex.whenChannel,
								whenIntent: ex.whenIntent,
								userMessage: ex.userMessage,
								assistantResponse: ex.assistantResponse,
								origin: "diagnosis",
								sourceConversationId: conversationId,
							})
						}
						onDismiss={() => dismiss(key)}
					>
						<ExampleBody example={ex} />
					</SuggestionCard>
				);
			})}

			{diagnosis.suggestedForbiddenTopics.map((t, i) => {
				const key = `topic-${i}`;
				if (dismissed.has(key)) return null;
				return (
					<SuggestionCard
						key={key}
						icon={ShieldAlert}
						iconColor="text-amber-600 dark:text-amber-400"
						iconBg="bg-amber-100 dark:bg-amber-900/30"
						label="Tópico proibido"
						state={applyStates[key] ?? "idle"}
						onApply={() =>
							applyItem(key, "forbidden-topics", {
								topic: t.topic,
								responseWhenAsked: t.responseWhenAsked,
							})
						}
						onDismiss={() => dismiss(key)}
					>
						<ForbiddenTopicBody topic={t} />
					</SuggestionCard>
				);
			})}

			{diagnosis.suggestedHandoffTriggers.map((trig, i) => {
				const key = `trigger-${i}`;
				if (dismissed.has(key)) return null;
				return (
					<SuggestionCard
						key={key}
						icon={ListChecks}
						iconColor="text-purple-600 dark:text-purple-400"
						iconBg="bg-purple-100 dark:bg-purple-900/30"
						label="Trigger de handoff"
						state={applyStates[key] ?? "idle"}
						onApply={() => applyItem(key, "handoff-triggers", { condition: trig.condition })}
						onDismiss={() => dismiss(key)}
					>
						<HandoffTriggerBody trigger={trig} />
					</SuggestionCard>
				);
			})}

			<div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
				<span>Persona: {meta.personaId}</span>
				<Button size="sm" variant="ghost" onClick={runDiagnosis}>
					<Sparkles className="size-3.5" />
					Diagnosticar de novo
				</Button>
			</div>
		</div>
	);
}

function SuggestionCard({
	icon: Icon,
	iconColor,
	iconBg,
	label,
	state,
	onApply,
	onDismiss,
	children,
}: {
	icon: typeof Sparkles;
	iconColor: string;
	iconBg: string;
	label: string;
	state: ApplyState;
	onApply: () => void;
	onDismiss: () => void;
	children: React.ReactNode;
}) {
	const applied = state === "applied";
	const applying = state === "applying";
	return (
		<Card className={applied ? "opacity-60" : ""}>
			<CardContent className="py-3 space-y-2">
				<div className="flex items-start gap-3">
					<div className={`p-2 rounded-full ${iconBg}`}>
						<Icon className={`size-4 ${iconColor}`} />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								{label}
							</span>
							<div className="flex items-center gap-1">
								{applied ? (
									<span className="text-xs text-emerald-600 dark:text-emerald-400">✓ Aplicado</span>
								) : (
									<>
										<Button size="sm" disabled={applying} onClick={onApply}>
											{applying ? "Aplicando..." : "Aplicar"}
										</Button>
										<Button
											size="icon-sm"
											variant="ghost"
											onClick={onDismiss}
											aria-label="Descartar"
										>
											<X className="size-3.5" />
										</Button>
									</>
								)}
							</div>
						</div>
						<div className="mt-2">{children}</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function ExampleBody({ example }: { example: SuggestedExample }) {
	const conds: string[] = [];
	if (example.whenExpertise) conds.push(`expertise=${example.whenExpertise.join("|")}`);
	if (example.whenCategory) conds.push(`categoria=${example.whenCategory.join("|")}`);
	if (example.whenChannel) conds.push(`canal=${example.whenChannel}`);
	if (example.whenIntent) conds.push(`intent=${example.whenIntent.join("|")}`);

	return (
		<div className="space-y-2 text-sm">
			{conds.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{conds.map((c) => (
						<span
							key={c}
							className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium"
						>
							{c}
						</span>
					))}
				</div>
			)}
			<div className="rounded border bg-muted/40 p-2 text-xs space-y-1">
				<p>
					<span className="font-semibold">User:</span> {example.userMessage}
				</p>
				<p>
					<span className="font-semibold">Persona:</span> {example.assistantResponse}
				</p>
			</div>
			<p className="text-xs text-muted-foreground italic">{example.rationale}</p>
		</div>
	);
}

function ForbiddenTopicBody({ topic }: { topic: SuggestedForbiddenTopic }) {
	return (
		<div className="space-y-2 text-sm">
			<p className="font-medium">{topic.topic}</p>
			<p className="text-xs text-muted-foreground">
				<span className="font-semibold">Quando perguntado:</span> {topic.responseWhenAsked}
			</p>
			<p className="text-xs text-muted-foreground italic">{topic.rationale}</p>
		</div>
	);
}

function HandoffTriggerBody({ trigger }: { trigger: SuggestedHandoffTrigger }) {
	return (
		<div className="space-y-2 text-sm">
			<p>{trigger.condition}</p>
			<p className="text-xs text-muted-foreground italic">{trigger.rationale}</p>
		</div>
	);
}

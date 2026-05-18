"use client";

import {
	AlertTriangleIcon,
	ChevronRightIcon,
	ClockIcon,
	LoaderIcon,
	RotateCcwIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MemoryDevPanelProps {
	conversationId: string;
}

interface MemorySnapshot {
	identity: { kind: string; value: string; namespace: string } | null;
	agentExists: boolean;
	block: Record<string, unknown> | null;
	daysSinceLastInteraction: number | null;
	reactivationHint: string | null;
	archivalSample: Array<{ id: string; text: string; createdAt: string }>;
	clockOffsetMs: number;
	simulatedNow: string;
	lettaAvailable: boolean;
	webEngagementProgress: { current: number; required: number } | null;
}

const PRESET_DAYS = [1, 3, 7, 30];

/**
 * Drawer lateral 320px no simulador (web e WhatsApp) mostrando:
 *   - Clock real vs simulado + botões de avançar tempo / reset
 *   - Identidade Letta da conversa (se existe)
 *   - Bloco humano JSON (colapsável)
 *   - Archival sample top-10 (colapsável)
 *   - Preview do hint de reativação que próximo turno injetaria
 *
 * Polling 3s. Re-fetch imediato após ações.
 */
export function MemoryDevPanel({ conversationId }: MemoryDevPanelProps) {
	const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [collapsed, setCollapsed] = useState(false);
	const [blockOpen, setBlockOpen] = useState(false);
	const [archivalOpen, setArchivalOpen] = useState(false);
	const [customDays, setCustomDays] = useState<string>("");
	const [busy, setBusy] = useState(false);

	const fetchSnapshot = useCallback(async () => {
		try {
			const res = await fetch(`/api/admin/simulator/sessions/${conversationId}/memory`, {
				cache: "no-store",
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as MemorySnapshot;
			setSnapshot(data);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [conversationId]);

	useEffect(() => {
		if (!conversationId || collapsed) return;
		void fetchSnapshot();
		const t = setInterval(fetchSnapshot, 3000);
		return () => clearInterval(t);
	}, [conversationId, collapsed, fetchSnapshot]);

	const advance = useCallback(
		async (days: number) => {
			setBusy(true);
			try {
				const res = await fetch(`/api/admin/simulator/sessions/${conversationId}/clock`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ advanceDays: days }),
				});
				if (!res.ok) {
					const body = await res.text().catch(() => "");
					throw new Error(`HTTP ${res.status} ${body}`);
				}
				await fetchSnapshot();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusy(false);
			}
		},
		[conversationId, fetchSnapshot],
	);

	const reset = useCallback(async () => {
		setBusy(true);
		try {
			const res = await fetch(`/api/admin/simulator/sessions/${conversationId}/clock/reset`, {
				method: "POST",
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			await fetchSnapshot();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}, [conversationId, fetchSnapshot]);

	if (collapsed) {
		return (
			<aside
				className="flex w-10 shrink-0 cursor-pointer flex-col items-center gap-2 border-l bg-muted/30 py-3 text-xs text-muted-foreground hover:bg-muted/50"
				onClick={() => setCollapsed(false)}
				role="button"
				aria-label="Abrir painel de memória"
			>
				<ClockIcon className="size-4" />
				<span
					className="rotate-180 text-[10px]"
					style={{ writingMode: "vertical-rl" as React.CSSProperties["writingMode"] }}
				>
					Memória
				</span>
			</aside>
		);
	}

	const realNow = new Date();
	const simNow = snapshot ? new Date(snapshot.simulatedNow) : realNow;
	const offsetDays = snapshot ? Math.floor(snapshot.clockOffsetMs / 86_400_000) : 0;
	const offsetHours = snapshot
		? Math.floor((snapshot.clockOffsetMs % 86_400_000) / 3_600_000)
		: 0;

	return (
		<aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l bg-card text-card-foreground">
			<header className="flex items-center justify-between gap-2 border-b px-3 py-2">
				<div className="flex items-center gap-2">
					<ClockIcon className="size-4 text-primary" />
					<span className="text-sm font-semibold">Memória</span>
				</div>
				<button
					type="button"
					onClick={() => setCollapsed(true)}
					className="text-muted-foreground hover:text-foreground"
					aria-label="Fechar painel"
				>
					<ChevronRightIcon className="size-4" />
				</button>
			</header>

			<div className="space-y-4 p-3 text-xs">
				{loading && !snapshot ? (
					<div className="flex items-center justify-center py-6 text-muted-foreground">
						<LoaderIcon className="size-4 animate-spin" />
					</div>
				) : (
					<>
						{error && (
							<div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
								{error}
							</div>
						)}

						{snapshot && !snapshot.lettaAvailable && (
							<div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-900 dark:text-amber-100">
								<AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
								<span className="text-[11px]">
									Letta offline (fallback Noop). Memória não persistirá esta interação.
								</span>
							</div>
						)}

						{/* Clock */}
						<section className="space-y-1.5">
							<div>
								<div className="text-[10px] uppercase tracking-wide text-muted-foreground">
									Agora real
								</div>
								<div className="font-mono text-xs">{realNow.toLocaleString("pt-BR")}</div>
							</div>
							<div>
								<div className="text-[10px] uppercase tracking-wide text-muted-foreground">
									Agora simulado
								</div>
								<div className="font-mono text-xs">{simNow.toLocaleString("pt-BR")}</div>
								<div className="text-[10px] text-muted-foreground">
									(+{offsetDays}d {offsetHours}h)
								</div>
							</div>
						</section>

						<section className="space-y-2">
							<div className="grid grid-cols-2 gap-1.5">
								{PRESET_DAYS.map((d) => (
									<Button
										key={d}
										variant="outline"
										size="sm"
										disabled={busy}
										onClick={() => void advance(d)}
										className="h-7 text-[11px]"
									>
										+{d} {d === 1 ? "dia" : "dias"}
									</Button>
								))}
							</div>
							<div className="flex gap-1.5">
								<Input
									type="number"
									min="1"
									max="3650"
									step="1"
									placeholder="X dias"
									value={customDays}
									onChange={(e) => setCustomDays(e.target.value)}
									className="h-7 text-[11px]"
								/>
								<Button
									size="sm"
									variant="outline"
									disabled={busy || !customDays}
									onClick={() => {
										const n = Number(customDays);
										if (!Number.isInteger(n) || n <= 0) return;
										void advance(n);
										setCustomDays("");
									}}
									className="h-7 px-2 text-[11px]"
								>
									Avançar
								</Button>
							</div>
							<Button
								size="sm"
								variant="ghost"
								disabled={busy}
								onClick={() => void reset()}
								className="h-7 w-full text-[11px]"
							>
								<RotateCcwIcon className="mr-1 size-3" />
								Resetar
							</Button>
						</section>

						<hr className="border-border/60" />

						{/* Letta state */}
						<section className="space-y-2">
							<div className="text-[10px] uppercase tracking-wide text-muted-foreground">
								Letta
							</div>
							{snapshot?.identity ? (
								<div>
									<div className="font-mono text-[11px]">
										{snapshot.identity.kind}: {truncateMiddle(snapshot.identity.value, 28)}
									</div>
									<div className="text-[10px] text-muted-foreground">
										ns: {snapshot.identity.namespace}
									</div>
								</div>
							) : (
								<div className="text-[11px] italic text-muted-foreground">
									Sem identidade ainda
								</div>
							)}
							{snapshot?.webEngagementProgress && (
								<div className="rounded border bg-muted/30 p-2 text-[11px]">
									{snapshot.webEngagementProgress.current}/
									{snapshot.webEngagementProgress.required} turnos para criação automática do
									agent Letta.
								</div>
							)}
							{snapshot && (
								<div className="text-[11px]">
									Agent:{" "}
									{snapshot.agentExists ? (
										<span className="font-medium text-emerald-600">existe</span>
									) : (
										<span className="text-muted-foreground">ainda não</span>
									)}
								</div>
							)}
							{snapshot?.daysSinceLastInteraction !== null && (
								<div className="text-[11px]">
									Dias desde última: {snapshot?.daysSinceLastInteraction}
								</div>
							)}
							{snapshot?.reactivationHint && (
								<div className="rounded border border-primary/30 bg-primary/5 p-2 text-[11px]">
									<div className="mb-0.5 text-[10px] uppercase tracking-wide text-primary">
										Próximo hint
									</div>
									{snapshot.reactivationHint}
								</div>
							)}
						</section>

						{/* Block JSON */}
						{snapshot?.block && (
							<section>
								<button
									type="button"
									onClick={() => setBlockOpen((v) => !v)}
									className="flex w-full items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
								>
									<ChevronRightIcon
										className={cn(
											"size-3 transition-transform",
											blockOpen && "rotate-90",
										)}
									/>
									Bloco humano (JSON)
								</button>
								{blockOpen && (
									<pre className="mt-1 max-h-64 overflow-auto rounded border bg-muted/20 p-2 font-mono text-[10px] leading-tight">
										{JSON.stringify(snapshot.block, null, 2)}
									</pre>
								)}
							</section>
						)}

						{/* Archival */}
						{snapshot && snapshot.archivalSample.length > 0 && (
							<section>
								<button
									type="button"
									onClick={() => setArchivalOpen((v) => !v)}
									className="flex w-full items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
								>
									<ChevronRightIcon
										className={cn(
											"size-3 transition-transform",
											archivalOpen && "rotate-90",
										)}
									/>
									Archival ({snapshot.archivalSample.length})
								</button>
								{archivalOpen && (
									<ul className="mt-1 max-h-64 space-y-1.5 overflow-auto rounded border bg-muted/20 p-2">
										{snapshot.archivalSample.map((e) => (
											<li key={e.id} className="text-[10px]">
												<div className="font-mono text-muted-foreground">
													{new Date(e.createdAt).toLocaleDateString("pt-BR")}
												</div>
												<div>{e.text.slice(0, 100)}</div>
											</li>
										))}
									</ul>
								)}
							</section>
						)}

						<div className="border-t pt-2 text-[10px] italic text-muted-foreground">
							Avançar o tempo afeta apenas esta conversa simulada
							(<code>is_simulated=true</code>). Conversa real não é impactada.
						</div>
					</>
				)}
			</div>
		</aside>
	);
}

function truncateMiddle(s: string, max: number): string {
	if (s.length <= max) return s;
	const head = Math.ceil(max / 2) - 1;
	const tail = Math.floor(max / 2) - 2;
	return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}

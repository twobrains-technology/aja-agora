"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ScenariosPayload } from "@/lib/chat/types";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const SCENARIO_META = [
	{ key: "conservador" as const, label: "Conservador" },
	{ key: "provavel" as const, label: "Provável" },
	{ key: "acelerado" as const, label: "Acelerado" },
];

export function Scenarios({ payload }: { payload: ScenariosPayload }) {
	return (
		<Card className="w-full max-w-[360px] rounded-[18px] shadow-lg overflow-hidden">
			<CardHeader className="pb-0 pt-4 px-4">
				<p className="aja-eyebrow">
					3 cenários · {payload.administradora} ·{" "}
					<span className="aja-num">{formatBRL(payload.creditValue)}</span>
				</p>
			</CardHeader>
			<CardContent className="space-y-2.5 p-4 pt-3">
				{SCENARIO_META.map(({ key, label }) => {
					const s = payload.scenarios[key];
					const isProvavel = key === "provavel";
					return (
						<div
							key={key}
							className={
								isProvavel
									? "rounded-xl border border-primary/30 bg-primary/[0.04] p-3"
									: "rounded-xl border border-border bg-card p-3"
							}
							data-testid={`scenario-${key}`}
						>
							<div className="flex items-baseline justify-between gap-2">
								<p
									className={
										isProvavel
											? "text-sm font-semibold text-foreground"
											: "text-sm font-semibold text-foreground"
									}
								>
									{label}
								</p>
								<p className="aja-num text-xs text-muted-foreground shrink-0">
									~{s.expectedTermMonths} meses
								</p>
							</div>
							<p className="text-xs leading-relaxed mt-1 text-foreground">{s.strategy}</p>
							{s.lanceValue > 0 && (
								<p className="text-xs mt-2 text-muted-foreground">
									Lance: <span className="aja-num font-medium">{formatBRL(s.lanceValue)}</span>
									{s.ownResourcesValue > 0 && (
										<>
											{" · "}Recursos próprios:{" "}
											<span className="aja-num font-medium">{formatBRL(s.ownResourcesValue)}</span>
										</>
									)}
								</p>
							)}
							<p className="text-[10px] mt-2 text-muted-foreground italic leading-snug">
								{s.disclaimer}
							</p>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

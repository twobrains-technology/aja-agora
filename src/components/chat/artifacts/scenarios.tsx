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
		<Card className="w-full max-w-md">
			<CardHeader>
				<p className="text-sm font-medium text-muted-foreground">
					3 cenários · {payload.administradora} · {formatBRL(payload.creditValue)}
				</p>
			</CardHeader>
			<CardContent className="space-y-3">
				{SCENARIO_META.map(({ key, label }) => {
					const s = payload.scenarios[key];
					return (
						<div
							key={key}
							className="rounded-md border bg-card p-3"
							data-testid={`scenario-${key}`}
						>
							<div className="flex items-baseline justify-between">
								<p className="text-sm font-semibold">{label}</p>
								<p className="text-xs text-muted-foreground">~{s.expectedTermMonths} meses</p>
							</div>
							<p className="text-sm mt-1">{s.strategy}</p>
							{s.lanceValue > 0 && (
								<p className="text-xs mt-2 text-muted-foreground">
									Lance: <span className="font-mono">{formatBRL(s.lanceValue)}</span>
									{s.ownResourcesValue > 0 && (
										<>
											{" · "}Recursos próprios:{" "}
											<span className="font-mono">{formatBRL(s.ownResourcesValue)}</span>
										</>
									)}
								</p>
							)}
							<p className="text-[10px] mt-2 text-muted-foreground italic">{s.disclaimer}</p>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

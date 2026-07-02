"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FunnelStage } from "@/lib/admin/dashboard-types";

const STAGE_COLORS = [
	"bg-chart-1",
	"bg-chart-2",
	"bg-chart-3",
	"bg-chart-4",
	"bg-chart-5",
	"bg-chart-1",
];

function formatDeltaRate(rate: number): string {
	// Não renderizar sinal negativo se for zero
	if (Math.abs(rate) < 0.01) return "0%";
	// Garantir um único sinal (tira valores negativos)
	return `-${Math.abs(rate).toFixed(1)}%`;
}

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
	const allEmpty = stages.every((s) => s.count === 0);
	const firstCount = stages[0]?.count ?? 0;

	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Funil de Conversão</CardTitle>
			</CardHeader>
			<CardContent>
				{allEmpty ? (
					<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
						Sem dados no periodo
					</div>
				) : (
					<>
						{/* Desktop: horizontal funnel */}
						<div className="hidden md:flex items-center gap-1">
							{stages.map((stage, i) => {
								const widthPercent =
									firstCount > 0
										? Math.max((stage.count / firstCount) * 100, 15)
										: 100 / stages.length;

								const clipPath =
									i === 0
										? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 0 0)"
										: "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)";

								return (
									<div
										key={stage.stage}
										className={`${STAGE_COLORS[i % STAGE_COLORS.length]} text-white px-5 py-3 text-center min-h-[72px] flex flex-col justify-center`}
										style={{ width: `${widthPercent}%`, clipPath }}
									>
										<div className="text-xs truncate">{stage.label}</div>
										<div className="font-bold text-lg">{stage.count}</div>
										<div className="text-xs opacity-80">{stage.percentOfTotal.toFixed(0)}%</div>
									</div>
								);
							})}
						</div>

						{/* Desktop: drop-off rates */}
						<div className="hidden md:flex items-center gap-1 mt-2 px-2">
							{stages.map((stage, i) => {
								if (i === 0) return <div key={stage.stage} className="flex-1" />;
								return (
									<div
										key={stage.stage}
										className="flex-1 text-center text-xs text-muted-foreground"
									>
										<span className="text-destructive">{formatDeltaRate(stage.dropOffRate)}</span>
									</div>
								);
							})}
						</div>

						{/* Mobile: vertical funnel */}
						<div className="flex flex-col gap-2 md:hidden">
							{stages.map((stage, i) => {
								const heightPercent =
									firstCount > 0 ? Math.max((stage.count / firstCount) * 100, 20) : 100;

								return (
									<div key={stage.stage} className="flex items-center gap-3">
										<div
											className={`${STAGE_COLORS[i % STAGE_COLORS.length]} text-white rounded px-3 py-2 flex items-center justify-between`}
											style={{ width: `${heightPercent}%`, minWidth: "120px" }}
										>
											<span className="text-xs truncate">{stage.label}</span>
											<span className="font-bold ml-2">{stage.count}</span>
										</div>
										<span className="text-xs text-muted-foreground whitespace-nowrap">
											{stage.percentOfTotal.toFixed(0)}%
											{i > 0 && (
												<span className="text-destructive ml-1">
													({formatDeltaRate(stage.dropOffRate)})
												</span>
											)}
										</span>
									</div>
								);
							})}
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}

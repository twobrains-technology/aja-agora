"use client";

import { TrendingDownIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EtapaFunilMidia } from "@/lib/admin/performance-types";

/**
 * Escada vertical, não funil horizontal.
 *
 * Entre visitas e contratos há ordens de grandeza de diferença: num funil
 * horizontal as últimas etapas viram lascas ilegíveis e o operador não enxerga
 * onde vaza. Em barras empilhadas, cada etapa mantém rótulo, número e a queda
 * em relação à anterior — que é a informação que decide o que consertar.
 */
export function FunilMidiaChart({ etapas }: { etapas: EtapaFunilMidia[] }) {
	const topo = etapas[0]?.count ?? 0;
	const vazio = etapas.every((e) => e.count === 0);

	// A maior queda é o gargalo — vale destaque, mas nunca só por cor.
	const maiorQueda = Math.max(...etapas.map((e) => e.quedaDaAnterior), 0);

	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Funil de mídia</CardTitle>
				<CardDescription>
					Do anúncio ao contrato, só o tráfego com origem identificada — começa na visita, não no
					lead
				</CardDescription>
			</CardHeader>
			<CardContent>
				{vazio ? (
					<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
						Sem dados no período
					</div>
				) : (
					<div className="space-y-3">
						{etapas.map((etapa, i) => {
							// Teto em 100% por segurança: a barra é o desenho do funil, e uma
							// barra estourando a caixa comunicaria erro mesmo quando o número
							// estivesse certo.
							const largura = topo > 0 ? Math.min(100, Math.max((etapa.count / topo) * 100, 2)) : 0;
							const gargalo = i > 0 && etapa.quedaDaAnterior === maiorQueda && maiorQueda > 0;

							return (
								<div key={etapa.chave}>
									<div className="flex items-baseline justify-between gap-3 mb-1">
										<div className="flex items-baseline gap-2 min-w-0">
											<span className="font-medium text-sm">{etapa.label}</span>
											<span className="text-xs text-muted-foreground truncate">{etapa.ajuda}</span>
										</div>
										<div className="flex items-baseline gap-3 shrink-0">
											<span className="font-bold tabular-nums">{etapa.count}</span>
											<span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
												{etapa.percentDoTopo.toFixed(1)}%
											</span>
										</div>
									</div>

									<div className="h-7 w-full rounded bg-muted overflow-hidden">
										<div className="h-full bg-chart-1 rounded" style={{ width: `${largura}%` }} />
									</div>

									{i > 0 && etapa.quedaDaAnterior > 0 && (
										<p
											className={`text-xs mt-1 inline-flex items-center gap-1 ${
												gargalo ? "text-amber-700 font-medium" : "text-muted-foreground"
											}`}
										>
											<TrendingDownIcon className="size-3" aria-hidden="true" />
											{etapa.quedaDaAnterior.toFixed(1)}% saíram aqui
											{gargalo && " · maior perda do funil"}
										</p>
									)}
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

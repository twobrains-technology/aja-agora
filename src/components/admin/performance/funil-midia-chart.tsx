"use client";

import { ClockIcon, TrendingDownIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EtapaFunilMidia } from "@/lib/admin/performance-types";

const nf = new Intl.NumberFormat("pt-BR");

/**
 * A CONVERSA: das que abriram o chat, onde cada uma parou.
 *
 * O topo é `conversas`, não `visitas`. Medir tudo contra as visitas espremia as
 * seis etapas de baixo numa lasca de 0,06% — 19 contra 30.147 são três ordens
 * de grandeza — e elas ficavam visualmente idênticas, justamente as seis que
 * carregam a informação de produto. Visita → conversa virou componente próprio
 * (`PortaDoFunilCard`): outro denominador, outra decisão.
 *
 * Escala rejeitada: log (faz 19 parecer 60% de 30.147, troca uma mentira por
 * outra) e normalizar cada etapa pela anterior (todo funil fica saudável e some
 * o absoluto, que com N=19 é o que importa).
 *
 * A queda é dita em ABSOLUTO e dividida em morto × vivo: "8 pararam aqui · 2
 * ainda vivas" separa duas decisões opostas — consertar o agente ou puxar de
 * volta. "44,4% saíram aqui" sobre 18 conversas era precisão falsa e não
 * apontava nenhuma das duas.
 */
export function FunilMidiaChart({ etapas }: { etapas: EtapaFunilMidia[] }) {
	// A primeira etapa (`visitas`) vive no card da porta — aqui o funil começa
	// onde a conversa começa.
	const daConversa = etapas.filter((e) => e.chave !== "visitas");
	const topo = daConversa[0]?.count ?? 0;
	const vazio = daConversa.every((e) => e.count === 0);

	// A maior perda é o gargalo — em absoluto, que é como se decide o conserto.
	const maiorPerda = Math.max(...daConversa.map((e) => e.pararamAqui), 0);

	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>A conversa</CardTitle>
				<CardDescription>
					Das {nf.format(topo)} que abriram o chat, onde cada uma parou — só conversas com origem
					conhecida
				</CardDescription>
			</CardHeader>
			<CardContent>
				{vazio ? (
					<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
						Sem conversas no período
					</div>
				) : (
					<div className="space-y-3">
						{daConversa.map((etapa, i) => {
							const largura =
								topo > 0
									? Math.min(100, Math.max((etapa.count / topo) * 100, etapa.count > 0 ? 2 : 0))
									: 0;
							// Gargalo por VOLUME perdido, e sempre com rótulo escrito: cor
							// sozinha não carrega estado nesta casa.
							const gargalo = etapa.pararamAqui === maiorPerda && maiorPerda > 0;

							return (
								<div key={etapa.chave}>
									<div className="flex items-baseline justify-between gap-3 mb-1">
										<div className="flex items-baseline gap-2 min-w-0">
											<span className="font-medium text-sm">{etapa.label}</span>
											<span className="text-xs text-muted-foreground truncate">{etapa.ajuda}</span>
										</div>
										<div className="flex items-baseline gap-3 shrink-0">
											<span className="font-bold tabular-nums">{nf.format(etapa.count)}</span>
											<span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
												{etapa.percentDasConversas.toFixed(0)}%
											</span>
										</div>
									</div>

									<div className="h-7 w-full rounded bg-muted overflow-hidden">
										<div className="h-full bg-chart-1 rounded" style={{ width: `${largura}%` }} />
									</div>

									{(etapa.pararamAqui > 0 || (i > 0 && etapa.quedaDaAnterior > 0)) && (
										<div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
											{etapa.pararamAqui > 0 && (
												<p
													className={`text-xs inline-flex items-center gap-1 ${
														gargalo ? "text-amber-700 font-medium" : "text-muted-foreground"
													}`}
												>
													<TrendingDownIcon className="size-3" aria-hidden="true" />
													{nf.format(etapa.pararamAqui)}{" "}
													{etapa.pararamAqui === 1 ? "parou aqui" : "pararam aqui"}
													{gargalo && " · maior perda do funil"}
												</p>
											)}
											{etapa.aindaVivas > 0 && (
												<p className="text-xs inline-flex items-center gap-1 text-muted-foreground">
													<ClockIcon className="size-3" aria-hidden="true" />
													{nf.format(etapa.aindaVivas)}{" "}
													{etapa.aindaVivas === 1 ? "ainda viva" : "ainda vivas"}
												</p>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}

				<p className="mt-4 text-xs text-muted-foreground">
					“Ainda viva” = o cliente escreveu nos últimos 7 dias e a conversa não foi encerrada —
					essas dá para puxar de volta. Contagem de conversas, nunca de leads.
				</p>
			</CardContent>
		</Card>
	);
}

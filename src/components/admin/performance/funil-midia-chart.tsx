"use client";

import { ChevronRightIcon, ClockIcon, InfoIcon, TargetIcon, TrendingDownIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PASSO_DA_ETAPA_DO_FUNIL } from "@/lib/admin/percurso-types";
import type { EtapaFunilMidia } from "@/lib/admin/performance-types";
import { ETAPAS_RAMIFICADAS } from "@/lib/admin/performance-types";
import { META_INICIO_DE_CONVERSA, rotuloDaMeta, TEXTO_DA_META } from "@/lib/funil/meta-de-funil";

const nf = new Intl.NumberFormat("pt-BR");

/** A etapa que carrega a meta acordada: "Iniciaram a conversa". */
const ETAPA_DA_META = "engajadas" as const;

/**
 * A CONVERSA: das que abriram o chat, onde cada uma parou.
 *
 * O topo é `conversas`, não `visitas`. Medir tudo contra as visitas espremia as
 * etapas de baixo numa lasca de 0,06% — 19 contra 30.147 são três ordens de
 * grandeza — e elas ficavam visualmente idênticas, justamente as que carregam a
 * informação de produto. Visita → conversa virou componente próprio
 * (`PortaDoFunilCard`): outro denominador, outra decisão.
 *
 * Escala rejeitada: log (faz 19 parecer 60% de 30.147, troca uma mentira por
 * outra) e normalizar cada etapa pela anterior (todo funil fica saudável e some
 * o absoluto, que com N=19 é o que importa).
 *
 * A queda é dita em ABSOLUTO e dividida em morto × vivo: "8 pararam aqui · 2
 * ainda vivas" separa duas decisões opostas — consertar o agente ou puxar de
 * volta. Cada etapa leva ao PERCURSO, filtrado por ela.
 *
 * **A ramificação (AJA-01).** "Só mandaram a mensagem do anúncio" não é o degrau
 * anterior de "Iniciaram a conversa": é o outro destino de "Conversas". Quem
 * parou ali apertou enviar no texto que o CTA já escreve (47% das conversas web
 * medidas em produção), e era isso que fazia a tela dizer "Engajaram 99%". A
 * barra dela não acumula queda — ver `ETAPAS_RAMIFICADAS`.
 *
 * **A meta (15/09/2026).** O primeiro degrau tem alvo: ao menos 4% de quem clica
 * no WhatsApp inicia a conversa. O percentual contra a meta é o número MAIOR do
 * cabeçalho, e o marcador na barra é linha tracejada + ícone + palavra — cor
 * sozinha não decide nesta casa.
 */
export function FunilMidiaChart({
	etapas,
	de,
	ate,
}: {
	etapas: EtapaFunilMidia[];
	/** O período viaja no link — sem ele a lista que abre não é a que foi clicada. */
	de?: Date | null;
	ate?: Date | null;
}) {
	const linkDoPercurso = (chave: EtapaFunilMidia["chave"]) => {
		const p = new URLSearchParams();
		const passo = PASSO_DA_ETAPA_DO_FUNIL[chave];
		if (passo) {
			p.set("passo", passo);
			// `alcancou`, e não o padrão `parou`: o número impresso ao lado do rótulo é
			// CUMULATIVO ("chegaram até aqui"), e o padrão da tela de destino é
			// TERMINAL ("pararam aqui"). Clicar levava de uma grandeza para outra.
			//
			// Foi o defeito que o operador viu em 24/08/2026: o funil dizia "8
			// abriram conversa", ele clicou, e recebeu uma lista vazia — porque
			// ninguém PAROU em "Abriu o chat" (todos os que abriram escreveram, e
			// caíram em degraus mais fundos). O painel parecia quebrado estando certo.
			//
			// Quem quiser o corte terminal continua a um clique: a tela de destino tem
			// o botão "Ver só quem parou aí".
			p.set("modo", "alcancou");
		}
		if (de) p.set("from", de.toISOString());
		if (ate) p.set("to", ate.toISOString());
		const qs = p.toString();
		return qs ? `/admin/percurso?${qs}` : "/admin/percurso";
	};

	// A primeira etapa (`visitas`) vive no card da porta — aqui o funil começa
	// onde a conversa começa.
	const daConversa = etapas.filter((e) => e.chave !== "visitas");
	const topo = daConversa[0]?.count ?? 0;
	const vazio = daConversa.every((e) => e.count === 0);

	const meta = META_INICIO_DE_CONVERSA * 100;
	const etapaDaMeta = daConversa.find((e) => e.chave === ETAPA_DA_META);
	const posicaoDaMeta = rotuloDaMeta(etapaDaMeta?.percentDasConversas ?? 0);

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
				{/* O número que decide vem primeiro e maior, e vem com régua: o
				    percentual que iniciou a conversa contra a meta acordada. Número
				    solto não pede ação. */}
				<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-2">
					<span className="text-3xl font-bold tabular-nums text-foreground">
						{(etapaDaMeta?.percentDasConversas ?? 0).toFixed(0)}%
					</span>
					<span className="text-sm text-muted-foreground">iniciaram a conversa</span>
					<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
						<TargetIcon className="size-3.5" aria-hidden="true" />
						meta {meta.toFixed(0)}% · {posicaoDaMeta}
					</span>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger
								className="text-muted-foreground hover:text-foreground"
								aria-label="Sobre a meta do primeiro degrau"
							>
								<InfoIcon className="size-3.5" aria-hidden="true" />
							</TooltipTrigger>
							<TooltipContent className="max-w-xs">{TEXTO_DA_META}</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
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
							const ramificacao = ETAPAS_RAMIFICADAS.has(etapa.chave);
							const comMeta = etapa.chave === ETAPA_DA_META;

							return (
								<Link
									key={etapa.chave}
									href={linkDoPercurso(etapa.chave)}
									className="block rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									title={`Ver quem chegou a ${etapa.label}`}
								>
									<div className="flex items-baseline justify-between gap-3 mb-1">
										<div className="flex items-baseline gap-2 min-w-0">
											<span className="font-medium text-sm">{etapa.label}</span>
											<span className="text-xs text-muted-foreground truncate">{etapa.ajuda}</span>
											<ChevronRightIcon
												className="size-3 text-muted-foreground shrink-0"
												aria-hidden="true"
											/>
										</div>
										<div className="flex items-baseline gap-3 shrink-0">
											<span className="font-bold tabular-nums">{nf.format(etapa.count)}</span>
											<span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
												{etapa.percentDasConversas.toFixed(0)}%
											</span>
										</div>
									</div>

									{/* A ramificação reparte o topo; o degrau desce. A cor é
									    reforço — a diferença está dita na ajuda e no rodapé. */}
									<div
										className={`relative h-7 w-full rounded bg-muted overflow-hidden ${
											ramificacao ? "ring-1 ring-inset ring-border" : ""
										}`}
									>
										<div
											className={`h-full rounded ${ramificacao ? "bg-chart-3" : "bg-chart-1"}`}
											style={{ width: `${largura}%` }}
										/>
										{comMeta && (
											<>
												{/* A meta como linha: tracejada e no token de texto, para
												    não virar mais uma cor de série. */}
												<span
													className="absolute inset-y-0 border-l border-dashed border-foreground/70"
													style={{ left: `${meta}%` }}
													aria-hidden="true"
												/>
											</>
										)}
									</div>

									{(etapa.pararamAqui > 0 || (i > 0 && etapa.quedaDaAnterior > 0) || comMeta) && (
										<div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
											{etapa.pararamAqui > 0 && (
												<p
													className={`text-xs inline-flex items-center gap-1 ${
														gargalo ? "text-warning font-medium" : "text-muted-foreground"
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
											{comMeta && (
												<p className="text-xs inline-flex items-center gap-1 text-muted-foreground">
													<TargetIcon className="size-3" aria-hidden="true" />
													{etapa.percentDasConversas.toFixed(1).replace(".", ",")}% vs meta{" "}
													{meta.toFixed(0)}% · {posicaoDaMeta}
												</p>
											)}
											{!ramificacao && i > 0 && etapa.quedaDaAnterior > 0 && (
												<p className="text-xs text-muted-foreground tabular-nums">
													−{etapa.quedaDaAnterior.toFixed(0)}% da etapa anterior
												</p>
											)}
										</div>
									)}
								</Link>
							);
						})}
					</div>
				)}

				<div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
					<p className="inline-flex items-center gap-1.5">
						<TrendingDownIcon className="size-3 shrink-0" aria-hidden="true" />
						Onde o funil perde gente.
					</p>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger
								className="text-muted-foreground hover:text-foreground"
								aria-label="Como ler este funil"
							>
								<InfoIcon className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
							</TooltipTrigger>
							<TooltipContent className="max-w-sm">
								“Ainda viva” = o cliente escreveu nos últimos 7 dias e a conversa não foi encerrada
								— essas dá para puxar de volta. Contagem de conversas, nunca de leads. Clique numa
								etapa para ver, nome a nome, quem chegou até ela. “Só mandaram a mensagem do
								anúncio” não é um degrau abaixo de “Conversas”: é o outro destino dela — quem só
								apertou enviar no texto que o anúncio já escreve.
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</CardContent>
		</Card>
	);
}

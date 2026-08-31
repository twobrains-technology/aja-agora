"use client";

import { AlertTriangleIcon, ClockIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FunilDeHandoff } from "@/lib/admin/handoff-queries";

const nf = new Intl.NumberFormat("pt-BR");

/**
 * O QUE ACONTECE DEPOIS QUE O BOT ENTREGA O LEAD (itens D1, D3 e E1).
 *
 * O funil de cima mede o que o produto faz sozinho. Daqui para baixo é a mesa:
 * o especialista assumiu, cobrou documento, subiu a proposta. Entre "viu
 * oferta" e "contrato" havia uma caixa-preta com uma taxa agregada só, e taxa
 * agregada não diz qual passo derruba.
 *
 * O dado nunca faltou — `lead_events` grava toda transição de estágio com
 * carimbo de tempo desde sempre. O que faltava era alguém olhar.
 *
 * ── As duas colunas de tempo ────────────────────────────────────────────────
 *
 * Mediana e p90, e não média. Numa operação com poucos casos a média é o número
 * mais enganoso que existe: um lead esquecido por duas semanas move a média de
 * todo mundo e desaparece dentro dela. A mediana diz como é o caso típico; o
 * p90 diz o quão ruim fica a cauda — e é a cauda que perde venda.
 *
 * ── A lista de parados ──────────────────────────────────────────────────────
 *
 * É ela que faz o SLA existir. Sem uma lista com nome e telefone, "definir SLA"
 * é combinar um número que ninguém verifica — e este projeto já tem um caso
 * documentado do custo disso: em 14/08/2026 uma cliente fechou proposta de
 * R$ 211 mil, escreveu e recebeu silêncio; a notificação levou 42 minutos para
 * ser entregue e 17h24 para ser lida.
 */
export function FunilDeHandoffCard({ handoff }: { handoff: FunilDeHandoff }) {
	const { etapas, parados, limiteHoras, amostraSuficiente } = handoff;
	const maior = Math.max(1, ...etapas.map((e) => e.alcancaram));

	return (
		<Card>
			<CardHeader>
				<CardTitle>Depois do handoff</CardTitle>
				<CardDescription>
					O caminho do lead na mesa, com o tempo gasto em cada passo
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-2">
					{etapas.map((etapa, i) => (
						<div key={etapa.estagio} className="flex items-center gap-3">
							<div className="w-40 shrink-0">
								<p className="text-sm font-medium leading-tight">{etapa.label}</p>
								<p className="text-[11px] leading-tight text-muted-foreground">{etapa.ajuda}</p>
							</div>

							{/* A barra é proporcional à MAIOR etapa, não à primeira: com idas e
							    vindas no funil (um lead volta de `perdido` para
							    `em_atendimento`) uma etapa do meio pode ter mais gente que o
							    topo, e uma barra estourando o container é pior do que uma
							    escala honesta. */}
							<div className="h-7 flex-1 rounded bg-muted/60">
								<div
									className="flex h-7 items-center rounded bg-primary/80 px-2 transition-[width]"
									style={{ width: `${Math.max(2, (etapa.alcancaram / maior) * 100)}%` }}
								>
									<span className="text-xs font-semibold text-primary-foreground tabular-nums">
										{nf.format(etapa.alcancaram)}
									</span>
								</div>
							</div>

							<div className="w-24 shrink-0 text-right">
								{i > 0 ? (
									<span className="text-xs tabular-nums text-muted-foreground">
										{etapa.percentDaAnterior}% da anterior
									</span>
								) : null}
							</div>

							<div className="w-36 shrink-0 text-right">
								{etapa.horasP50 === null ? (
									// Estágio sem NENHUMA saída registrada não tem duração. Mostrar
									// zero diria que a mesa é instantânea justamente por causa de
									// quem está parado ali.
									<span className="text-xs text-muted-foreground">—</span>
								) : (
									<span className="text-xs tabular-nums text-muted-foreground">
										<ClockIcon className="mr-1 inline size-3" aria-hidden />
										{formatarHoras(etapa.horasP50)}
										<span className="opacity-60"> · p90 {formatarHoras(etapa.horasP90)}</span>
									</span>
								)}
							</div>
						</div>
					))}
				</div>

				{!amostraSuficiente ? (
					// O aviso viaja JUNTO do número, não num rodapé de relatório. Com a
					// amostra desta operação, qualquer taxa depois de "proposta enviada" é
					// hipótese — e é sobre taxa de fechamento que o modelo de investimento
					// da planilha foi construído.
					<p className="rounded-md bg-secondary px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
						<strong className="text-foreground">Amostra pequena.</strong> As taxas depois de
						“Proposta enviada” têm poucos casos por trás — servem para enxergar onde olhar, não para
						projetar receita.
					</p>
				) : null}

				<div>
					<div className="mb-2 flex items-center gap-2">
						<AlertTriangleIcon
							className={`size-4 ${parados.length > 0 ? "text-destructive" : "text-muted-foreground"}`}
							aria-hidden
						/>
						<h3 className="text-sm font-semibold">
							Parados há mais de {limiteHoras}h
							<span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
								({parados.length})
							</span>
						</h3>
					</div>

					{parados.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							Ninguém parado além do limite. É o estado que se quer.
						</p>
					) : (
						<ul className="divide-y divide-border rounded-md border border-border">
							{parados.slice(0, 15).map((lead) => (
								<li
									key={lead.leadId}
									className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
								>
									<span className="min-w-0 truncate">
										{/* Nome e telefone juntos: uma lista de UUIDs não faz ninguém
										    ligar para ninguém. */}
										<strong className="font-medium">{lead.nome ?? "Sem nome"}</strong>
										{lead.telefone ? (
											<span className="ml-2 text-muted-foreground">{lead.telefone}</span>
										) : null}
									</span>
									<span className="shrink-0 text-muted-foreground tabular-nums">
										{rotuloDoEstagio(lead.estagio)} · {formatarHoras(lead.horasParado)}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

/** Horas viram dias quando passam de 48 — "312h" ninguém lê como 13 dias. */
function formatarHoras(horas: number | null): string {
	if (horas === null) return "—";
	if (horas < 1) return `${Math.round(horas * 60)}min`;
	if (horas < 48) return `${Math.round(horas)}h`;
	return `${Math.round(horas / 24)}d`;
}

const ROTULOS: Record<string, string> = {
	qualificado: "Qualificado",
	em_negociacao: "Em negociação",
	proposta_enviada: "Proposta enviada",
	na_administradora: "Na administradora",
	em_atendimento: "Em atendimento",
	aguardando_pagamento: "Aguardando pagamento",
	fechado_ganho: "Fechado",
};

function rotuloDoEstagio(estagio: string): string {
	return ROTULOS[estagio] ?? estagio;
}

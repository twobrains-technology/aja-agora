"use client";

import { UsersIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PassoDoPercurso, ResumoDoPasso } from "@/lib/admin/percurso-types";

const nf = new Intl.NumberFormat("pt-BR");

/**
 * A escada do período: quantas PESSOAS pararam em cada degrau.
 *
 * Diferente do funil da tela de Performance em duas coisas, e as duas de
 * propósito. Ali cada barra é "quantas chegaram até aqui" e a unidade é a
 * conversa; aqui cada barra é "quantas PARARAM aqui" e a unidade é a pessoa.
 * Por isso esta escada soma o total — ela reparte o período inteiro, não o
 * afunila — e por isso as duas telas mostram números diferentes para nomes
 * parecidos, o que o rodapé diz em voz alta.
 *
 * Clicar num degrau filtra a lista abaixo. O degrau escolhido ganha rótulo
 * escrito, nunca só realce de cor.
 */
export function EscadaDoPercurso({
	resumo,
	total,
	selecionado,
	onSelecionar,
}: {
	resumo: ResumoDoPasso[];
	total: number;
	selecionado: PassoDoPercurso | null;
	onSelecionar: (passo: PassoDoPercurso | null) => void;
}) {
	const maior = Math.max(...resumo.map((r) => r.pessoas), 0);

	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Onde cada pessoa parou</CardTitle>
				<CardDescription>
					{total > 0
						? `${nf.format(total)} ${total === 1 ? "pessoa chegou" : "pessoas chegaram"} no período — clique num degrau para ver quem é`
						: "Ninguém chegou no período"}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-0.5">
					{resumo.map((degrau) => {
						const ativo = selecionado === degrau.chave;
						const largura = maior > 0 ? Math.max((degrau.pessoas / maior) * 100, 0) : 0;

						return (
							<button
								key={degrau.chave}
								type="button"
								onClick={() => onSelecionar(ativo ? null : degrau.chave)}
								aria-pressed={ativo}
								className={`w-full text-left rounded-md px-2 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
									ativo ? "bg-muted ring-1 ring-ring" : ""
								}`}
							>
								<div className="flex items-baseline justify-between gap-3 mb-0.5">
									<div className="flex items-baseline gap-2 min-w-0">
										<span className="font-medium text-sm">{degrau.label}</span>
										<span className="text-xs text-muted-foreground truncate">{degrau.ajuda}</span>
										{ativo && (
											<span className="text-xs font-medium text-foreground shrink-0">
												· filtrando
											</span>
										)}
									</div>
									<span className="font-bold tabular-nums shrink-0">
										{nf.format(degrau.pessoas)}
									</span>
								</div>
								{/* Barra baixa de propósito: com `h-5` os oito degraus somavam 646px e
								    empurravam a LISTA — o objeto da tela — para fora da primeira dobra
								    (a tabela começava em y=873 numa viewport de 807). A escada orienta;
								    quem responde "quem é" é a lista, e ela precisa estar à vista. */}
								<div className="h-3 w-full rounded bg-muted overflow-hidden">
									<div
										className={`h-full rounded ${ativo ? "bg-chart-2" : "bg-chart-1"}`}
										style={{ width: `${largura}%` }}
									/>
								</div>
							</button>
						);
					})}
				</div>

				<p className="mt-4 text-xs text-muted-foreground inline-flex items-start gap-1.5">
					<UsersIcon className="size-3 mt-0.5 shrink-0" aria-hidden="true" />
					<span>
						Uma linha por <strong>pessoa</strong>, não por clique no anúncio: quem voltou três vezes
						conta uma vez, no degrau mais fundo que alcançou. Por isso estes números são menores que
						os da tela de Performance, que conta conversas.
					</span>
				</p>
			</CardContent>
		</Card>
	);
}

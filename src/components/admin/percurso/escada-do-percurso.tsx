"use client";

import { InfoIcon, UsersIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
 * **Percentual ao lado do absoluto (AJA-01).** Só o absoluto esconde a
 * proporção: 11, 18 e 2 lado a lado não dizem se o degrau do meio segurou a
 * passagem ou se os três são o mesmo vazamento. O "% do degrau anterior" é a
 * mesma informação que a barra dá em largura, agora legível em número.
 *
 * Clicar num degrau filtra a lista abaixo. O degrau escolhido ganha rótulo
 * escrito, nunca só realce de cor.
 */
export function EscadaDoPercurso({
	resumo,
	total,
	totalDeConversas = 0,
	selecionado,
	onSelecionar,
}: {
	resumo: ResumoDoPasso[];
	total: number;
	/** Conversas abertas por essas pessoas — o que fecha a conta com Performance. */
	totalDeConversas?: number;
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
					{resumo.map((degrau, indice) => {
						const ativo = selecionado === degrau.chave;
						const largura = maior > 0 ? Math.max((degrau.pessoas / maior) * 100, 0) : 0;
						// O degrau anterior na ORDEM da escada, não na lista ordenada por
						// volume: a pergunta é "quantos dos que chegaram aqui seguiram".
						const anterior = indice > 0 ? (resumo[indice - 1]?.pessoas ?? 0) : 0;
						const doAnterior =
							indice > 0 && anterior > 0 ? (degrau.pessoas / anterior) * 100 : null;

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
									<span className="shrink-0 text-right">
										<span className="font-bold tabular-nums">{nf.format(degrau.pessoas)}</span>
										{doAnterior !== null && (
											<span className="ml-2 text-xs text-muted-foreground tabular-nums">
												{doAnterior.toFixed(0)}% do anterior
											</span>
										)}
									</span>
								</div>
								{/* Barra baixa de propósito: com `h-5` os nove degraus somavam 646px e
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

				<div className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
					<UsersIcon className="size-3 mt-0.5 shrink-0" aria-hidden="true" />
					<p>Uma linha por pessoa, no degrau mais fundo que ela alcançou.</p>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger
								className="text-muted-foreground hover:text-foreground"
								aria-label="Como ler esta escada"
							>
								<InfoIcon className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
							</TooltipTrigger>
							<TooltipContent className="max-w-sm">
								Uma linha por pessoa, não por conversa nem por clique no anúncio: quem voltou três
								vezes conta uma vez, no degrau mais fundo que alcançou.
								{totalDeConversas > 0 && (
									<>
										{" "}
										Estas pessoas abriram {totalDeConversas}{" "}
										{totalDeConversas === 1 ? "conversa" : "conversas"} — é por isso que a tela de
										Performance, que conta conversa, mostra um número maior. A diferença é sempre
										alguém que abriu o chat mais de uma vez, ou conversa que começou no dia seguinte
										à chegada; nunca gente que sumiu.
									</>
								)}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</CardContent>
		</Card>
	);
}

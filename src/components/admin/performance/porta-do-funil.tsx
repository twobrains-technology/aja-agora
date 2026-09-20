"use client";

import { ArrowRightIcon, InfoIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CoberturaAtribuicao, PortaDoFunil } from "@/lib/admin/performance-types";

const nf = new Intl.NumberFormat("pt-BR");

/**
 * O limiar de entrada — três números e uma razão, sem gráfico.
 *
 * Visita → conversa não é um degrau do funil: é um limiar, com denominador
 * próprio e uma decisão própria ("dá para confiar nesse número?"). Espremê-lo
 * na mesma escada das outras etapas era o que tornava o funil ilegível — 19
 * conversas contra 30.147 visitas viram uma lasca de 0,06%, e as etapas
 * seguintes ficavam visualmente idênticas.
 *
 * Um gráfico aqui seria decoração de uma divisão. O número grande basta.
 *
 * **AJA-17.** A cobertura de atribuição era uma nota de rodapé em duas linhas:
 * dizia que existiam conversas fora do funil e não dava como chegar até elas. O
 * número continua o mesmo e a EXCLUSÃO do funil não muda (ela é pré-requisito —
 * sem origem, a conversa não nasceu da landing). O que muda é a visibilidade: a
 * frase vira uma linha com ação, e o link leva à lista filtrada por
 * `origem=desconhecida` — que é o valor que o filtro de Conversas passou a
 * aceitar.
 */
export function PortaDoFunilCard({
	porta,
	cobertura,
}: {
	porta: PortaDoFunil;
	cobertura: CoberturaAtribuicao;
}) {
	const semOrigem = Math.max(0, cobertura.conversasTotal - cobertura.conversasComOrigem);

	return (
		<Card className="shadow-sm">
			<CardContent className="pt-6">
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4">
					{/* PESSOAS em destaque, chegadas como sublinha.
					    Até 24/08/2026 o número grande era o de chegadas, e as três telas
					    de medição abriam com três números diferentes para a mesma
					    pergunta: 756 aqui, 261 no Percurso, 150 no Mapa de calor. O
					    grande agora é o mesmo nas três. */}
					<div>
						<p className="text-3xl font-bold tabular-nums">{nf.format(porta.pessoas)}</p>
						<p className="text-sm text-muted-foreground">
							pessoas chegaram
							<span className="block text-xs tabular-nums">
								{nf.format(porta.visitas)}{" "}
								{porta.visitas === 1 ? "chegada ao todo" : "chegadas ao todo"}
							</span>
						</p>
					</div>

					<ArrowRightIcon className="size-5 text-muted-foreground mb-6" aria-hidden="true" />

					{/* PESSOAS, como no número da esquerda e como na escada do Percurso.
					    Em 24/08/2026, com as chegadas já corrigidas, esta tela dizia "8
					    abriram conversa" e o Percurso somava 7 — 8 conversas de 7 pessoas,
					    porque alguém abriu o chat duas vezes com 15 segundos de diferença. */}
					<div>
						<p className="text-3xl font-bold tabular-nums">
							{nf.format(porta.pessoasQueConversaram)}
						</p>
						<p className="text-sm text-muted-foreground">
							falaram com o agente (com origem conhecida)
							<span className="block text-xs tabular-nums">
								{nf.format(porta.conversas)}{" "}
								{porta.conversas === 1 ? "conversa ao todo" : "conversas ao todo"}
							</span>
							{porta.conversas > 0 && (
								<span className="block text-xs tabular-nums">
									{nf.format(porta.web)} pela web · {nf.format(porta.whatsapp)} pelo WhatsApp
								</span>
							)}
						</p>
					</div>

					<div className="ml-auto text-right">
						<p className="text-3xl font-bold tabular-nums">
							{porta.taxaDeEntrada.toFixed(porta.taxaDeEntrada < 1 ? 2 : 1)}%
						</p>
						<p className="text-sm text-muted-foreground">entram no chat</p>
					</div>
				</div>

				{/* A frase na tela diz o fato em poucas palavras; o porquê e a
				    consequência vivem no tooltip. Nota longa em rodapé empurra o que
				    importa para fora da primeira dobra e ninguém lê. */}
				<div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
					<InfoIcon className="size-3.5 shrink-0" aria-hidden="true" />
					<span>
						{nf.format(semOrigem)}{" "}
						{semOrigem === 1
							? "conversa sem origem conhecida fica fora deste funil"
							: "conversas sem origem conhecida ficam fora deste funil"}
					</span>
					{semOrigem > 0 && (
						<Link
							href="/admin/conversations?origem=desconhecida"
							className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
						>
							Ver as {nf.format(semOrigem)}
						</Link>
					)}
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger
								className="text-muted-foreground hover:text-foreground"
								aria-label="Por que estas conversas ficam fora"
							>
								<InfoIcon className="size-3.5 shrink-0" aria-hidden="true" />
							</TooltipTrigger>
							<TooltipContent className="max-w-sm">
								{nf.format(cobertura.conversasComOrigem)} de {nf.format(cobertura.conversasTotal)}{" "}
								conversas do período têm origem conhecida ({cobertura.percent.toFixed(0)}%). As
								demais nasceram fora da landing — WhatsApp orgânico, conversa anterior à
								instrumentação de atribuição — e{" "}
								<strong>não aparecem em nenhum número desta tela</strong>, porque todo o funil
								abaixo exige origem conhecida. Elas continuam contando no total do CRM.
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</CardContent>
		</Card>
	);
}

"use client";

import { InfoIcon, PieChartIcon } from "lucide-react";
import { BarList } from "@/components/ui/bar-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { BarraDeQuemChegou, QuemChegou } from "@/lib/admin/performance-types";
import { ROTULO_SEM_VALOR } from "@/lib/funil/quem-chegou";

const nf = new Intl.NumberFormat("pt-BR");

/**
 * "Quem chegou" — o cheiro de perfil.
 *
 * Pedido (d) da Bruna, logo abaixo da porta: distribuição por **Bem** e por
 * **Faixa de valor** entre quem INICIOU a conversa. Sem ele, a tela dizia
 * quantos entraram e nunca quem entrou — e a decisão de criativo (que carro,
 * que faixa de carta anunciar) ficava sem dado no painel.
 *
 * **Por que "iniciou a conversa" e não "abriu o chat":** é o degrau que o AJA-01
 * separou do texto do anúncio. Contando quem só apertou enviar no CTA, o perfil
 * medido seria o do anúncio — não o de quem falou.
 *
 * **Por que a faixa de valor é um recorte menor:** só quem passou do gate de
 * crédito tem valor informado; os outros aparecem em "Valor não informado". O
 * rodapé diz isso em número, para a lista não parecer que soma o total.
 */
export function QuemChegouCard({ dados }: { dados: QuemChegou }) {
	const comBem = dados.porBem.reduce((soma, b) => soma + b.total, 0);
	const semValor = dados.porFaixa.find((f) => f.rotulo === ROTULO_SEM_VALOR)?.total ?? 0;

	const formatar = (total: number) => (quantidade: number) => {
		const pct = total > 0 ? (quantidade / total) * 100 : 0;
		return `${nf.format(quantidade)} · ${pct.toFixed(0)}%`;
	};

	const barraPorBem = dados.porBem.map((b) => ({ name: b.rotulo, value: b.total }));
	const barraPorFaixa = dados.porFaixa.map((f) => ({ name: f.rotulo, value: f.total }));

	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Quem chegou</CardTitle>
				<CardDescription>
					{dados.total > 0
						? `Perfil de quem iniciou a conversa no período — ${nf.format(dados.total)} ${dados.total === 1 ? "conversa" : "conversas"}`
						: "Ninguém iniciou a conversa no período"}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{dados.total === 0 ? (
					<div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
						Sem conversa iniciada no período
					</div>
				) : (
					<div className="grid gap-6 md:grid-cols-2">
						<div>
							<p className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium">
								<PieChartIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
								Por bem
							</p>
							<BarList data={barraPorBem} valueFormatter={formatar(comBem)} />
						</div>
						<div>
							<p className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium">
								<PieChartIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
								Por faixa de valor
							</p>
							<BarList data={barraPorFaixa} valueFormatter={formatar(dados.total)} />
							<p className="mt-2 text-xs text-muted-foreground">
								{nf.format(dados.comValorInformado)} de {nf.format(dados.total)}{" "}
								{dados.comValorInformado === 1 ? "informou o valor" : "informaram o valor"} do bem.
							</p>
						</div>
					</div>
				)}

				{dados.total > 0 && (
					<div className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
						<InfoIcon className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
						<p>Só quem iniciou a conversa entra aqui.</p>
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger
									className="text-muted-foreground hover:text-foreground"
									aria-label="Como este bloco é calculado"
								>
									<InfoIcon className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
								</TooltipTrigger>
								<TooltipContent className="max-w-sm">
									Conta a conversa cujo cliente escreveu algo além da mensagem que o anúncio já
									entrega pronta — quem só apertou enviar no texto do CTA não entra, e é por isso
									que este perfil não é o perfil do anúncio. O bem vem da categoria escolhida na
									conversa; a faixa, do valor que a pessoa informou no gate de crédito
									{dados.total > 0 && semValor > 0
										? ` — ${nf.format(semValor)} conversa${semValor === 1 ? "" : "s"} não chegou a informar valor e aparece em "${ROTULO_SEM_VALOR}"`
										: ""}
									.
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

/** Reexportado para o teste da tela não precisar importar de dois lugares. */
export type { BarraDeQuemChegou };

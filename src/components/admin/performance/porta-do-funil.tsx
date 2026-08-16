"use client";

import { ArrowRightIcon, InfoIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CoberturaAtribuicao, PortaDoFunil } from "@/lib/admin/performance-types";

const nf = new Intl.NumberFormat("pt-BR");

/**
 * O limiar de entrada — três números e uma razão, sem gráfico.
 *
 * Visita → conversa não é um degrau do funil: é um limiar, com denominador
 * próprio e uma decisão própria ("dá para confiar nesse número?"). Espremê-lo
 * na mesma escada das outras etapas era o que tornava o funil ilegível — 19
 * conversas contra 30.147 visitas viram uma lasca de 0,06%, e as seis etapas
 * seguintes ficavam visualmente idênticas.
 *
 * Um gráfico aqui seria decoração de uma divisão. O número grande basta.
 */
export function PortaDoFunilCard({
	porta,
	cobertura,
}: {
	porta: PortaDoFunil;
	cobertura: CoberturaAtribuicao;
}) {
	return (
		<Card className="shadow-sm">
			<CardContent className="pt-6">
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4">
					<div>
						<p className="text-3xl font-bold tabular-nums">{nf.format(porta.visitas)}</p>
						<p className="text-sm text-muted-foreground">chegadas no período</p>
					</div>

					<ArrowRightIcon className="size-5 text-muted-foreground mb-6" aria-hidden="true" />

					<div>
						<p className="text-3xl font-bold tabular-nums">{nf.format(porta.conversas)}</p>
						<p className="text-sm text-muted-foreground">
							abriram conversa
							{/* Por qual porta cada uma entrou. Era um gráfico de duas barras;
							    duas categorias são uma frase, e como frase o dado sobrevive ao
							    corte do gráfico. */}
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

				{/* A cobertura de atribuição era uma faixa própria no topo da página,
				    disputando atenção com o título. Ela merece existir — sem ela a soma
				    das origens pareceria o total —, mas o lugar dela é aqui, como nota
				    de rodapé do número que ela qualifica. */}
				<p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
					<InfoIcon className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
					<span>
						{nf.format(cobertura.conversasComOrigem)} de {nf.format(cobertura.conversasTotal)}{" "}
						conversas têm origem conhecida ({cobertura.percent.toFixed(0)}%). As demais entram no
						funil abaixo, mas não na tabela por origem — nasceram fora da landing.
					</span>
				</p>
			</CardContent>
		</Card>
	);
}

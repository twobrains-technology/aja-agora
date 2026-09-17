"use client";

/**
 * O rodapé da tela de campanhas: o que foi investido e o que o CRM produziu.
 *
 * Os dois lados ficam lado a lado de propósito — é a mesma decisão da tabela.
 * Um cartão que mostrasse só "leads" juntaria o número da Meta e o do CRM sob um
 * rótulo que não é nenhum dos dois.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TotaisDeCampanhas } from "@/lib/admin/campanhas-queries";
import { custo, inteiro, reais } from "./formato";

function Cartao({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
	return (
		<Card className="shadow-sm">
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-2xl font-semibold tabular-nums">{valor}</p>
				{nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
			</CardContent>
		</Card>
	);
}

export function ResumoCampanhas({ totais }: { totais: TotaisDeCampanhas }) {
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<Cartao
				titulo="Investimento no período"
				valor={reais(totais.investimentoCents)}
				nota="Soma do que o gerenciador reportou para as campanhas"
			/>
			<Cartao
				titulo="Custo por lead qualificado"
				valor={custo(totais.custoPorQualificadoCents)}
				nota="Investimento ÷ leads que chegaram a qualificado"
			/>
			<Cartao
				titulo="Leads — Meta × CRM"
				valor={`${inteiro(totais.leadsMeta)} × ${inteiro(totais.leadsCrm)}`}
				nota="A Meta atribui o que ela viu; o CRM conta o que entrou. Nunca concordam."
			/>
			<Cartao
				titulo="Qualificados no CRM"
				valor={inteiro(totais.qualificados)}
				nota={`${inteiro(totais.propostas)} propostas · ${inteiro(totais.fechados)} fechados`}
			/>
		</div>
	);
}

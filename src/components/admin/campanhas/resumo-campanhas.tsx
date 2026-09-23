"use client";

/**
 * O rodapé da tela de campanhas: o que foi investido e o que o CRM produziu.
 *
 * O cartão de leads foi reescrito a pedido do dono (18/09): *"o lead nosso é
 * esse da direita"*. Antes o par "Meta × CRM" lia-se como multiplicação, e o
 * número do CRM — o único que decide — era o menor e o mais à direita. Agora o
 * **CRM é o número grande**, e a Meta aparece ao lado com a diferença nomeada:
 * ela conta clique que não virou conversa, e é por isso que os dois nunca
 * fecham.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TotaisDeCampanhas } from "@/lib/admin/campanhas-queries";
import { descreverCusto, inteiro, reais } from "./formato";

function Cartao({
	titulo,
	valor,
	nota,
	tooltip,
}: {
	titulo: string;
	valor: string;
	nota?: string;
	tooltip?: string;
}) {
	return (
		<Card className="shadow-sm">
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-2xl font-semibold tabular-nums" title={tooltip}>
					{valor}
				</p>
				{nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
			</CardContent>
		</Card>
	);
}

/** A frase que explica de que lado caiu a divergência Meta × CRM. */
function explicarDiferenca(diferenca: number): string {
	if (diferenca === 0)
		return "Os dois números bateram no período — raro, e não significa que medem o mesmo";
	if (diferenca > 0) {
		return `A Meta contou +${inteiro(diferenca)} — cliques que não viraram conversa com o cliente identificado`;
	}
	return `O CRM contou +${inteiro(Math.abs(diferenca))} — lead que a Meta não atribuiu`;
}

export function ResumoCampanhas({ totais }: { totais: TotaisDeCampanhas }) {
	const custo = descreverCusto(totais.custoPorQualificado);
	const diferenca = totais.leadsMeta - totais.leadsCrm;

	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<Cartao
					titulo="Investimento no período"
					valor={reais(totais.investimentoCents)}
					nota="Soma do que o gerenciador reportou para as campanhas"
				/>
				<Cartao
					titulo="Custo por lead qualificado"
					valor={custo.texto}
					nota="Investimento ÷ leads que chegaram a qualificado"
					tooltip={custo.tooltip}
				/>
				<Cartao
					titulo="Qualificados no CRM"
					valor={inteiro(totais.qualificados)}
					nota={`${inteiro(totais.propostas)} propostas criadas · ${inteiro(totais.fechados)} fechados`}
				/>
			</div>

			<Card className="shadow-sm">
				<CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-sm font-medium text-muted-foreground">Leads no CRM</p>
						<p className="text-4xl font-semibold tabular-nums">{inteiro(totais.leadsCrm)}</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Conversas em que o cliente se identificou: no WhatsApp, quem entrou (o canal já traz o
							número e o perfil); na web, quem deixou contato. É o número que o Aja Agora produziu.
						</p>
						<p className="mt-1 text-xs text-muted-foreground" title="Inclui o telefone do WhatsApp">
							Com telefone ou e-mail conhecido (a régua consegue falar):{" "}
							<span className="tabular-nums">{inteiro(totais.comTelefone)}</span>
						</p>
					</div>
					<div className="sm:text-right">
						<p className="text-sm text-muted-foreground">
							Leads que a Meta atribuiu:{" "}
							<span className="tabular-nums text-foreground">{inteiro(totais.leadsMeta)}</span>
						</p>
						<p className="mt-1 text-xs text-muted-foreground">{explicarDiferenca(diferenca)}</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

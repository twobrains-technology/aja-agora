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
 *
 * Na verba o dono decidiu o contrário (28/09): a leitura oficial é **a reportada
 * pela Meta** — o número que a cliente vê no gerenciador. O atribuído no CRM fica
 * ao lado, e a diferença em reais tem nome. Nenhuma soma muda por isso.
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
	nota?: React.ReactNode;
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

/**
 * A frase que explica a divergência de VERBA (Meta × CRM) — a mesma linguagem de
 * `explicarDiferenca`, só trocando leads por reais.
 *
 * O total reportado pela Meta É a leitura oficial; o atribuído no CRM é a linha
 * vizinha. Os dois nunca fecham porque há campanha que gastou sem nenhuma visita
 * ou conversa apontando para ela — e porque a janela de data da Meta não é a
 * mesma do CRM. Nomear de que lado caiu a diferença é o que evita a conclusão de
 * que o painel está errado.
 */
function explicarDiferencaDeVerba(reconciliacao: {
	reportadoCents: number;
	atribuidoCents: number;
}): string {
	if (reconciliacao.reportadoCents === 0)
		return "Sem investimento reportado no período — não há verba a reconciliar";
	// Nunca negativo por desenho: o atribuído é um subconjunto do reportado.
	const diferenca = reconciliacao.reportadoCents - reconciliacao.atribuidoCents;
	if (diferenca === 0)
		return "As duas leituras bateram no período — raro, e não significa que medem o mesmo";
	return `A Meta reportou +${reais(diferenca)} — campanha sem atribuição no CRM: o gasto não achou visita dentro da janela de data`;
}

export function ResumoCampanhas({ totais }: { totais: TotaisDeCampanhas }) {
	const custo = descreverCusto(totais.custoPorQualificado);
	const diferenca = totais.leadsMeta - totais.leadsCrm;

	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<Cartao
					titulo="Investimento reportado pela Meta"
					valor={reais(totais.investimentoCents)}
					nota={
						<>
							O número oficial do período — soma do que o gerenciador reportou para as campanhas.{" "}
							<span className="mt-1 block">
								Investimento atribuído no CRM:{" "}
								<span className="tabular-nums text-foreground">
									{reais(totais.investimentoAtribuidoCents)}
								</span>
							</span>
							<span className="mt-1 block">
								{explicarDiferencaDeVerba({
									reportadoCents: totais.investimentoCents,
									atribuidoCents: totais.investimentoAtribuidoCents,
								})}
							</span>
						</>
					}
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

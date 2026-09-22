"use client";

/**
 * A tabela de campanhas: uma linha por campanha, com o funil do CRM e o gasto
 * do gerenciador na mesma leitura.
 *
 * As decisões que a tela carrega:
 *
 *   1. **Os dois números de lead ficam nomeados.** "Leads no CRM" é o do Aja
 *      Agora, em destaque; "Leads que a Meta atribuiu" e a diferença vão para
 *      "Mais colunas" — os dois nunca vão concordar, e quem lê precisa saber
 *      disso antes de cobrar Growth ou financeiro.
 *   2. **Custo por lead qualificado nunca é 'sem base'.** Quando não há número,
 *      a célula diz POR QUÊ (sem vínculo, sem gasto ou sem qualificado) — são
 *      três problemas diferentes que pedem três ações diferentes.
 *   3. **Campanha sem nome resolvido continua aparecendo**, com o rótulo do
 *      anúncio decodificado (a chave chegou URL-encoded) e o aviso de que o
 *      gerenciador ainda não espelhou. O valor CRU continua no `title` e na
 *      busca.
 *   4. **A campanha abre os criativos.** A pergunta da Bruna em 18/09 — "essa
 *      sequência eu consigo visualizar em algum lugar, para saber qual é o
 *      criativo?" — se responde aqui: a linha expande e mostra o funil por
 *      `utm_content` (o id do anúncio), com o nome e a miniatura do espelho
 *      quando existem.
 *   5. **A última linha é a reconciliação** "Sem origem conhecida": as conversas
 *      que nasceram fora da landing e não pertencem a campanha nenhuma. Sem ela,
 *      o total do CRM nesta tela não fecha com a tela de Conversas.
 */

import {
	ChevronRightIcon,
	MinusIcon,
	TriangleAlertIcon,
	UnlinkIcon,
	WalletCardsIcon,
} from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { CustoPorQualificado, LinhaCampanha } from "@/lib/admin/campanhas-queries";
import { decodificarChaveDeCampanha, ehIdNumerico } from "@/lib/meta-ads/rotulo-legivel";
import { ListaDeCriativos } from "./cartao-de-criativo";
import { descreverCusto, inteiro, reais } from "./formato";

/** "ACTIVE"/"PAUSED"/"ARCHIVED" como a Meta devolve, em português. */
const ROTULO_STATUS: Record<string, string> = {
	ACTIVE: "Ativa",
	PAUSED: "Pausada",
	ARCHIVED: "Arquivada",
};

/** "+3" / "−2" / "0" — o sinal já diz de que lado a diferença caiu. */
function diferenca(valor: number): string {
	if (valor === 0) return "0";
	return valor > 0 ? `+${inteiro(valor)}` : `−${inteiro(Math.abs(valor))}`;
}

/**
 * O texto principal da campanha.
 *
 * Quando o gerenciador não espelhou, o que existe é a chave crua do link do
 * anúncio — que chega URL-encoded (`BOFU+-+AJA+%7C+...`). Decodificamos para
 * leitura; a chave crua continua no `title` e na busca. Quando nem isso existe
 * (só o id numérico), não há o que mostrar: é campanha nova, nome pendente.
 */
function rotuloDaLinha(linha: LinhaCampanha): string {
	if (linha.semOrigemConhecida) return "Sem origem conhecida";
	if (linha.nomeResolvido) return linha.nome;
	const utm = linha.utmCampaign?.trim();
	if (utm) return decodificarChaveDeCampanha(utm);
	if (ehIdNumerico(linha.chave)) return "Campanha nova · nome pendente";
	return decodificarChaveDeCampanha(linha.nome);
}

const ICONE_DO_MOTIVO = {
	sem_qualificado: MinusIcon,
	sem_gasto: WalletCardsIcon,
	sem_vinculo: UnlinkIcon,
} as const;

/** A célula de custo: o motivo vira ÍCONE + RÓTULO, nunca só cor. */
function CelulaCusto({ custo }: { custo: CustoPorQualificado }) {
	const descrito = descreverCusto(custo);
	const Icone = descrito.motivo ? ICONE_DO_MOTIVO[descrito.motivo] : null;
	return (
		<TableCell className="text-right tabular-nums" title={descrito.tooltip}>
			<span className="inline-flex items-center justify-end gap-1.5">
				{Icone && <Icone className="size-3.5 text-muted-foreground" aria-hidden="true" />}
				<span className={descrito.motivo ? "text-muted-foreground" : "font-medium"}>
					{descrito.texto}
				</span>
			</span>
		</TableCell>
	);
}

function CelulaDiferenca({ valor }: { valor: number }) {
	return (
		<TableCell
			className="text-right tabular-nums text-muted-foreground"
			title={
				valor > 0
					? "A Meta atribuiu mais leads do que o CRM contou no período"
					: valor < 0
						? "O CRM contou mais leads do que a Meta atribuiu no período"
						: "Os dois números coincidiram neste período — é raro e não significa que os dois medem o mesmo"
			}
		>
			{diferenca(valor)}
		</TableCell>
	);
}

export function TabelaCampanhas({ linhas }: { linhas: LinhaCampanha[] }) {
	const [maisColunas, setMaisColunas] = useState(false);
	const [expandida, setExpandida] = useState<string | null>(null);

	// Quando NENHUMA campanha tem custo calculável, a ordenação efetiva deixa de
	// ser custo e passa a ser investimento. Dizer "ordenado por custo" nesse
	// estado seria falso — o operador ordenaria mentalmente por uma coluna que
	// está toda sem valor.
	const temCustoCalculavel = linhas.some((l) => l.custoPorQualificado.tipo === "valor");

	if (linhas.length === 0) {
		return null;
	}

	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Desempenho por campanha</CardTitle>
				<CardDescription>
					{temCustoCalculavel
						? "Ordenado por custo por lead qualificado — as com custo mais alto no topo. Campanha sem custo calculável aparece no fim, dizendo por quê."
						: "Ordenado por investimento — ainda não há lead qualificado para calcular custo."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Collapsible open={maisColunas} onOpenChange={setMaisColunas}>
					<div className="mb-3 flex justify-end">
						<CollapsibleTrigger
							render={
								<Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" />
							}
						>
							<ChevronRightIcon
								className={`size-4 transition-transform ${maisColunas ? "rotate-90" : ""}`}
								aria-hidden="true"
							/>
							{maisColunas ? "Menos colunas" : "Mais colunas"}
						</CollapsibleTrigger>
					</div>

					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Campanha</TableHead>
									<TableHead className="text-right">Investimento</TableHead>
									<TableHead className="text-right">Custo / qualificado</TableHead>
									<TableHead className="text-right" title="Conversas com contato deixado no CRM">
										Leads no CRM
									</TableHead>
									<TableHead className="text-right">Qualificados</TableHead>
									{maisColunas && (
										<>
											<TableHead
												className="text-right"
												title="Leads que a Meta atribuiu no período"
											>
												Leads (Meta)
											</TableHead>
											<TableHead className="text-right" title="Leads (Meta) menos Leads no CRM">
												Diferença
											</TableHead>
											<TableHead className="text-right">Conversas</TableHead>
											<TableHead className="text-right">Propostas</TableHead>
											<TableHead className="text-right">Fechados</TableHead>
										</>
									)}
								</TableRow>
							</TableHeader>
							<TableBody>
								{linhas.map((linha) => (
									<Fragment key={linha.chave}>
										<TableRow className={linha.semOrigemConhecida ? "bg-muted/40" : undefined}>
											<TableCell>
												<div className="flex min-w-0 flex-col gap-1">
													<span className="font-medium" title={linha.entityId ?? linha.chave}>
														{rotuloDaLinha(linha)}
													</span>
													<div className="flex items-center gap-2">
														{linha.semOrigemConhecida ? (
															<span className="text-xs text-muted-foreground">
																Chegaram sem UTM ou referência — não dá para atribuir a campanha
															</span>
														) : (
															<>
																{!linha.nomeResolvido && (
																	<Badge
																		variant="outline"
																		className="w-fit gap-1 font-normal text-xs"
																		title="A Meta ainda não espelhou esta campanha. O rótulo é o que veio no link do anúncio, decodificado. A busca continua encontrando pela chave original."
																	>
																		<TriangleAlertIcon className="size-3" aria-hidden="true" />
																		Nome pendente do gerenciador
																	</Badge>
																)}
																{linha.status && (
																	<Badge variant="secondary" className="w-fit font-normal text-xs">
																		{ROTULO_STATUS[linha.status] ?? linha.status}
																	</Badge>
																)}
																{linha.visitas > 0 && (
																	<span className="text-xs text-muted-foreground tabular-nums">
																		{inteiro(linha.visitas)} visitas
																	</span>
																)}
															</>
														)}
													</div>
													{!linha.semOrigemConhecida && linha.visitas > 0 && (
														<Button
															variant="ghost"
															size="sm"
															className="h-6 w-fit gap-1 px-1.5 text-xs text-muted-foreground"
															aria-expanded={expandida === linha.chave}
															onClick={() =>
																setExpandida(expandida === linha.chave ? null : linha.chave)
															}
														>
															<ChevronRightIcon
																className={`size-3.5 transition-transform ${expandida === linha.chave ? "rotate-90" : ""}`}
																aria-hidden="true"
															/>
															{linha.criativos.length > 0
																? `${linha.criativos.length} criativo${linha.criativos.length > 1 ? "s" : ""}`
																: "Criativos"}
														</Button>
													)}
												</div>
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{linha.spendCents === 0 ? "—" : reais(linha.spendCents)}
											</TableCell>
											<CelulaCusto custo={linha.custoPorQualificado} />
											<TableCell className="text-right tabular-nums font-medium">
												{inteiro(linha.identificados)}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{inteiro(linha.qualificados)}
											</TableCell>
											{maisColunas && (
												<>
													<TableCell className="text-right tabular-nums">
														{inteiro(linha.leadsMeta)}
													</TableCell>
													<CelulaDiferenca valor={linha.diferencaDeLeads} />
													<TableCell className="text-right tabular-nums">
														{inteiro(linha.conversas)}
													</TableCell>
													<TableCell className="text-right tabular-nums">
														{inteiro(linha.propostas)}
													</TableCell>
													<TableCell className="text-right tabular-nums font-medium">
														{inteiro(linha.fechados)}
													</TableCell>
												</>
											)}
										</TableRow>
										{expandida === linha.chave && (
											<TableRow className="bg-muted/30 hover:bg-muted/30">
												<TableCell colSpan={maisColunas ? 10 : 5} className="px-6">
													<ListaDeCriativos criativos={linha.criativos} />
												</TableCell>
											</TableRow>
										)}
									</Fragment>
								))}
							</TableBody>
						</Table>
					</div>
				</Collapsible>
			</CardContent>
		</Card>
	);
}

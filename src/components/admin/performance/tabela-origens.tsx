"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { agruparPorCanal, rotuloDaCampanha } from "@/lib/admin/agrupar-origens";
import type { TipoOrigem } from "@/lib/admin/origem-label";
import type { LinhaOrigem } from "@/lib/admin/performance-types";

const ROTULO_TIPO: Record<TipoOrigem, string> = {
	campanha: "Campanha",
	"click-to-whatsapp": "Click-to-WhatsApp",
	referencia: "Referência",
	direto: "Direto",
};

const nf = new Intl.NumberFormat("pt-BR");

/**
 * Desempenho por CANAL, com as campanhas a um clique.
 *
 * Antes era uma linha por campanha, nomeada com o rótulo cru da Meta
 * (`ig · 120250956902860104 · 120250989573330104`): quinze linhas assim, todas
 * zeradas menos a primeira, e nenhuma resposta para a pergunta mais simples do
 * painel — "quanto o Instagram trouxe?". O total do canal não existia em lugar
 * nenhum da tela.
 *
 * O detalhe não foi jogado fora porque quem compra mídia precisa dele para
 * decidir qual criativo pausar; ele só deixou de ser a leitura padrão.
 */
export function TabelaOrigens({
	origens,
	de,
	ate,
}: {
	origens: LinhaOrigem[];
	/** O período da tela viaja no link — sem ele o número clicado não bate com a lista que abre. */
	de?: Date | null;
	ate?: Date | null;
}) {
	const canais = agruparPorCanal(origens);
	const [abertos, setAbertos] = useState<Set<string>>(new Set());

	/** O link que abre exatamente as conversas contadas nesta célula. */
	const linkDasConversas = (chave: string, campanha?: string | null) => {
		const p = new URLSearchParams({ origem: chave });
		if (campanha) p.set("campanha", campanha);
		if (de) p.set("from", de.toISOString());
		if (ate) p.set("to", ate.toISOString());
		return `/admin/conversations?${p.toString()}`;
	};

	const alternar = (chave: string) =>
		setAbertos((atual) => {
			const proximo = new Set(atual);
			if (proximo.has(chave)) proximo.delete(chave);
			else proximo.add(chave);
			return proximo;
		});

	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Desempenho por origem</CardTitle>
				<CardDescription>Quanto cada canal trouxe — e quanto virou contrato</CardDescription>
			</CardHeader>
			<CardContent>
				{canais.length === 0 ? (
					<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
						Nenhuma visita registrada no período
					</div>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Canal</TableHead>
									<TableHead className="text-right">Visitas</TableHead>
									<TableHead className="text-right">Conversas</TableHead>
									<TableHead className="text-right">Identificados</TableHead>
									<TableHead className="text-right">Propostas</TableHead>
									<TableHead className="text-right">Fechados</TableHead>
									<TableHead className="text-right">Visita → contrato</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{canais.map((canal) => {
									// Canal com uma origem só (Direto, um referrer isolado) não ganha
									// seta: abrir para mostrar a si mesmo é ruído.
									const temDetalhe = canal.detalhe.length > 1;
									const aberto = abertos.has(canal.chave);

									return (
										<Fragment key={canal.chave}>
											<TableRow
												className={temDetalhe ? "cursor-pointer" : undefined}
												onClick={temDetalhe ? () => alternar(canal.chave) : undefined}
											>
												<TableCell>
													<div className="flex items-center gap-2">
														{temDetalhe ? (
															<button
																type="button"
																// O clique da linha inteira já alterna; este botão existe
																// para quem navega por teclado e para dar rótulo ao
																// leitor de tela.
																onClick={(e) => {
																	e.stopPropagation();
																	alternar(canal.chave);
																}}
																aria-expanded={aberto}
																aria-label={
																	aberto
																		? `Recolher campanhas de ${canal.nome}`
																		: `Ver ${canal.detalhe.length} campanhas de ${canal.nome}`
																}
																className="text-muted-foreground hover:text-foreground shrink-0"
															>
																<ChevronRightIcon
																	className={`size-4 transition-transform ${aberto ? "rotate-90" : ""}`}
																	aria-hidden="true"
																/>
															</button>
														) : (
															<span className="size-4 shrink-0" aria-hidden="true" />
														)}
														<div className="flex flex-col gap-1 min-w-0">
															<span className="font-medium">{canal.nome}</span>
															<div className="flex items-center gap-2">
																<Badge variant="outline" className="w-fit font-normal text-xs">
																	{ROTULO_TIPO[canal.tipo]}
																</Badge>
																{temDetalhe && (
																	<span className="text-xs text-muted-foreground">
																		{canal.detalhe.length} campanhas
																	</span>
																)}
															</div>
														</div>
													</div>
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{nf.format(canal.visitas)}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{canal.conversas > 0 ? (
														<Link
															href={linkDasConversas(canal.chave)}
															// `stopPropagation` porque a linha inteira alterna a
															// expansão: sem isso, clicar no número abriria a lista E
															// sanfonaria a linha embaixo do dedo.
															onClick={(e) => e.stopPropagation()}
															className="underline underline-offset-2 decoration-dotted hover:decoration-solid"
															title={`Ver as ${nf.format(canal.conversas)} conversas de ${canal.nome}`}
														>
															{nf.format(canal.conversas)}
														</Link>
													) : (
														nf.format(canal.conversas)
													)}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{nf.format(canal.identificados)}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{nf.format(canal.propostas)}
												</TableCell>
												<TableCell className="text-right tabular-nums font-medium">
													{nf.format(canal.fechados)}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{canal.taxaFechamento.toFixed(1)}%
												</TableCell>
											</TableRow>

											{aberto &&
												canal.detalhe.map((linha) => (
													<TableRow
														key={`${canal.chave}:${linha.origem.label}`}
														className="bg-muted/30"
													>
														<TableCell className="py-2">
															<span
																className="pl-6 text-sm text-muted-foreground"
																// O ID inteiro continua acessível: é o que se cola no
																// gerenciador de anúncios para achar a campanha.
																title={linha.origem.label}
															>
																{rotuloDaCampanha(linha.origem)}
															</span>
														</TableCell>
														<TableCell className="text-right tabular-nums py-2 text-sm">
															{nf.format(linha.visitas)}
														</TableCell>
														<TableCell className="text-right tabular-nums py-2 text-sm">
															{linha.conversas > 0 ? (
																<Link
																	href={linkDasConversas(canal.chave, linha.origem.campanha)}
																	className="underline underline-offset-2 decoration-dotted hover:decoration-solid"
																	title={`Ver as ${nf.format(linha.conversas)} conversas desta campanha`}
																>
																	{nf.format(linha.conversas)}
																</Link>
															) : (
																nf.format(linha.conversas)
															)}
														</TableCell>
														<TableCell className="text-right tabular-nums py-2 text-sm">
															{nf.format(linha.identificados)}
														</TableCell>
														<TableCell className="text-right tabular-nums py-2 text-sm">
															{nf.format(linha.propostas)}
														</TableCell>
														<TableCell className="text-right tabular-nums py-2 text-sm font-medium">
															{nf.format(linha.fechados)}
														</TableCell>
														<TableCell className="text-right tabular-nums py-2 text-sm">
															{linha.taxaFechamento.toFixed(1)}%
														</TableCell>
													</TableRow>
												))}
										</Fragment>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

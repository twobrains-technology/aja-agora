"use client";

/**
 * OS INSIGHTS DA RÉGUA — o que a tela mostra além da lista.
 *
 * Quatro perguntas, todas com número do banco e nenhum inventado:
 *
 *   1. **o funil por passo** — quem chegou ao passo 0, 1, 2 e 3, e onde parou;
 *   2. **qual toque converte** — a venda atribuída ao toque que a precedeu;
 *   3. **quanto tempo leva** — mediana entre o toque e a resposta, e entre o
 *      toque e o fechamento, para confrontar com os intervalos desenhados;
 *   4. **o estado honesto** — com a tabela vazia a tela diz que a régua não está
 *      ligada e quantas conversas estão elegíveis, em vez de desenhar um funil
 *      zerado que se leria como "ninguém respondeu".
 *
 * O que NÃO existe aqui: gráfico de zero. Quando não há dado, a seção inteira é
 * substituída pela explicação do estado — é a diferença entre "nada foi
 * enviado" e "ninguém respondeu", e ela é o ponto do bloco.
 */

import { ChevronDown, PowerOffIcon, TrendingDownIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	duracaoLegivel,
	type EstadoDaRegua,
	type InsightsDaRegua,
	type LinhaDoFunil,
	type ResumoDeTempos,
} from "@/lib/admin/remarketing-tela";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("pt-BR");

/** Mediana legível, com a contagem ao lado quando há dado. */
function celulaDeTempo(resumo: ResumoDeTempos) {
	const legivel = duracaoLegivel(resumo.medianaMs);
	if (legivel === null) return <span className="text-muted-foreground">—</span>;
	return (
		<>
			{legivel}
			<span className="block text-xs text-muted-foreground tabular-nums">
				{nf.format(resumo.contagem)} {resumo.contagem === 1 ? "caso" : "casos"}
			</span>
		</>
	);
}

function CartaoDoEstado({ titulo, children }: { titulo: string; children: ReactNode }) {
	return (
		<Card className="border-dashed">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<PowerOffIcon className="size-4 text-muted-foreground" aria-hidden="true" />
					{titulo}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2 text-sm text-muted-foreground">{children}</CardContent>
		</Card>
	);
}

function SemDados({ estado }: { estado: EstadoDaRegua }) {
	if (estado.tipo === "nunca_ligada") {
		return (
			<CartaoDoEstado titulo="A régua de remarketing ainda não está ligada">
				<p>
					Nenhum toque foi enviado até agora, então não há funil, conversão por toque nem tempo de
					resposta para mostrar. Este é o estado real: <strong>nada foi enviado</strong> — o que não
					é o mesmo que ninguém ter respondido.
				</p>
				<p>
					<strong className="text-foreground tabular-nums">
						{nf.format(estado.elegiveisAgora)}
					</strong>{" "}
					{estado.elegiveisAgora === 1 ? "conversa está elegível" : "conversas estão elegíveis"} e
					entrariam na régua no próximo ciclo. Os números aparecem aqui assim que o primeiro toque
					sair.
				</p>
			</CartaoDoEstado>
		);
	}

	if (estado.tipo === "sem_toques_no_periodo") {
		return (
			<CartaoDoEstado titulo="Nenhum toque no período escolhido">
				<p>
					A régua já tem{" "}
					<strong className="text-foreground tabular-nums">
						{nf.format(estado.totalNoHistorico)}
					</strong>{" "}
					{estado.totalNoHistorico === 1 ? "conversa no histórico" : "conversas no histórico"}, mas
					nenhuma entrou no período selecionado. Amplie o período acima para ver o funil — zerar
					aqui seria dizer “ninguém respondeu”.
				</p>
			</CartaoDoEstado>
		);
	}

	return null;
}

function FunilDaRegua({ linhas }: { linhas: LinhaDoFunil[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle
					className="text-base"
					title="“Chegaram” é cumulativo: quantas conversas passaram por aquele passo. “Seguiram” avançou de passo; “saíram” não seguiu (resposta, opt-out, esgotamento, fechamento ou segurar à mão); “ainda esperando” é quem aguarda o próximo toque — a régua é viva, nem todo mundo que não avançou parou."
				>
					Funil da régua por passo
				</CardTitle>
			</CardHeader>
			<CardContent className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Passo</TableHead>
							<TableHead className="text-right">Chegaram ao passo</TableHead>
							<TableHead className="text-right">Seguiram para o próximo</TableHead>
							<TableHead className="text-right">Saíram neste passo</TableHead>
							<TableHead className="text-right">Ainda esperando aqui</TableHead>
							<TableHead className="text-right">Responderam</TableHead>
							<TableHead className="text-right">Fecharam</TableHead>
							<TableHead className="text-right">Opt-out</TableHead>
							<TableHead className="text-right">Esgotaram</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{linhas.map((linha) => (
							<TableRow key={linha.passo}>
								<TableCell className="font-medium">{linha.rotulo}</TableCell>
								<TableCell className="text-right tabular-nums">
									{nf.format(linha.chegaram)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{nf.format(linha.avancaram)}
								</TableCell>
								<TableCell className="text-right tabular-nums">{nf.format(linha.sairam)}</TableCell>
								<TableCell className="text-right tabular-nums">
									{nf.format(linha.aguardando)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{nf.format(linha.responderam)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{nf.format(linha.converteram)}
								</TableCell>
								<TableCell className="text-right tabular-nums">{nf.format(linha.optout)}</TableCell>
								<TableCell className="text-right tabular-nums">
									{nf.format(linha.esgotaram)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

function AtribuicaoDaConversao({ insights }: { insights: InsightsDaRegua }) {
	const { paga, total, semAtribuicao } = insights.conversoes;
	// Enquanto não houver a PRIMEIRA conversão atribuída, a tabela nasce fechada
	// (era "uma tabela inteira de zeros" no print). Com a primeira, abre sozinha.
	const [aberto, setAberto] = useState(total > 0);

	return (
		<Collapsible open={aberto} onOpenChange={setAberto}>
			<Card>
				<CardHeader>
					<CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
						<CardTitle className="flex items-center gap-2 text-base">
							<TrendingDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
							Qual toque converte — e quanto tempo leva
						</CardTitle>
						<ChevronDown
							className={cn(
								"size-4 text-muted-foreground transition-transform",
								aberto && "rotate-180",
							)}
							aria-hidden="true"
						/>
					</CollapsibleTrigger>
					{!aberto && (
						<p className="text-sm text-muted-foreground">
							Nenhuma conversão atribuída ainda — a tabela abre quando houver a primeira.
						</p>
					)}
				</CardHeader>
				<CollapsibleContent>
					<CardContent className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Passo</TableHead>
									<TableHead className="text-right">Conversões atribuídas</TableHead>
									<TableHead className="text-right">Tempo até a resposta (mediana)</TableHead>
									<TableHead className="text-right">Tempo até o fechamento (mediana)</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{insights.funil.map((linha) => {
									const pago = paga !== null && paga === linha.passo;
									return (
										<TableRow key={linha.passo} className={cn(pago && "bg-muted/50")}>
											<TableCell className="font-medium">
												{linha.rotulo}
												{pago && (
													<span className="ml-2 text-xs font-normal text-muted-foreground">
														mais converteu
													</span>
												)}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{nf.format(linha.conversoesAtribuidas)}
											</TableCell>
											<TableCell className="text-right">
												{celulaDeTempo(linha.tempoAteResposta)}
											</TableCell>
											<TableCell className="text-right">
												{celulaDeTempo(linha.tempoAteConversao)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
						<p className="mt-3 text-xs text-muted-foreground">
							{total === 0 ? (
								"Nenhuma conversa desta régua fechou contrato no período. Sem conversão não há como dizer qual toque se paga."
							) : paga === null ? (
								<>
									{nf.format(total)} {total === 1 ? "conversão" : "conversões"} no período, nenhuma
									delas atribuível a um toque.
								</>
							) : (
								<>
									O toque {String(paga).padStart(2, "0")} é o que mais converteu. A conversão é
									atribuída ao toque que a precedeu; ao lado, o tempo real até a resposta de cada
									passo, para confrontar com o intervalo que a régua desenha.
								</>
							)}
							{semAtribuicao > 0 && (
								<>
									{" "}
									{nf.format(semAtribuicao)}{" "}
									{semAtribuicao === 1 ? "conversa fechou" : "conversas fecharam"} antes do último
									toque, sem toque que a precedesse para creditar.
								</>
							)}
						</p>
					</CardContent>
				</CollapsibleContent>
			</Card>
		</Collapsible>
	);
}

export function SecaoDeInsights({
	insights,
	estado,
}: {
	insights: InsightsDaRegua;
	estado: EstadoDaRegua;
}) {
	return (
		<section className="space-y-4" aria-label="Insights da régua">
			{estado.tipo === "com_dados" ? (
				<>
					<FunilDaRegua linhas={insights.funil} />
					<AtribuicaoDaConversao insights={insights} />
				</>
			) : (
				<SemDados estado={estado} />
			)}
		</section>
	);
}

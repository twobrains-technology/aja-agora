"use client";

import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import {
	Ban,
	Check,
	Flag,
	HandIcon,
	Megaphone,
	MessageSquareIcon,
	PauseCircle,
	PlayIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AcaoDaRegua, LinhaDaTela, Situacao } from "@/lib/admin/remarketing-tela";

/** Estado = ícone + rótulo; cor é reforço. Nenhuma situação usa `default` (coral). */
const APARENCIA_DA_SITUACAO: Record<
	Situacao,
	{ variante: "success" | "warning" | "secondary" | "outline" | "destructive"; icone: typeof Check }
> = {
	ativo: { variante: "secondary", icone: Megaphone },
	segurado: { variante: "warning", icone: PauseCircle },
	respondeu: { variante: "success", icone: Check },
	esgotado: { variante: "warning", icone: Flag },
	optout: { variante: "destructive", icone: Ban },
	converteu: { variante: "success", icone: Check },
};

function instanteLegivel(iso: string): string {
	return format(new Date(iso), "dd/MM 'às' HH:mm", { locale: ptBR });
}

function quandoRelativo(iso: string): string {
	return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
}

export function TabelaRemarketing({
	linhas,
	carregando,
	onAbrir,
	onAcao,
	emAndamento,
	vazio,
}: {
	linhas: LinhaDaTela[];
	carregando: boolean;
	/**
	 * Abre a conversa no painel lateral da própria tela.
	 *
	 * É botão e não link porque `/admin/conversations` não aceita o id da
	 * conversa na URL (só canal, status, busca, origem e período): um `href` para
	 * lá abriria a LISTA, fingindo ter aberto o que a pessoa clicou — o mesmo
	 * desfecho que a tabela do Percurso documenta. O painel lateral abre o
	 * histórico de verdade, sem perder o filtro em que o operador está.
	 */
	onAbrir: (linha: LinhaDaTela) => void;
	onAcao: (linha: LinhaDaTela, acao: AcaoDaRegua) => void;
	/** Id da conversa com ação em voo — o botão desabilita enquanto ela dura. */
	emAndamento: string | null;
	vazio: ReactNode;
}) {
	if (!carregando && linhas.length === 0) {
		return (
			<div className="rounded-md border p-8 text-center text-sm text-muted-foreground">{vazio}</div>
		);
	}

	return (
		<div className="rounded-md border overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Contato</TableHead>
						<TableHead>Objetivo</TableHead>
						<TableHead>Passo atual</TableHead>
						<TableHead>Situação</TableHead>
						<TableHead>Próximo toque</TableHead>
						<TableHead>Motivo de saída</TableHead>
						<TableHead className="w-px">Régua</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{linhas.map((linha) => {
						const pendente = emAndamento === linha.conversationId;
						const aparencia = APARENCIA_DA_SITUACAO[linha.situacao];
						const IconeDaSituacao = aparencia.icone;
						return (
							<TableRow key={linha.conversationId}>
								<TableCell>
									<button
										type="button"
										onClick={() => onAbrir(linha)}
										className="text-left font-medium hover:underline"
										title="Abrir a conversa"
									>
										{linha.nome ?? "Sem nome"}
									</button>
									<span className="block text-xs text-muted-foreground">
										{linha.telefoneMascarado ?? "Sem telefone"}
									</span>
								</TableCell>

								<TableCell>{linha.rotuloDoObjetivo}</TableCell>

								<TableCell className="tabular-nums">
									{linha.passoLegivel}
									<span className="block text-xs text-muted-foreground">
										cota de 30 dias: {linha.cotaLegivel}
									</span>
								</TableCell>

								<TableCell>
									<Badge variant={aparencia.variante} className="gap-1">
										<IconeDaSituacao className="size-3" aria-hidden="true" />
										{linha.rotuloDaSituacao}
									</Badge>
								</TableCell>

								<TableCell>
									{linha.proximoToqueISO ? (
										<>
											{instanteLegivel(linha.proximoToqueISO)}
											<span className="block text-xs text-muted-foreground">
												{linha.proximoToqueVencido
													? `vencido ${quandoRelativo(linha.proximoToqueISO)}`
													: quandoRelativo(linha.proximoToqueISO)}
											</span>
										</>
									) : (
										<span className="text-muted-foreground">Nenhum a caminho</span>
									)}
								</TableCell>

								<TableCell>
									{linha.motivoLegivel ? (
										<>
											{linha.motivoLegivel}
											{linha.rastro && linha.situacao === "segurado" && (
												<span className="block text-xs text-muted-foreground">
													{linha.rastro.por}, {quandoRelativo(linha.rastro.em)}
												</span>
											)}
										</>
									) : (
										<span className="text-muted-foreground">Sem motivo de saída</span>
									)}
								</TableCell>

								<TableCell>
									{linha.situacao === "ativo" && (
										<Button
											variant="outline"
											size="sm"
											className="h-8 gap-1.5"
											disabled={pendente}
											onClick={() => onAcao(linha, "segurar")}
											title="Parar a régua para esta pessoa até alguém soltar"
										>
											<HandIcon className="size-3.5" aria-hidden="true" />
											Segurar
										</Button>
									)}

									{linha.situacao === "segurado" && (
										<div className="space-y-1">
											<Button
												variant="outline"
												size="sm"
												className="h-8 gap-1.5"
												disabled={pendente || !linha.podeSoltar}
												onClick={() => onAcao(linha, "soltar")}
												title={
													linha.podeSoltar
														? "Devolver esta conversa para a régua"
														: (linha.motivoDeNaoSoltar ?? "Esta conversa não volta para a régua")
												}
											>
												<PlayIcon className="size-3.5" aria-hidden="true" />
												Soltar
											</Button>
											{/* O impedimento aparece por ESCRITO, não só em tooltip: a
											    tela precisa dizer por que quem pediu para sair não volta. */}
											{!linha.podeSoltar && linha.motivoDeNaoSoltar && (
												<span className="block max-w-56 text-xs text-muted-foreground">
													{linha.motivoDeNaoSoltar}
												</span>
											)}
										</div>
									)}

									{linha.situacao !== "ativo" && linha.situacao !== "segurado" && (
										<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
											<MessageSquareIcon className="size-3.5" aria-hidden="true" />
											Nenhum toque a caminho
										</span>
									)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { MessageSquareIcon, MessageSquareOffIcon } from "lucide-react";
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
import { abreviarId, descreverOrigem } from "@/lib/admin/agrupar-origens";
import { STAGE_LABELS } from "@/lib/admin/lead-stages";
import { type PessoaDoPercurso, rotuloDoPasso } from "@/lib/admin/percurso-types";

const nf = new Intl.NumberFormat("pt-BR");

/** O fim do identificador da pessoa — curto o bastante para caber, longo o bastante para distinguir. */
function marca(pessoa: PessoaDoPercurso): string {
	return pessoa.visitorId.replace(/[^a-z0-9]/gi, "").slice(-4);
}

/** Quem não deixou nome ainda é alguém — e precisa de um jeito de ser citado. */
function nomeNaTela(pessoa: PessoaDoPercurso): string {
	if (pessoa.nome) return pessoa.nome;
	return `Anônimo ${marca(pessoa) || "—"}`;
}

/**
 * O que vai embaixo do nome para dizer QUAL dessas pessoas é esta.
 *
 * Nome sozinho não identifica: a lista de quem parou em "Escreveu" veio com
 * cinco linhas "Joana", de campanhas e dias diferentes, e nenhuma forma de
 * saber qual era qual. O telefone resolve quando existe; quando não existe —
 * que é o caso comum de quem parou antes de se identificar — vale a marca do
 * visitante, a mesma que nomeia os anônimos.
 */
function subtituloDaPessoa(pessoa: PessoaDoPercurso): string | null {
	if (pessoa.telefone) return pessoa.telefone;
	if (!pessoa.nome) return null; // o anônimo já leva a marca no próprio nome
	const m = marca(pessoa);
	return m ? `visitante ${m}` : null;
}

function quandoFoi(iso: string): string {
	return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
}

/**
 * A lista nominal — a metade do pedido que o agregado não responde.
 *
 * O que ela mostra e nenhuma outra tela do painel mostrava: a pessoa que clicou
 * no anúncio e NÃO falou. Em `Conversas` ela não existe (não há conversa), em
 * `Pipeline` também não (não há lead), e na ficha do contato menos ainda (não
 * há contato). Por isso a coluna "Falou?" vem antes das outras: é a pergunta
 * que originou a tela.
 */
export function TabelaPercurso({
	pessoas,
	carregando,
	onAbrir,
}: {
	pessoas: PessoaDoPercurso[];
	carregando: boolean;
	/**
	 * Abre o histórico da pessoa no painel lateral da própria tela.
	 *
	 * Não é link para outra rota de propósito: `/admin/conversations` não aceita
	 * o id de uma conversa na URL (só `channel`, `status`, `q`, `origem`,
	 * `campanha` e o período), então um link assim abriria a lista inteira
	 * fingindo que abriu a conversa — e quem clicasse perderia o filtro em que
	 * estava para não ver o que veio ver.
	 */
	onAbrir: (pessoa: PessoaDoPercurso) => void;
}) {
	if (!carregando && pessoas.length === 0) {
		return (
			<div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
				Ninguém no período com esses filtros.
			</div>
		);
	}

	return (
		<div className="rounded-md border overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Pessoa</TableHead>
						<TableHead>Falou?</TableHead>
						<TableHead>Parou em</TableHead>
						<TableHead>Origem</TableHead>
						<TableHead>Landing</TableHead>
						<TableHead className="text-right">Chegadas</TableHead>
						<TableHead>Última atividade</TableHead>
						<TableHead className="w-px" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{pessoas.map((pessoa) => {
						const falou = pessoa.mensagensDoCliente > 0;
						const raia =
							pessoa.stageDoLead && pessoa.stageDoLead in STAGE_LABELS
								? STAGE_LABELS[pessoa.stageDoLead as keyof typeof STAGE_LABELS]
								: null;

						return (
							<TableRow key={pessoa.chave}>
								<TableCell className="font-medium">
									<div className="flex flex-col gap-0.5">
										<span>{nomeNaTela(pessoa)}</span>
										{subtituloDaPessoa(pessoa) && (
											<span className="text-xs text-muted-foreground tabular-nums">
												{subtituloDaPessoa(pessoa)}
											</span>
										)}
									</div>
								</TableCell>

								<TableCell>
									{/* Ícone + palavra: estado nunca só por cor. */}
									{falou ? (
										<span className="inline-flex items-center gap-1.5 text-sm">
											<MessageSquareIcon className="size-3.5" aria-hidden="true" />
											{nf.format(pessoa.mensagensDoCliente)}{" "}
											{pessoa.mensagensDoCliente === 1 ? "mensagem" : "mensagens"}
										</span>
									) : (
										<span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
											<MessageSquareOffIcon className="size-3.5" aria-hidden="true" />
											Não falou
										</span>
									)}
								</TableCell>

								<TableCell>
									<div className="flex flex-wrap items-center gap-1.5">
										<Badge variant="secondary">{rotuloDoPasso(pessoa.passo)}</Badge>
										{pessoa.perdido && <Badge variant="outline">Perdido</Badge>}
										{/* A raia só aparece quando diz algo que o degrau não disse. */}
										{raia && !pessoa.perdido && pessoa.passo === "proposta" && (
											<span className="text-xs text-muted-foreground">{raia}</span>
										)}
									</div>
								</TableCell>

								<TableCell>
									{/* O rótulo cru fica no `title` e o legível na tela — a mesma
									    escolha da pipeline. `descreverOrigem` já diz canal e
									    campanha, então o criativo embaixo não repete nada. */}
									<div className="flex flex-col gap-0.5" title={pessoa.origemLabel}>
										<span className="text-sm">
											{descreverOrigem({
												tipo: pessoa.origemTipo,
												fonte: pessoa.origemFonte,
												campanha: pessoa.campanha,
												criativo: pessoa.criativo,
												label: pessoa.origemLabel,
											})}
										</span>
										{pessoa.criativo && (
											<span className="text-xs text-muted-foreground truncate max-w-[220px]">
												criativo {abreviarId(pessoa.criativo)}
											</span>
										)}
									</div>
								</TableCell>

								<TableCell className="text-sm text-muted-foreground">
									{pessoa.landingPath ?? "—"}
								</TableCell>

								<TableCell className="text-right tabular-nums">
									{nf.format(pessoa.chegadas)}
								</TableCell>

								<TableCell className="text-sm text-muted-foreground whitespace-nowrap">
									{quandoFoi(pessoa.ultimaAtividade)}
								</TableCell>

								<TableCell>
									{pessoa.contactId || pessoa.conversationId ? (
										<Button size="sm" variant="ghost" onClick={() => onAbrir(pessoa)}>
											{pessoa.contactId ? "Ver ficha" : "Ver conversa"}
										</Button>
									) : (
										// Não é falta de link: essa pessoa não escreveu nada. Dizer isso é
										// mais honesto que um botão que abriria um painel vazio.
										<span className="text-xs text-muted-foreground pr-2">nada a ler</span>
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

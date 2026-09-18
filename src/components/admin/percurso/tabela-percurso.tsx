"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Headset, MessageSquareIcon, MessageSquareOffIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { estadoNaLista } from "@/components/admin/remarketing/estado-na-lista";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { MotivoForaDaRegua } from "@/lib/admin/motivo-fora-da-regua";
import type { Origem } from "@/lib/admin/origem-label";
import { type PessoaDoPercurso, rotuloDoPasso } from "@/lib/admin/percurso-types";
import { tituloDaOrigem } from "@/lib/admin/titulo-da-origem";
import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";

const nf = new Intl.NumberFormat("pt-BR");

/**
 * O estado de régua que a rota do Percurso anexa a cada pessoa (AJA-09). Não
 * está em `percurso-types` (bloco de outro agente): é o contrato desta tela.
 */
interface ReguaDaPessoa {
	naRegua: boolean;
	motivo: string | null;
	status: string | null;
	step: number | null;
	nextTouchAt: string | null;
}

type PessoaComRegua = PessoaDoPercurso & {
	telefoneMascarado?: string | null;
	regua?: ReguaDaPessoa | null;
};

/** Telefone mascarado no padrão do painel (mesmo da Régua). */
function telefoneMascarado(telefone: string | null | undefined): string | null {
	if (!telefone) return null;
	const chave = chaveTelefoneBR(telefone);
	if (!chave) return null;
	return `(${chave.slice(0, 2)}) 9…-${chave.slice(-4)}`;
}

/** O fim do identificador da pessoa — curto o bastante para caber, longo o bastante para distinguir. */
function marca(pessoa: PessoaDoPercurso): string {
	return pessoa.visitorId.replace(/[^a-z0-9]/gi, "").slice(-4);
}

/** Quem não deixou nome ainda é alguém — e precisa de um jeito de ser citado. */
function nomeNaTela(pessoa: PessoaComRegua): string {
	if (pessoa.nome) return pessoa.nome;
	return `Sem nome ${marca(pessoa) || "—"}`;
}

/**
 * O que vai embaixo do nome para dizer QUAL dessas pessoas é esta.
 *
 * Nome sozinho não identifica: a lista de quem parou em "Escreveu" veio com
 * cinco linhas "Joana", de campanhas e dias diferentes, e nenhuma forma de
 * saber qual era qual. O telefone resolve quando existe — e vai MASCARADO, como
 * na Régua: a lista não é lugar de telefone completo (a ficha é).
 */
function subtituloDaPessoa(pessoa: PessoaComRegua): string | null {
	if (pessoa.telefone) return pessoa.telefoneMascarado ?? telefoneMascarado(pessoa.telefone);
	if (!pessoa.nome) return null; // o anônimo já leva a marca no próprio nome
	const m = marca(pessoa);
	return m ? `visitante ${m}` : null;
}

function quandoFoi(iso: string): string {
	return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
}

/**
 * A origem da linha no formato que `descreverOrigem` e `tituloDaOrigem` leem.
 *
 * A pessoa carrega os campos soltos porque a linha vem do SQL; o nome real da
 * campanha e o id inteiro chegam resolvidos do servidor (`percurso-queries`),
 * já que o cache do resolvedor vive lá e o componente é cliente.
 */
function origemDaPessoa(pessoa: PessoaDoPercurso): Origem {
	return {
		tipo: pessoa.origemTipo,
		fonte: pessoa.origemFonte,
		campanha: pessoa.campanha,
		criativo: pessoa.criativo,
		label: pessoa.origemLabel,
		nomeDaCampanha: pessoa.nomeDaCampanha ?? null,
		entityId: pessoa.entityId ?? null,
	};
}

/** A linha de régua no formato que `estadoNaLista` lê. */
function reguaParaCelula(regua: ReguaDaPessoa | null | undefined) {
	if (!regua) return null;
	if (!regua.naRegua) return null; // fora da régua → o motivo é quem manda
	if (regua.status === null) return null;
	return {
		status: regua.status,
		step: regua.step ?? 0,
		nextTouchAt: regua.nextTouchAt ? new Date(regua.nextTouchAt) : null,
		ultimoToqueEm: null,
		motivoSaida: null,
	};
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
	vazio,
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
	/**
	 * O que dizer quando a lista sai vazia.
	 *
	 * "Ninguém no período com esses filtros" é indistinguível de painel quebrado —
	 * foi assim que a lista vazia de "Abriu o chat" foi lida em 24/08/2026. Um
	 * degrau terminal vazio costuma ser boa notícia (ninguém parou ali), e quem
	 * monta a frase é a tela, que conhece o degrau e a escada.
	 */
	vazio?: ReactNode;
}) {
	const linhas = pessoas as PessoaComRegua[];
	const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
	const [enviando, setEnviando] = useState(false);
	const [aviso, setAviso] = useState<string | null>(null);

	// A coluna Régua só aparece quando a rota trouxe o dado (sempre traz) E há
	// alguém para dizer algo sobre — sem isso, seria coluna vazia.
	const temColunaRegua = linhas.some((p) => p.regua !== undefined);

	const comRegua = linhas.filter((p) => p.regua?.naRegua === true).length;
	const foraDaRegua = linhas.filter((p) => p.regua && !p.regua.naRegua).length;

	const selecionaveis = linhas.filter((p) => p.conversationId && p.canal === "whatsapp");
	const idsSelecionados = [...selecionadas].filter((id) =>
		selecionaveis.some((p) => p.conversationId === id),
	);

	function alternar(id: string) {
		setSelecionadas((atual) => {
			const proximo = new Set(atual);
			if (proximo.has(id)) proximo.delete(id);
			else proximo.add(id);
			return proximo;
		});
	}

	async function enviarParaMesa() {
		if (idsSelecionados.length === 0 || enviando) return;
		// Manda os ids de CONVERSA: é o vínculo estável entre a lista e o lead.
		const idsConversa = selecionaveis
			.filter((p) => p.conversationId && selecionadas.has(p.conversationId))
			.map((p) => p.conversationId as string);
		setEnviando(true);
		setAviso(null);
		try {
			const res = await fetch("/api/admin/percurso/enviar-para-mesa", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ids: idsConversa }),
			});
			const corpo = (await res.json().catch(() => null)) as {
				enviados?: number;
				total?: number;
				error?: string;
			} | null;
			if (!res.ok) throw new Error(corpo?.error ?? `HTTP ${res.status}`);
			setAviso(
				`${corpo?.enviados ?? 0} de ${corpo?.total ?? idsConversa.length} enviadas para a mesa.`,
			);
			setSelecionadas(new Set());
		} catch (e) {
			setAviso(e instanceof Error ? e.message : "Não consegui enviar para a mesa.");
		} finally {
			setEnviando(false);
		}
	}

	if (!carregando && pessoas.length === 0) {
		return (
			<div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
				{vazio ?? "Ninguém no período com esses filtros."}
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				{temColunaRegua ? (
					<p className="text-sm text-muted-foreground">
						Nesta lista: <strong className="text-foreground">{nf.format(foraDaRegua)}</strong> fora
						da régua, <strong className="text-foreground">{nf.format(comRegua)}</strong> na régua.
					</p>
				) : (
					<span />
				)}
				<div className="flex items-center gap-2">
					{aviso && <span className="text-xs text-muted-foreground">{aviso}</span>}
					<Button
						size="sm"
						variant="outline"
						disabled={idsSelecionados.length === 0 || enviando}
						onClick={() => void enviarParaMesa()}
						title="Abrir um atendimento de mesa para as pessoas selecionadas (só WhatsApp)"
					>
						<Headset className="size-3.5" aria-hidden="true" />
						{enviando
							? "Enviando…"
							: `Enviar para a mesa${idsSelecionados.length ? ` (${idsSelecionados.length})` : ""}`}
					</Button>
				</div>
			</div>

			<div className="rounded-md border overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-px" />
							<TableHead>Pessoa</TableHead>
							<TableHead>Falou?</TableHead>
							<TableHead>Parou em</TableHead>
							{temColunaRegua && <TableHead>Régua</TableHead>}
							<TableHead>Origem</TableHead>
							<TableHead>Landing</TableHead>
							<TableHead className="text-right">Chegadas</TableHead>
							<TableHead>Última atividade</TableHead>
							<TableHead className="w-px" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{linhas.map((pessoa) => {
							const falou = pessoa.mensagensDoCliente > 0;
							const raia =
								pessoa.stageDoLead && pessoa.stageDoLead in STAGE_LABELS
									? STAGE_LABELS[pessoa.stageDoLead as keyof typeof STAGE_LABELS]
									: null;
							const origem = origemDaPessoa(pessoa);
							const podeSelecionar = Boolean(pessoa.conversationId) && pessoa.canal === "whatsapp";
							const idConversa = pessoa.conversationId ?? "";
							return (
								<TableRow key={pessoa.chave}>
									<TableCell>
										<Checkbox
											checked={selecionadas.has(idConversa)}
											disabled={!podeSelecionar}
											onCheckedChange={() => idConversa && alternar(idConversa)}
											title={
												podeSelecionar
													? "Selecionar para enviar à mesa"
													: "Só para conversas de WhatsApp"
											}
											aria-label={`Selecionar ${nomeNaTela(pessoa)}`}
										/>
									</TableCell>

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

									{temColunaRegua && (
										<TableCell>
											{(() => {
												const regua = pessoa.regua;
												if (!regua) {
													return <span className="text-sm text-muted-foreground">—</span>;
												}
												const estado = estadoNaLista({
													regua: reguaParaCelula(regua),
													motivo: (regua.motivo as MotivoForaDaRegua | null) ?? null,
													agora: new Date(),
												});
												const Icone = estado.icone;
												return (
													<Badge
														variant={estado.variante}
														className="gap-1.5"
														title={estado.tooltip}
													>
														<Icone className="size-3" aria-hidden="true" />
														{estado.rotulo}
													</Badge>
												);
											})()}
										</TableCell>
									)}

									<TableCell>
										{/* O rótulo legível fica na tela e o `title` leva o que
										    IDENTIFICA: o nome oficial e o id inteiro de 18
										    dígitos. O sufixo de seis dígitos casa com dois
										    anúncios diferentes, então ele nunca é a resposta —
										    quando o resolvedor não conhece a campanha, o
										    `title` cai no rótulo cru de antes. */}
										<div className="flex flex-col gap-0.5" title={tituloDaOrigem(origem)}>
											<span className="text-sm">{descreverOrigem(origem)}</span>
											{pessoa.criativo && (
												<span
													className="text-xs text-muted-foreground truncate max-w-[220px]"
													title={pessoa.criativo}
												>
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
		</div>
	);
}

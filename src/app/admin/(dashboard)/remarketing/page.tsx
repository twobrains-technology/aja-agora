"use client";

/**
 * A RÉGUA NA TELA — `/admin/remarketing`.
 *
 * O painel mostrava tudo do funil: quem chegou, quem conversou, quanto custou.
 * O que não existia era onde olhar a régua que dispara sozinha — quem está nela,
 * em que passo, quando sai o próximo toque e, principalmente, **por que** alguém
 * saiu. É a diferença entre operar a régua e descobrir o que ela fez depois.
 *
 * Três decisões de tela, todas com motivo:
 *
 *   1. **O período é o do painel** (`DateRangeFilter` + `PeriodoProvider`), não
 *      um filtro novo — o bloco 5 tornou o período da PESSOA, e uma tela que
 *      resolvesse a janela por conta própria voltaria a quebrar isso.
 *   2. **O que o período recorta é a ENTRADA na régua** (`created_at`), o evento
 *      estável da linha: `next_touch_at` muda a cada toque e some no fim da
 *      sequência, então servir o período por ele esconderia justamente as
 *      conversas paradas. A frase do topo diz isso em português.
 *   3. **"Segurar" e "soltar" são ações do servidor** (rota própria, sessão de
 *      admin/atendente) e a tela só mostra o que a régua permite — quem pediu
 *      opt-out ou esgotou os três toques vê o botão desabilitado COM o motivo
 *      escrito. Silenciar o botão esconderia a regra de quem opera.
 */

import { SettingsIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ConversationDetailPanel } from "@/components/admin/conversations/conversation-detail-panel";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { usePeriodoPadrao } from "@/components/admin/dashboard/periodo-provider";
import { CartoesDaRegua } from "@/components/admin/remarketing/cartoes-da-regua";
import { SecaoDeInsights } from "@/components/admin/remarketing/insights-da-regua";
import { BlocoResumoDaRegua } from "@/components/admin/remarketing/resumo-da-regua";
import { TabelaRemarketing } from "@/components/admin/remarketing/tabela-remarketing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { parseAsDiaDoNegocio } from "@/lib/admin/periodo-querystring";
import type {
	AcaoDaRegua,
	Contadores,
	LinhaDaTela,
	RespostaDaRegua,
	Situacao,
} from "@/lib/admin/remarketing-tela";
import { ROTULO_DA_SITUACAO, SITUACOES, situacaoDoParametro } from "@/lib/admin/remarketing-tela";
import { BENS } from "@/lib/admin/rotulo-do-bem";

const POR_PAGINA = 50;
const nf = new Intl.NumberFormat("pt-BR");

// O "bem" vem do dicionário único do painel (`rotulo-do-bem`): a Régua não
// mantém uma segunda tabela de rótulos que divergiria de Conversas/Percurso.
const OBJETIVOS = BENS.map((b) => ({ valor: b.chave, rotulo: b.rotulo }));

const CONTADORES_VAZIOS: Contadores = {
	ativo: 0,
	segurado: 0,
	respondeu: 0,
	esgotado: 0,
	optout: 0,
	converteu: 0,
};

function BlocoSkeleton({ altura = 320 }: { altura?: number }) {
	return (
		<Card>
			<CardHeader>
				<Skeleton className="h-5 w-48" />
			</CardHeader>
			<CardContent>
				<Skeleton className="w-full" style={{ height: altura }} />
			</CardContent>
		</Card>
	);
}

function ReguaContent() {
	// O período da PESSOA: a URL manda, o cookie é o segundo degrau (o provider
	// entrega o que o layout leu do servidor). Mesmo par de fontes que o filtro
	// usa — as duas pontas não podem falar de janelas diferentes.
	const padrao = usePeriodoPadrao();
	const [fromUrl] = useQueryState("from", parseAsDiaDoNegocio);
	const [toUrl] = useQueryState("to", parseAsDiaDoNegocio);
	const from = fromUrl ?? padrao.de;
	const to = toUrl ?? padrao.ate;

	const [situacao, setSituacao] = useQueryState("situacao", parseAsString);
	const [objetivo, setObjetivo] = useQueryState("objetivo", parseAsString);
	const [offset, setOffset] = useQueryState("offset", parseAsInteger.withDefault(0));

	// Valor cru da URL vira situação conhecida ou `null` (todas). Um link velho,
	// ou um favorito com uma situação que não existe mais, mostra a lista inteira
	// em vez de uma tela vazia com o filtro "ligado" em nada.
	const situacaoAtiva = situacaoDoParametro(situacao);

	const [data, setData] = useState<RespostaDaRegua | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const [carregando, setCarregando] = useState(true);
	const [aberta, setAberta] = useState<LinhaDaTela | null>(null);
	const [emAndamento, setEmAndamento] = useState<string | null>(null);
	const [erroDaAcao, setErroDaAcao] = useState<string | null>(null);

	// Depender do INSTANTE e não do objeto `Date`: o parser devolve uma instância
	// nova a cada render mesmo com a URL igual, e o `useCallback` nunca
	// estabilizaria (é o defeito que `percurso/page.tsx` documenta).
	const deMs = from.getTime();
	const ateMs = to.getTime();

	const carregar = useCallback(async () => {
		setCarregando(true);
		try {
			const p = new URLSearchParams({
				from: new Date(deMs).toISOString(),
				to: new Date(ateMs).toISOString(),
				limit: String(POR_PAGINA),
				offset: String(offset),
			});
			if (situacaoAtiva) p.set("situacao", situacaoAtiva);
			if (objetivo) p.set("objetivo", objetivo);

			const res = await fetch(`/api/admin/remarketing?${p.toString()}`);
			if (!res.ok) {
				const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(corpo?.error ?? `HTTP ${res.status}`);
			}
			setData((await res.json()) as RespostaDaRegua);
			setErro(null);
		} catch (e) {
			// Sem dados, a tela não mostra número: um contador zerado por falha de
			// consulta seria lido como "a régua está vazia".
			setData(null);
			setErro(e instanceof Error ? e.message : "Falha ao carregar a régua");
		} finally {
			setCarregando(false);
		}
	}, [deMs, ateMs, offset, situacaoAtiva, objetivo]);

	useEffect(() => {
		void carregar();
	}, [carregar]);

	const agir = async (linha: LinhaDaTela, acao: AcaoDaRegua) => {
		setEmAndamento(linha.conversationId);
		setErroDaAcao(null);
		try {
			const res = await fetch(`/api/admin/remarketing/${linha.conversationId}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ acao }),
			});
			if (!res.ok) {
				const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(corpo?.error ?? `HTTP ${res.status}`);
			}
			await carregar();
		} catch (e) {
			setErroDaAcao(e instanceof Error ? e.message : "Não consegui completar a ação.");
		} finally {
			setEmAndamento(null);
		}
	};

	const trocarSituacao = (nova: Situacao | null) => {
		setSituacao(nova);
		setOffset(0);
	};

	const pagina = Math.floor(offset / POR_PAGINA) + 1;
	const totalPaginas = data ? Math.max(1, Math.ceil(data.total / POR_PAGINA)) : 1;

	// Com a consulta fora do ar, a tela NÃO mostra número nenhum: cartão zerado por
	// falha de leitura seria lido como "a régua está vazia", que é o pior desfecho
	// possível para quem decide operação por esta tela. Fica só o aviso acima.
	const semDados = erro !== null && data === null;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Régua de remarketing</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Quem ficou em silêncio e vai receber toque automático — em que passo, quando é o próximo
						e por que saiu. O período conta quando a conversa <strong>entrou</strong> na régua.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{/* O cadastro da dinâmica vive em página própria: aqui é a lista de
					    quem está na régua, lá é o ajuste dos parâmetros dela. */}
					<Button variant="outline" render={<Link href="/admin/remarketing/config" />}>
						<SettingsIcon className="size-3.5" />
						Cadastro da régua
					</Button>
					<DateRangeFilter />
				</div>
			</div>

			{erro && (
				<div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
					Não consegui carregar a régua: {erro}{" "}
					<Button variant="link" className="h-auto p-0" onClick={() => void carregar()}>
						Tentar de novo
					</Button>
				</div>
			)}

			{erroDaAcao && (
				<div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
					{erroDaAcao}{" "}
					<Button variant="link" className="h-auto p-0" onClick={() => setErroDaAcao(null)}>
						Fechar
					</Button>
				</div>
			)}

			{semDados && (
				<div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
					Enquanto a consulta não volta, esta tela prefere não mostrar número nenhum a mostrar zero
					— zero aqui seria lido como “régua vazia”. Use “Tentar de novo” acima.
				</div>
			)}

			{!semDados && (
				<>
					{/* O RESUMO vem primeiro (AJA-04): é a pergunta que a Bruna faz ao abrir
					    a tela — "quantas foram disparadas?". A lista operacional é o
					    segundo bloco, e o funil/atribuição fecha a página. */}
					{data ? (
						<BlocoResumoDaRegua resumo={data.resumo} ligada={data.ligada} />
					) : (
						<Skeleton className="h-24 w-full" />
					)}

					{/* Régua nunca ligada: não há lista nem contador para mostrar. O estado
					    honesto vem com os insights, no fim — e um funil de zeros mentiria. */}
					{data?.estado.tipo !== "nunca_ligada" && (
						<>
							{carregando && !data ? (
								<Skeleton className="h-24 w-full" />
							) : (
								<CartoesDaRegua
									contadores={data?.contadores ?? CONTADORES_VAZIOS}
									situacaoAtiva={situacaoAtiva}
									onSelecionar={trocarSituacao}
								/>
							)}

							<div className="flex flex-wrap items-center gap-2">
								{/* Situação: o mesmo vocabulário dos cartões, para o filtro não inventar
						    um segundo nome para o que o operador acabou de ler acima. */}
								<span className="text-xs text-muted-foreground">Situação</span>
								<Select
									value={situacaoAtiva ?? "todas"}
									onValueChange={(valor) =>
										trocarSituacao(valor === "todas" ? null : (valor as Situacao))
									}
								>
									<SelectTrigger size="sm" title="Filtrar por situação">
										<SelectValue placeholder="Situação" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="todas">Todas as situações</SelectItem>
										{SITUACOES.map((s) => (
											<SelectItem key={s} value={s}>
												{ROTULO_DA_SITUACAO[s]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>

								<span className="text-xs text-muted-foreground">Bem</span>
								<Select
									value={objetivo ?? "todos"}
									onValueChange={(valor) => {
										setObjetivo(valor === "todos" ? null : valor);
										setOffset(0);
									}}
								>
									<SelectTrigger size="sm" title="Filtrar por bem">
										<SelectValue placeholder="Bem" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="todos">Todos os bens</SelectItem>
										{OBJETIVOS.map((o) => (
											<SelectItem key={o.valor} value={o.valor}>
												{o.rotulo}
											</SelectItem>
										))}
									</SelectContent>
								</Select>

								{objetivo && (
									<Badge variant="secondary" className="gap-1.5">
										Bem: {OBJETIVOS.find((o) => o.valor === objetivo)?.rotulo ?? objetivo}
										<button
											type="button"
											aria-label="Remover o filtro de objetivo"
											className="hover:text-foreground"
											onClick={() => {
												setObjetivo(null);
												setOffset(0);
											}}
										>
											<XIcon className="size-3" aria-hidden="true" />
										</button>
									</Badge>
								)}

								{data && (
									<span className="ml-auto text-sm text-muted-foreground tabular-nums">
										{situacaoAtiva ? (
											<>
												{nf.format(data.total)} de {nf.format(data.totalDoRecorte)}{" "}
												{data.totalDoRecorte === 1 ? "conversa" : "conversas"} do período
											</>
										) : (
											<>
												{nf.format(data.totalDoRecorte)}{" "}
												{data.totalDoRecorte === 1 ? "conversa" : "conversas"} na régua no período
											</>
										)}
									</span>
								)}
							</div>

							{carregando && !data ? (
								<Skeleton className="h-64 w-full" />
							) : (
								<TabelaRemarketing
									linhas={data?.linhas ?? []}
									carregando={carregando}
									onAbrir={setAberta}
									onAcao={(linha, acao) => void agir(linha, acao)}
									emAndamento={emAndamento}
									vazio={
										<>
											<strong className="block text-foreground">
												Ninguém na régua neste período com esses filtros.
											</strong>
											<span className="mt-1 block">
												A régua recebe a conversa de WhatsApp que ficou 90 minutos em silêncio. Com
												o período em <strong>Hoje</strong>, só aparece quem entrou na régua hoje —
												os outros períodos estão no filtro acima.
											</span>
										</>
									}
								/>
							)}

							{data && data.total > POR_PAGINA && (
								<div className="flex items-center justify-between">
									<span className="text-sm text-muted-foreground">
										Página {pagina} de {totalPaginas}
									</span>
									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											disabled={offset === 0}
											onClick={() => setOffset(Math.max(0, offset - POR_PAGINA))}
										>
											Anterior
										</Button>
										<Button
											variant="outline"
											size="sm"
											disabled={offset + POR_PAGINA >= data.total}
											onClick={() => setOffset(offset + POR_PAGINA)}
										>
											Próxima
										</Button>
									</div>
								</div>
							)}
						</>
					)}

					{/* Funil por passo e atribuição da conversão fecham a página: são análise,
					    não operação — quem abre a Régua quer a lista e o resumo antes. */}
					{data && <SecaoDeInsights insights={data.insights} estado={data.estado} />}
				</>
			)}

			{/* A conversa abre AQUI, sem o operador perder o filtro em que está. */}
			<ConversationDetailPanel
				conversationId={aberta?.conversationId ?? null}
				open={Boolean(aberta)}
				onClose={() => setAberta(null)}
			/>
		</div>
	);
}

export default function RemarketingPage() {
	return (
		<Suspense fallback={<BlocoSkeleton />}>
			<ReguaContent />
		</Suspense>
	);
}

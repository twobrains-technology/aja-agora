"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ConversationDetailPanel } from "@/components/admin/conversations/conversation-detail-panel";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { EscadaDoPercurso } from "@/components/admin/percurso/escada-do-percurso";
import { TabelaPercurso } from "@/components/admin/percurso/tabela-percurso";
import { ContactDetailPanel } from "@/components/admin/pipeline/contact-detail-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { abreviarId, nomeDaFonte } from "@/lib/admin/agrupar-origens";
import {
	ORDEM_DOS_PASSOS,
	type PassoDoPercurso,
	type PercursoResponse,
	type PessoaDoPercurso,
} from "@/lib/admin/percurso-types";
import { diaDeHoje } from "@/lib/admin/periodo";
import { parseAsDiaDoNegocio } from "@/lib/admin/periodo-querystring";

const POR_PAGINA = 50;
const nf = new Intl.NumberFormat("pt-BR");

/**
 * O período padrão, decidido UMA vez por montagem.
 *
 * Calcular no corpo do componente parece inofensivo e não é: o valor é
 * recalculado a cada render, então `from` é um objeto novo toda vez, o
 * `useCallback` que carrega os dados nunca estabiliza e a tela dispara a
 * consulta duas vezes por carga — medido nos logs do servidor, com os dois
 * pedidos separados por 300ms e com janelas de data diferentes. Numa tela cujo
 * agregado varre `visits` do período inteiro, isso é o dobro de trabalho no
 * banco por carga, para responder a mesma pergunta.
 *
 * QUAL é o período mora em `periodo.ts` — desde 24/08/2026, hoje.
 */
function usarPeriodoPadrao() {
	const [padrao] = useState(() => ({ de: diaDeHoje(), ate: diaDeHoje() }));
	return padrao;
}

/** Mesmo dicionário da tela de Conversas — o painel não pode ter dois nomes para o mesmo canal. */
function rotuloDaOrigem(origem: string, campanha: string | null): string {
	const nome = origem.startsWith("campanha:")
		? nomeDaFonte(origem.slice("campanha:".length))
		: origem === "ctwa"
			? "Click-to-WhatsApp"
			: origem === "referencia"
				? "Referência"
				: origem === "direto"
					? "Direto"
					: origem;
	return campanha ? `${nome} · campanha ${abreviarId(campanha)}` : nome;
}

function BlocoSkeleton({ altura = 280 }: { altura?: number }) {
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

function PercursoContent() {
	const padrao = usarPeriodoPadrao();
	const [fromUrl] = useQueryState("from", parseAsDiaDoNegocio);
	const [toUrl] = useQueryState("to", parseAsDiaDoNegocio);
	const from = fromUrl ?? padrao.de;
	const to = toUrl ?? padrao.ate;
	const [passo, setPasso] = useQueryState("passo", parseAsString);
	const [modo, setModo] = useQueryState("modo", parseAsString.withDefault("parou"));
	const [origem, setOrigem] = useQueryState("origem", parseAsString);
	const [campanha, setCampanha] = useQueryState("campanha", parseAsString);
	const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
	const [offset, setOffset] = useQueryState("offset", parseAsInteger.withDefault(0));

	const [data, setData] = useState<PercursoResponse | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const [carregando, setCarregando] = useState(true);
	const [busca, setBusca] = useState(q);
	const [aberta, setAberta] = useState<PessoaDoPercurso | null>(null);

	// Debounce da busca: cada tecla disparando a query agregada do período
	// inteiro é caro no banco e pisca a tela sem necessidade.
	useEffect(() => {
		const id = setTimeout(() => {
			if (busca !== q) {
				setQ(busca || null);
				setOffset(0);
			}
		}, 400);
		return () => clearTimeout(id);
	}, [busca, q, setQ, setOffset]);

	// Depender do INSTANTE e não da instância: o parser devolve um `Date` novo a
	// cada render mesmo quando a URL não mudou.
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
				modo,
			});
			if (passo) p.set("passo", passo);
			if (origem) p.set("origem", origem);
			if (campanha) p.set("campanha", campanha);
			if (q) p.set("q", q);

			const res = await fetch(`/api/admin/percurso?${p.toString()}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			setData((await res.json()) as PercursoResponse);
			setErro(null);
		} catch (e) {
			setErro(e instanceof Error ? e.message : "Falha ao carregar");
		} finally {
			setCarregando(false);
		}
	}, [deMs, ateMs, offset, modo, passo, origem, campanha, q]);

	useEffect(() => {
		void carregar();
	}, [carregar]);

	const passoAtual = ORDEM_DOS_PASSOS.includes(passo as PassoDoPercurso)
		? (passo as PassoDoPercurso)
		: null;

	const selecionarPasso = (proximo: PassoDoPercurso | null) => {
		setPasso(proximo);
		setOffset(0);
	};

	const pagina = Math.floor(offset / POR_PAGINA) + 1;
	const totalPaginas = data ? Math.max(1, Math.ceil(data.total / POR_PAGINA)) : 1;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Percurso do lead</h1>
					<p className="text-muted-foreground text-sm mt-1">
						Quem chegou pela campanha e até onde foi — inclusive quem não chegou a falar.
					</p>
				</div>
				<DateRangeFilter />
			</div>

			{erro && (
				<div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
					Não consegui carregar o percurso: {erro}.{" "}
					<Button variant="link" className="h-auto p-0" onClick={() => void carregar()}>
						Tentar de novo
					</Button>
				</div>
			)}

			{carregando && !data ? (
				<BlocoSkeleton />
			) : data ? (
				<EscadaDoPercurso
					resumo={data.resumo}
					total={data.totalDePessoas}
					selecionado={passoAtual}
					onSelecionar={selecionarPasso}
				/>
			) : null}

			<div className="flex flex-wrap items-center gap-2">
				<div className="relative flex-1 min-w-[220px] max-w-sm">
					<SearchIcon
						className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
						aria-hidden="true"
					/>
					<Input
						value={busca}
						onChange={(e) => setBusca(e.target.value)}
						placeholder="Buscar por nome, telefone ou e-mail"
						className="pl-8 h-8"
					/>
				</div>

				{passoAtual && (
					<Badge variant="secondary" className="gap-1.5">
						{modo === "alcancou" ? "Chegou ao menos a" : "Parou em"}:{" "}
						{data?.resumo.find((r) => r.chave === passoAtual)?.label ?? passoAtual}
						<button
							type="button"
							onClick={() => selecionarPasso(null)}
							aria-label="Remover o filtro de degrau"
							className="hover:text-foreground"
						>
							<XIcon className="size-3" aria-hidden="true" />
						</button>
					</Badge>
				)}

				{passoAtual && (
					<Button
						variant="outline"
						size="sm"
						className="h-8"
						onClick={() => {
							setModo(modo === "alcancou" ? "parou" : "alcancou");
							setOffset(0);
						}}
					>
						{modo === "alcancou" ? "Ver só quem parou aí" : "Ver quem chegou ao menos aí"}
					</Button>
				)}

				{origem && (
					<Badge variant="secondary" className="gap-1.5">
						Origem: {rotuloDaOrigem(origem, campanha)}
						<button
							type="button"
							onClick={() => {
								setOrigem(null);
								setCampanha(null);
								setOffset(0);
							}}
							aria-label="Remover o filtro de origem"
							className="hover:text-foreground"
						>
							<XIcon className="size-3" aria-hidden="true" />
						</button>
					</Badge>
				)}

				{data && (
					<span className="text-sm text-muted-foreground ml-auto tabular-nums">
						{nf.format(data.total)} {data.total === 1 ? "pessoa" : "pessoas"} ·{" "}
						{nf.format(data.totalDeChegadas)} {data.totalDeChegadas === 1 ? "chegada" : "chegadas"}{" "}
						no período
					</span>
				)}
			</div>

			{carregando && !data ? (
				<Skeleton className="h-64 w-full" />
			) : (
				<TabelaPercurso pessoas={data?.pessoas ?? []} carregando={carregando} onAbrir={setAberta} />
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

			{/* O histórico abre AQUI, sem tirar o operador do filtro em que ele está. */}
			<ContactDetailPanel
				contactId={aberta?.contactId ?? null}
				open={Boolean(aberta?.contactId)}
				onClose={() => setAberta(null)}
				conversationId={aberta?.conversationId ?? undefined}
			/>
			<ConversationDetailPanel
				conversationId={aberta && !aberta.contactId ? aberta.conversationId : null}
				open={Boolean(aberta && !aberta.contactId && aberta.conversationId)}
				onClose={() => setAberta(null)}
			/>
		</div>
	);
}

export default function PercursoPage() {
	return (
		<Suspense fallback={<BlocoSkeleton altura={400} />}>
			<PercursoContent />
		</Suspense>
	);
}

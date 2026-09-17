"use client";

/**
 * CAMPANHAS — `/admin/campanhas`.
 *
 * A tela que faltava: existem nove campanhas e 49 anúncios ativos na conta, e o
 * admin não tinha onde olhar por campanha. O funil por origem já existia, mas
 * agrupado por CANAL; aqui ele é o MESMO funil com `GROUP BY campanha`, com o
 * gasto da Meta ao lado.
 *
 * Duas frases ficam no topo e não são decoração:
 *
 *   1. **A janela de atribuição.** Número de mídia sem a janela ao lado é número
 *      que alguém lê errado.
 *   2. **"Meta × CRM".** Os dois números nunca concordam; a tela mostra os dois e
 *      nomeia a diferença, em vez de escolher um e esconder o outro.
 *
 * O período é o do painel (`DateRangeFilter` + `PeriodoProvider`), como em toda
 * tela — a janela acompanha a pessoa, não a página.
 */

import { useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ResumoCampanhas } from "@/components/admin/campanhas/resumo-campanhas";
import { TabelaCampanhas } from "@/components/admin/campanhas/tabela-campanhas";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { usePeriodoPadrao } from "@/components/admin/dashboard/periodo-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { RespostaDeCampanhas } from "@/lib/admin/campanhas-queries";
import { parseAsDiaDoNegocio } from "@/lib/admin/periodo-querystring";

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

function CampanhasContent() {
	const padrao = usePeriodoPadrao();
	const [fromUrl] = useQueryState("from", parseAsDiaDoNegocio);
	const [toUrl] = useQueryState("to", parseAsDiaDoNegocio);
	const from = fromUrl ?? padrao.de;
	const to = toUrl ?? padrao.ate;

	const deMs = from.getTime();
	const ateMs = to.getTime();

	const [dados, setDados] = useState<RespostaDeCampanhas | null>(null);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const carregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			const params = new URLSearchParams({
				from: new Date(deMs).toISOString(),
				to: new Date(ateMs).toISOString(),
			});
			const res = await fetch(`/api/admin/campanhas?${params.toString()}`);
			if (!res.ok) {
				const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(corpo?.error ?? `HTTP ${res.status}`);
			}
			setDados((await res.json()) as RespostaDeCampanhas);
		} catch (e) {
			// Sem dados, nenhum número: cartão zerado por falha de consulta seria lido
			// como "as campanhas não gastaram", que é o pior desfecho para quem decide
			// verba por esta tela.
			setDados(null);
			setErro(e instanceof Error ? e.message : "Falha ao carregar as campanhas");
		} finally {
			setCarregando(false);
		}
	}, [deMs, ateMs]);

	useEffect(() => {
		void carregar();
	}, [carregar]);

	const semDados = erro !== null && dados === null;
	const semGerenciador = dados !== null && !dados.temDadosDoGerenciador;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Campanhas</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						O que cada campanha gastou e o que ela trouxe de verdade no funil — da visita ao
						contrato, com os números da Meta e do CRM lado a lado.
					</p>
					{dados && (
						<p className="mt-1 text-xs text-muted-foreground">
							Janela de atribuição dos números da Meta: {dados.janelaDeAtribuicao}.
						</p>
					)}
				</div>
				<DateRangeFilter />
			</div>

			{erro && (
				<div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
					Não consegui carregar as campanhas: {erro}{" "}
					<Button variant="link" className="h-auto p-0" onClick={() => void carregar()}>
						Tentar de novo
					</Button>
				</div>
			)}

			{semDados && (
				<div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
					Enquanto a consulta não volta, esta tela prefere não mostrar número nenhum a mostrar zero
					— zero aqui seria lido como “nenhuma campanha gastou”. Use “Tentar de novo” acima.
				</div>
			)}

			{!semDados && (
				<>
					{/* Estado honesto: o sync do gerenciador ainda não rodou. Zero seria uma
					    afirmação falsa — ninguém leu o gasto ainda, e é diferente de "não gastou". */}
					{semGerenciador && (
						<div className="rounded-md border p-8 text-center text-sm">
							<strong className="block text-foreground">
								Ainda não há dado do gerenciador de anúncios.
							</strong>
							<span className="mt-1 block text-muted-foreground">
								O ciclo de sincronização com a Meta não rodou para esta conta, então esta tela não
								mostra gasto, custo por lead nem o número de leads que a Meta atribuiu. Os números
								do CRM aparecem abaixo, quando houver campanha identificada no funil.
							</span>
						</div>
					)}

					{carregando && !dados ? (
						<Skeleton className="h-28 w-full" />
					) : (
						<ResumoCampanhas
							totais={
								dados?.totais ?? {
									investimentoCents: 0,
									leadsMeta: 0,
									leadsCrm: 0,
									qualificados: 0,
									propostas: 0,
									fechados: 0,
									custoPorQualificadoCents: null,
								}
							}
						/>
					)}

					{carregando && !dados ? (
						<BlocoSkeleton />
					) : dados && dados.linhas.length > 0 ? (
						<TabelaCampanhas linhas={dados.linhas} />
					) : (
						!semGerenciador && (
							<div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
								Nenhuma campanha com movimento neste período. Amplie o período no filtro acima.
							</div>
						)
					)}
				</>
			)}
		</div>
	);
}

export default function CampanhasPage() {
	return (
		<Suspense fallback={<BlocoSkeleton />}>
			<CampanhasContent />
		</Suspense>
	);
}

"use client";

import { useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { FunilMidiaChart } from "@/components/admin/performance/funil-midia-chart";
import { PortaDoFunilCard } from "@/components/admin/performance/porta-do-funil";
import { SerieAquisicaoChart } from "@/components/admin/performance/serie-aquisicao-chart";
import { TabelaOrigens } from "@/components/admin/performance/tabela-origens";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PerformanceResponse } from "@/lib/admin/performance-types";
import { diaDeHoje } from "@/lib/admin/periodo";
import { parseAsDiaDoNegocio } from "@/lib/admin/periodo-querystring";

// O período padrão vive em `periodo.ts` — desde 24/08/2026 é HOJE, e é o mesmo
// objeto que o filtro e a rota resolvem.
const defaultFrom = () => diaDeHoje();
const defaultTo = () => diaDeHoje();

function BlocoSkeleton({ altura = 300 }: { altura?: number }) {
	return (
		<Card>
			<CardHeader>
				<Skeleton className="h-5 w-40" />
			</CardHeader>
			<CardContent>
				<Skeleton className="w-full" style={{ height: altura }} />
			</CardContent>
		</Card>
	);
}

function PerformanceContent() {
	const [from] = useQueryState("from", parseAsDiaDoNegocio.withDefault(defaultFrom()));
	const [to] = useQueryState("to", parseAsDiaDoNegocio.withDefault(defaultTo()));

	const [midia, setMidia] = useState<PerformanceResponse | null>(null);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	// UM fetch, e não dois.
	//
	// A página puxava também `/api/admin/dashboard` para desenhar um segundo
	// funil — o comercial, de 9 estágios, medido de outra tabela. Eram duas
	// escadas na mesma tela, com números que podiam divergir e o leitor sem
	// saber em qual acreditar. Ficou a que mede o caminho inteiro, da visita ao
	// contrato; a outra saiu, e o request foi junto.
	const carregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);

		try {
			const params = new URLSearchParams();
			if (from) params.set("from", from.toISOString());
			if (to) params.set("to", to.toISOString());

			const resMidia = await fetch(`/api/admin/performance?${params.toString()}`);
			if (!resMidia.ok) throw new Error(`Erro ao carregar performance: ${resMidia.status}`);

			setMidia((await resMidia.json()) as PerformanceResponse);
		} catch (err) {
			setErro(err instanceof Error ? err.message : "Erro desconhecido");
		} finally {
			setCarregando(false);
		}
	}, [from, to]);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const pronto = !carregando && midia !== null;

	return (
		<div className="space-y-6">
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Performance</h1>
					<p className="text-muted-foreground text-sm mt-1">
						De onde vem o tráfego, onde ele vaza e o que vira contrato
					</p>
				</div>
				<DateRangeFilter />
			</div>

			{erro && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
					{erro}
				</div>
			)}

			{/* A porta vem antes do funil, e a cobertura de atribuição virou a nota de
			    rodapé dela — a faixa própria disputava atenção com o título da página
			    para dizer algo que só qualifica estes números. */}
			{pronto ? (
				<PortaDoFunilCard porta={midia.porta} cobertura={midia.cobertura} />
			) : (
				<BlocoSkeleton altura={140} />
			)}

			{pronto ? (
				<FunilMidiaChart etapas={midia.funil} de={from} ate={to} />
			) : (
				<BlocoSkeleton altura={320} />
			)}

			{pronto ? <SerieAquisicaoChart data={midia.serie} /> : <BlocoSkeleton />}

			{pronto ? (
				<TabelaOrigens origens={midia.origens} de={from} ate={to} />
			) : (
				<BlocoSkeleton altura={200} />
			)}
		</div>
	);
}

export default function PerformancePage() {
	return (
		<Suspense
			fallback={
				<div className="space-y-6">
					<Skeleton className="h-8 w-48" />
					<BlocoSkeleton altura={320} />
				</div>
			}
		>
			<PerformanceContent />
		</Suspense>
	);
}

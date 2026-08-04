"use client";

import { subDays } from "date-fns";
import { parseAsIsoDate, useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ChannelBreakdownChart } from "@/components/admin/dashboard/channel-breakdown-chart";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { FunnelChart } from "@/components/admin/dashboard/funnel-chart";
import { KpiCards } from "@/components/admin/dashboard/kpi-cards";
import { CoberturaAtribuicaoAviso } from "@/components/admin/performance/cobertura-atribuicao";
import { FunilMidiaChart } from "@/components/admin/performance/funil-midia-chart";
import { SerieAquisicaoChart } from "@/components/admin/performance/serie-aquisicao-chart";
import { TabelaOrigens } from "@/components/admin/performance/tabela-origens";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardResponse } from "@/lib/admin/dashboard-types";
import type { PerformanceResponse } from "@/lib/admin/performance-types";

function defaultFrom() {
	return subDays(new Date(), 30);
}

function defaultTo() {
	return new Date();
}

function KpiSkeleton() {
	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
			{["credito", "leads", "conversas", "conversao"].map((slot) => (
				<Card key={slot}>
					<CardHeader className="pb-2">
						<Skeleton className="h-4 w-24" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-8 w-16 mb-2" />
						<Skeleton className="h-3 w-32" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

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
	const [from] = useQueryState("from", parseAsIsoDate.withDefault(defaultFrom()));
	const [to] = useQueryState("to", parseAsIsoDate.withDefault(defaultTo()));

	const [midia, setMidia] = useState<PerformanceResponse | null>(null);
	const [funilLead, setFunilLead] = useState<DashboardResponse | null>(null);
	const [carregando, setCarregando] = useState(true);
	const [erro, setErro] = useState<string | null>(null);

	const carregar = useCallback(async () => {
		setCarregando(true);
		setErro(null);

		try {
			const params = new URLSearchParams();
			if (from) params.set("from", from.toISOString());
			if (to) params.set("to", to.toISOString());
			const query = params.toString();

			// As duas metades da mesma pergunta: o topo (mídia) e o fundo (funil de
			// lead que já existia). Em paralelo — uma não depende da outra.
			const [resMidia, resLead] = await Promise.all([
				fetch(`/api/admin/performance?${query}`),
				fetch(`/api/admin/dashboard?${query}`),
			]);

			if (!resMidia.ok) throw new Error(`Erro ao carregar performance: ${resMidia.status}`);
			if (!resLead.ok) throw new Error(`Erro ao carregar o funil de leads: ${resLead.status}`);

			setMidia((await resMidia.json()) as PerformanceResponse);
			setFunilLead((await resLead.json()) as DashboardResponse);
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

			{pronto && <CoberturaAtribuicaoAviso cobertura={midia.cobertura} />}

			{pronto ? <FunilMidiaChart etapas={midia.funil} /> : <BlocoSkeleton altura={320} />}

			{pronto ? <SerieAquisicaoChart data={midia.serie} /> : <BlocoSkeleton />}

			{pronto ? <TabelaOrigens origens={midia.origens} /> : <BlocoSkeleton altura={200} />}

			<div className="pt-2">
				<h2 className="text-lg font-semibold tracking-tight">Funil comercial</h2>
				<p className="text-muted-foreground text-sm mt-1 mb-4">
					O caminho do lead depois que ele se identifica
				</p>

				<div className="space-y-6">
					{funilLead ? <KpiCards kpis={funilLead.kpis} /> : <KpiSkeleton />}

					{funilLead ? (
						<FunnelChart stages={funilLead.funnel_stages} />
					) : (
						<BlocoSkeleton altura={160} />
					)}

					{funilLead ? (
						<ChannelBreakdownChart data={funilLead.channel_breakdown} />
					) : (
						<BlocoSkeleton />
					)}
				</div>
			</div>
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

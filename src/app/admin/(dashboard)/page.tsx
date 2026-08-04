"use client";

import { RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConversasAoVivo } from "@/components/admin/agora/conversas-ao-vivo";
import { PulsoCards } from "@/components/admin/agora/pulso-cards";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgoraResponse } from "@/lib/admin/agora-types";

/** De quanto em quanto tempo a sala de guerra se atualiza sozinha. */
const INTERVALO_MS = 15_000;

function PulsoSkeleton() {
	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
			{["visitas", "conversas", "espera", "mesa", "leads", "fechados"].map((slot) => (
				<Card key={slot}>
					<CardHeader className="pb-2">
						<Skeleton className="h-4 w-28" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-8 w-12 mb-2" />
						<Skeleton className="h-3 w-32" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function horaDe(iso: string): string {
	return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function AgoraPage() {
	const [data, setData] = useState<AgoraResponse | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const [atualizando, setAtualizando] = useState(false);

	const carregar = useCallback(async () => {
		setAtualizando(true);
		try {
			const res = await fetch("/api/admin/agora", { cache: "no-store" });
			if (!res.ok) throw new Error(`Erro ao carregar o painel: ${res.status}`);
			setData((await res.json()) as AgoraResponse);
			setErro(null);
		} catch (err) {
			// Mantém o último retrato na tela e avisa que ele envelheceu — tela de
			// plantão em branco é pior que tela com dado de um minuto atrás rotulado.
			setErro(err instanceof Error ? err.message : "Erro desconhecido");
		} finally {
			setAtualizando(false);
		}
	}, []);

	useEffect(() => {
		carregar();
		const timer = setInterval(carregar, INTERVALO_MS);
		return () => clearInterval(timer);
	}, [carregar]);

	return (
		<div className="space-y-6">
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Agora</h1>
					<p className="text-muted-foreground text-sm mt-1">
						O que está acontecendo neste minuto e o que precisa de gente
					</p>
				</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<RefreshCwIcon
						className={`size-3.5 ${atualizando ? "animate-spin" : ""}`}
						aria-hidden="true"
					/>
					{data ? `Atualizado às ${horaDe(data.geradoEm)}` : "Carregando…"}
				</div>
			</div>

			{erro && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
					{erro} — os números abaixo são do último carregamento que deu certo.
				</div>
			)}

			{data ? <PulsoCards pulso={data.pulso} /> : <PulsoSkeleton />}

			{data ? (
				<ConversasAoVivo conversas={data.conversas} />
			) : (
				<Card>
					<CardHeader>
						<Skeleton className="h-5 w-40" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-[200px] w-full" />
					</CardContent>
				</Card>
			)}
		</div>
	);
}

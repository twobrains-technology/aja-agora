"use client";

/**
 * A REENTRADA DO BOLO PARADO — o painel que abre a porta da janela de 7 dias.
 *
 * A régua não inscreve sozinha quem ficou parado há mais de 7 dias: essa é a
 * decisão de produto, e é ela que deixou 4 conversas de fora em 28/09. O dono
 * decidiu que a reentrada é **deliberada e em lote** — e é este painel que a
 * torna uma ação de gente: mostra QUANTAS vão entrar, QUANTAS ficam de fora e
 * POR QUÊ, e só então dispara.
 *
 * A tela nunca decide sozinha: ela lê o preview (`GET`) e executa (`POST`). O
 * número que o botão anuncia é o MESMO que o servidor vai gravar — as duas
 * pontas chamam `avaliarReentrada` (a mesma função pura), então não há como o
 * botão dizer "12" e o servidor reabrir outro tanto.
 */

import { CalendarX, RefreshCcw, UsersIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PreviewDaReentrada } from "@/lib/admin/remarketing-reentrada";
import { ROTULO_DO_MOTIVO_DE_NAO_REENTRADA } from "@/lib/remarketing/reentrada";

const nf = new Intl.NumberFormat("pt-BR");

function rotuloDoMotivo(motivo: string): string {
	return (
		ROTULO_DO_MOTIVO_DE_NAO_REENTRADA[motivo as keyof typeof ROTULO_DO_MOTIVO_DE_NAO_REENTRADA] ??
		motivo
	);
}

export function PainelDeReentrada({
	ligada,
	onReentrou,
}: {
	/** `REMARKETING_ATIVO` lido no servidor — sem a chave, nada entra. */
	ligada: boolean;
	/** Recarrega a lista depois de reentrar. */
	onReentrou: () => void;
}) {
	const [preview, setPreview] = useState<PreviewDaReentrada | null>(null);
	const [carregando, setCarregando] = useState(true);
	const [executando, setExecutando] = useState(false);
	const [erro, setErro] = useState<string | null>(null);
	const [resultado, setResultado] = useState<number | null>(null);

	const carregarPreview = useCallback(async () => {
		setCarregando(true);
		setErro(null);
		try {
			const res = await fetch("/api/admin/remarketing/reentrada");
			if (!res.ok) {
				const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(corpo?.error ?? `HTTP ${res.status}`);
			}
			setPreview((await res.json()) as PreviewDaReentrada);
		} catch (e) {
			setPreview(null);
			setErro(e instanceof Error ? e.message : "Não consegui calcular a reentrada.");
		} finally {
			setCarregando(false);
		}
	}, []);

	useEffect(() => {
		void carregarPreview();
	}, [carregarPreview]);

	const reentrar = async () => {
		setExecutando(true);
		setErro(null);
		try {
			const res = await fetch("/api/admin/remarketing/reentrada", { method: "POST" });
			if (!res.ok) {
				const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(corpo?.error ?? `HTTP ${res.status}`);
			}
			const corpo = (await res.json()) as PreviewDaReentrada;
			setResultado(corpo.entram);
			await carregarPreview();
			onReentrou();
		} catch (e) {
			setErro(e instanceof Error ? e.message : "Não consegui reentrar as conversas.");
		} finally {
			setExecutando(false);
		}
	};

	const entram = preview?.entram ?? 0;
	const fora = preview ? Object.entries(preview.ficaramDeFora).sort((a, b) => b[1] - a[1]) : [];

	return (
		<Card className="p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="flex items-center gap-2 text-sm font-semibold">
						<RefreshCcw className="size-4" aria-hidden="true" />
						Reentrada do bolo parado
					</h2>
					<p className="max-w-2xl text-xs text-muted-foreground">
						Conversas que ficaram em silêncio há mais de 7 dias não entram na régua sozinhas. Esta
						ação as traz de volta <strong>de uma vez</strong>, por decisão sua — a cota de 30 dias
						de cada pessoa continua contando o que já foi enviado.
					</p>
				</div>
				<Button
					size="sm"
					onClick={() => void reentrar()}
					disabled={!ligada || carregando || executando || entram === 0}
					title={
						!ligada
							? "A régua está desligada (REMARKETING_ATIVO): nada entraria"
							: entram === 0
								? "Nenhuma conversa parada pode reentrar agora"
								: `Trazer ${entram} conversas de volta para a régua`
					}
				>
					<RefreshCcw className="size-3.5" aria-hidden="true" />
					{executando
						? "Reentrando…"
						: entram > 0
							? `Reentrar ${nf.format(entram)} conversas`
							: "Nada para reentrar"}
				</Button>
			</div>

			{erro && (
				<p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
					{erro}
				</p>
			)}

			{resultado !== null && (
				<p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
					{resultado === 0
						? "Nenhuma conversa entrou — o estado já não permitia."
						: `${nf.format(resultado)} conversa(s) voltaram para a régua, no passo 0, com o próximo toque agendado para agora.`}
				</p>
			)}

			{carregando && !preview && (
				<p className="mt-3 text-xs text-muted-foreground">Calculando quem pode reentrar…</p>
			)}

			{preview && (
				<div className="mt-4 grid gap-3 sm:grid-cols-2">
					<div className="rounded-md border p-3">
						<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<UsersIcon className="size-3.5" aria-hidden="true" />
							Vão entrar
						</p>
						<p className="text-2xl font-semibold tabular-nums">{nf.format(entram)}</p>
						<p className="text-xs text-muted-foreground">
							de {nf.format(preview.avaliadas)} conversas paradas no recorte
							{preview.truncado && " (o recorte foi cortado em 500 — há mais além dele)"}
						</p>
					</div>
					<div className="rounded-md border p-3">
						<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<CalendarX className="size-3.5" aria-hidden="true" />
							Ficam de fora
						</p>
						{fora.length === 0 ? (
							<p className="text-xs text-muted-foreground">Nenhuma — todas as paradas entram.</p>
						) : (
							<ul className="space-y-1 text-xs">
								{fora.map(([motivo, n]) => (
									<li key={motivo} className="flex items-baseline justify-between gap-3">
										<span className="text-muted-foreground">{rotuloDoMotivo(motivo)}</span>
										<span className="font-medium tabular-nums">{nf.format(n)}</span>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			)}
		</Card>
	);
}

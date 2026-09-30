"use client";

/**
 * EXPORTAÇÃO E DADOS — `/admin/exportacao`.
 *
 * A área nova que o Kairo pediu (PRD §5.8 / D3) e o mesmo módulo que serve o
 * lote do Gustavo (22/09). Três recortes, cada um com CSV e JSON, sobre o
 * período DA PESSOA (`DateRangeFilter` + `PeriodoProvider`), com o mascaramento
 * ligado por padrão e o histórico de exportações à vista.
 *
 * Decisões de tela, todas com motivo:
 *
 *   1. **O período é o do painel**, não um filtro novo: a exportação é o
 *      recorte da tela, e resolver a janela aqui por conta própria voltaria a
 *      quebrar o período compartilhado (`aja_periodo`).
 *   2. **A contagem vem de rota separada** (`GET /api/admin/exportacao`): contar
 *      não gera arquivo nem grava auditoria — só o download registra.
 *   3. **"Completo" é escolha explícita e avisada.** Desligado, todo dado
 *      pessoal sai mascarado; ligado, um aviso diz o que o arquivo terá.
 */

import { DownloadIcon } from "lucide-react";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { FiltroAB, NOTA_DA_EXPORTACAO } from "@/components/admin/dashboard/filtro-ab";
import { usePeriodoPadrao } from "@/components/admin/dashboard/periodo-provider";
import { CartoesDeExportacao } from "@/components/admin/exportacao/cartoes-de-exportacao";
import { UltimasExportacoes } from "@/components/admin/exportacao/ultimas-exportacoes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { diaDoNegocio } from "@/lib/admin/periodo";
import { parseAsDiaDoNegocio } from "@/lib/admin/periodo-querystring";
import { PARAMETRO_DO_RECORTE_AB } from "@/lib/experimentos/registro";
import type { RespostaDoResumo, TipoExportacao } from "@/lib/exportacao/tipos";
import { TIPOS_DE_EXPORTACAO } from "@/lib/exportacao/tipos";

function BlocoSkeleton() {
	return (
		<Card>
			<CardHeader>
				<Skeleton className="h-5 w-48" />
			</CardHeader>
			<CardContent>
				<Skeleton className="h-64 w-full" />
			</CardContent>
		</Card>
	);
}

function ExportacaoContent() {
	// O período da PESSOA: a URL manda, o cookie é o segundo degrau.
	const padrao = usePeriodoPadrao();
	const [fromUrl] = useQueryState("from", parseAsDiaDoNegocio);
	const [toUrl] = useQueryState("to", parseAsDiaDoNegocio);
	const from = fromUrl ?? padrao.de;
	const to = toUrl ?? padrao.ate;

	const [completo, setCompleto] = useQueryState("completo", parseAsBoolean.withDefault(false));
	const [, setFormato] = useQueryState("formato", parseAsString);

	// O RECORTE da lista chega pela URL (o link que abre esta tela carrega o que
	// estava filtrando lá) e VOLTA para a rota no link de download. Sem ele, o
	// arquivo respondia por outro recorte que a lista (FIX-383).
	const [passo] = useQueryState("passo", parseAsString);
	const [modo] = useQueryState("modo", parseAsString);
	const [origem] = useQueryState("origem", parseAsString);
	const [campanha] = useQueryState("campanha", parseAsString);
	const [q] = useQueryState("q", parseAsString);
	const [ab] = useQueryState(PARAMETRO_DO_RECORTE_AB, parseAsString);

	const [dados, setDados] = useState<RespostaDoResumo | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const [carregando, setCarregando] = useState(true);

	// Depender do INSTANTE: o parser devolve uma Date nova a cada render mesmo
	// com a URL igual, e o `useCallback` nunca estabilizaria.
	const deMs = from.getTime();
	const ateMs = to.getTime();

	// Os parâmetros do recorte, num lugar só: a contagem e o download leem daqui,
	// e duas montagens divergiriam no primeiro filtro novo.
	const paramsDoRecorte = useCallback((): URLSearchParams => {
		const p = new URLSearchParams({
			from: diaDoNegocio(new Date(deMs)),
			to: diaDoNegocio(new Date(ateMs)),
		});
		if (passo) p.set("passo", passo);
		if (modo) p.set("modo", modo);
		if (origem) p.set("origem", origem);
		if (campanha) p.set("campanha", campanha);
		if (q) p.set("q", q);
		if (ab) p.set(PARAMETRO_DO_RECORTE_AB, ab);
		return p;
	}, [deMs, ateMs, passo, modo, origem, campanha, q, ab]);

	const carregar = useCallback(async () => {
		setCarregando(true);
		try {
			const p = paramsDoRecorte();
			const res = await fetch(`/api/admin/exportacao?${p.toString()}`);
			if (!res.ok) {
				const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(corpo?.error ?? `HTTP ${res.status}`);
			}
			setDados((await res.json()) as RespostaDoResumo);
			setErro(null);
		} catch (e) {
			// Sem dados, a tela não mostra número: "0" por falha de consulta seria
			// lido como "não há nada para exportar".
			setDados(null);
			setErro(e instanceof Error ? e.message : "Falha ao carregar as exportações");
		} finally {
			setCarregando(false);
		}
	}, [paramsDoRecorte]);

	useEffect(() => {
		void carregar();
	}, [carregar]);

	const exportar = (tipo: TipoExportacao, formato: "csv" | "json") => {
		const p = paramsDoRecorte();
		p.set("formato", formato);
		if (completo) p.set("completo", "1");
		// O download é uma navegação de arquivo: um link programático deixa o
		// `Content-Disposition` do servidor decidir o nome, sem carregar a página.
		const anchor = document.createElement("a");
		anchor.href = `/api/admin/exportacao/${tipo}?${p.toString()}`;
		anchor.rel = "noopener";
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		setFormato(formato);
		// A auditoria grava no servidor ao responder; um instante depois o
		// histórico já reflete o download.
		setTimeout(() => void carregar(), 1500);
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Exportação e dados</h1>
					<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
						Baixe o recorte do período em CSV ou JSON. As conversas saem mensagem a mensagem, com
						autoria e a etapa do funil no momento de cada uma.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<FiltroAB nota={NOTA_DA_EXPORTACAO} />
					<DateRangeFilter />
				</div>
			</div>

			{erro && (
				<div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
					Não consegui carregar as exportações: {erro}{" "}
					<Button variant="link" className="h-auto p-0" onClick={() => void carregar()}>
						Tentar de novo
					</Button>
				</div>
			)}

			<CartoesDeExportacao
				contagens={dados?.contagens ?? null}
				carregando={carregando}
				completo={completo}
				onTrocarCompleto={(valor) => setCompleto(valor)}
				onExportar={exportar}
			/>

			<UltimasExportacoes linhas={dados?.ultimas ?? []} carregando={carregando} />

			<p className="flex items-center gap-2 text-xs text-muted-foreground">
				<DownloadIcon className="size-3.5" aria-hidden="true" />
				{TIPOS_DE_EXPORTACAO.length} recortes disponíveis. Os arquivos são montados na hora, a
				partir do banco.
			</p>
		</div>
	);
}

export default function ExportacaoPage() {
	return (
		<Suspense fallback={<BlocoSkeleton />}>
			<ExportacaoContent />
		</Suspense>
	);
}

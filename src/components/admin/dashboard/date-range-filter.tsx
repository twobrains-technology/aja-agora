"use client";

// O filtro de período do painel.
//
// O que ele guarda na URL é um DIA (`2026-08-24`), não um instante — quem
// resolve o dia em começo e fim de janela é `resolverPeriodo`, no servidor. A
// divisão importa: dia é o que o operador escolhe e o que cabe num link
// compartilhado; instante é o que o Postgres compara. Misturar os dois foi o que
// fez o intervalo comer o último dia e escorregar um dia na releitura.
//
// ── O período passou a acompanhar a PESSOA (24/08/2026) ──────────────────────
//
// Antes o filtro era da TELA: escolher 30 dias no Acompanhamento e clicar em
// Percurso voltava para hoje, porque o menu monta `href` puro e cada tela
// resolvia o período do zero. Agora a escolha é gravada no cookie
// `aja_periodo`; o layout lê esse cookie no servidor e entrega o padrão aqui.
// A precedência é URL > cookie > hoje (ver `periodo-da-requisicao.ts`).
//
// Este componente é quem ESCREVE os dois lados: a URL (para o link carregar o
// período e para as rotas o lerem) e o cookie (para ele sobreviver à navegação,
// que não carrega a querystring).

import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { ArrowLeftIcon, CalendarIcon, ScaleIcon } from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	COOKIE_DO_PERIODO,
	diaComoData,
	diaDeHoje,
	diaDoNegocio,
	serializarPeriodoDoCookie,
} from "@/lib/admin/periodo";
import { parseAsDiaDoNegocio } from "@/lib/admin/periodo-querystring";
import { usePeriodoPadrao } from "./periodo-provider";

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Um ano: o período é preferência de trabalho, não sessão. */
const VALIDADE_DO_COOKIE_SEGUNDOS = 60 * 60 * 24 * 365;

type IdentificadorDePreset = "hoje" | "7d" | "30d" | "mes-passado" | "personalizado";

interface IntervaloDias {
	de: Date;
	ate: Date;
}

export const PRESETS: { id: IdentificadorDePreset; rotulo: string }[] = [
	{ id: "hoje", rotulo: "Hoje" },
	{ id: "7d", rotulo: "7 dias" },
	{ id: "30d", rotulo: "30 dias" },
	{ id: "mes-passado", rotulo: "Mês passado" },
	{ id: "personalizado", rotulo: "Personalizado" },
];

/** O primeiro dia de um intervalo de `quantidade` dias que termina em `ate`. */
function comecando(ate: Date, quantidade: number): Date {
	return new Date(ate.getTime() - (quantidade - 1) * UM_DIA_MS);
}

/** O mês anterior inteiro, do primeiro ao último dia. */
function mesPassado(hoje: Date): IntervaloDias {
	const ano = hoje.getUTCFullYear();
	const mes = hoje.getUTCMonth();
	// Dia 0 do mês seguinte = último dia do mês anterior, no fuso da âncora.
	return {
		de: new Date(Date.UTC(ano, mes - 1, 1, 12)),
		ate: new Date(Date.UTC(ano, mes, 0, 12)),
	};
}

/** Os dias de um preset. "Personalizado" não tem atalho — é o calendário. */
export function intervaloDoPreset(
	preset: Exclude<IdentificadorDePreset, "personalizado">,
	hoje: Date,
): IntervaloDias {
	switch (preset) {
		case "hoje":
			return { de: hoje, ate: hoje };
		case "7d":
			return { de: comecando(hoje, 7), ate: hoje };
		case "30d":
			return { de: comecando(hoje, 30), ate: hoje };
		case "mes-passado":
			return mesPassado(hoje);
	}
}

function mesmoDia(a: Date, b: Date): boolean {
	return diaDoNegocio(a) === diaDoNegocio(b);
}

function mesmoIntervalo(a: IntervaloDias, b: IntervaloDias): boolean {
	return mesmoDia(a.de, b.de) && mesmoDia(a.ate, b.ate);
}

/** Qual preset descreve o intervalo atual — ou `null` se é um intervalo próprio. */
export function presetDoIntervalo(de: Date, ate: Date, hoje: Date): IdentificadorDePreset {
	for (const preset of ["hoje", "7d", "30d", "mes-passado"] as const) {
		if (mesmoIntervalo(intervaloDoPreset(preset, hoje), { de, ate })) return preset;
	}
	return "personalizado";
}

export function DateRangeFilter() {
	// DIA, não instante: o campo é renderizado no servidor (UTC) e no navegador
	// (Brasília), e só o dia ancorado ao meio-dia UTC escreve a mesma data nos
	// dois. Ver o aviso em `periodoPadrao`.
	const hoje = useMemo(() => diaDeHoje(), []);
	const padrao = usePeriodoPadrao();

	// Sem `withDefault`: o valor cru diz se a querystring trouxe o período ou não,
	// e é isso que decide a hidratação logo abaixo. O que se MOSTRA é
	// `?? padrao`, que é o período vindo do cookie (ou hoje).
	const [fromUrl, setFrom] = useQueryState("from", parseAsDiaDoNegocio);
	const [toUrl, setTo] = useQueryState("to", parseAsDiaDoNegocio);
	const from = fromUrl ?? padrao.de;
	const to = toUrl ?? padrao.ate;

	const [comparar, setComparar] = useState(false);
	const [calendarioAberto, setCalendarioAberto] = useState(false);

	// Grava os DOIS lados de uma vez. O cookie sozinho não bastaria (a rota lê a
	// URL) e a URL sozinha também não (o menu navega com `href` puro e a
	// querystring se perde) — é a combinação que faz o estado acompanhar a
	// pessoa.
	const gravar = (de: Date, ate: Date) => {
		setFrom(de);
		setTo(ate);

		const valor = serializarPeriodoDoCookie(de, ate);
		// biome-ignore lint/suspicious/noDocumentCookie: o desenho é cookie `httpOnly: false` justamente para o cliente gravar; a Cookie Store API é assíncrona e não é o mecanismo decidido.
		document.cookie = `${COOKIE_DO_PERIODO}=${valor}; path=/admin; max-age=${VALIDADE_DO_COOKIE_SEGUNDOS}; samesite=lax`;
	};

	// Hidratação na montagem: quando a URL chega vazia mas a pessoa JÁ tinha um
	// período no cookie, este filtro o coloca na URL. Sem isto, as telas que
	// leem `from`/`to` da querystring (as três que usam este filtro) disparariam
	// a consulta com o padrão do cliente enquanto o servidor responderia pelo
	// cookie — duas janelas diferentes na mesma tela.
	const hidratado = useRef(false);
	useEffect(() => {
		if (hidratado.current) return;
		hidratado.current = true;

		if (!padrao.veioDoCookie) return;
		if (!fromUrl) setFrom(padrao.de);
		if (!toUrl) setTo(padrao.ate);
	}, [padrao, fromUrl, toUrl, setFrom, setTo]);

	const presetAtivo = presetDoIntervalo(from, to, hoje);

	// O calendário devolve meia-noite LOCAL; o que entra na URL e no cookie é o
	// dia do negócio daquela data, ancorado ao meio-dia UTC.
	const escolherDe = (data: Date | undefined) => {
		gravar(data ? diaComoData(diaDoNegocio(data)) : from, to);
	};

	const escolherAte = (data: Date | undefined) => {
		gravar(from, data ? diaComoData(diaDoNegocio(data)) : to);
	};

	const aplicarPreset = (preset: Exclude<IdentificadorDePreset, "personalizado">) => {
		const intervalo = intervaloDoPreset(preset, hoje);
		gravar(intervalo.de, intervalo.ate);
	};

	// O período imediatamente anterior, de MESMA duração — a régua da comparação.
	// "Número sem régua é ruído": ele só existe quando a comparação está ligada.
	const duracao = Math.round((to.getTime() - from.getTime()) / UM_DIA_MS) + 1;
	const anterior: IntervaloDias = {
		de: new Date(from.getTime() - duracao * UM_DIA_MS),
		ate: new Date(from.getTime() - UM_DIA_MS),
	};

	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="hidden text-muted-foreground text-sm sm:inline">Período:</span>

			{/* Atalhos. O preset ativo tem estado escrito (`aria-pressed`), nunca só
			    cor — quem lê a tela precisa saber o período sem depender de enxergar
			    o destaque. */}
			{PRESETS.map((preset) => {
				const ativo = presetAtivo === preset.id;
				return (
					<Button
						key={preset.id}
						variant={ativo ? "secondary" : "ghost"}
						size="sm"
						className="h-8 gap-1 text-xs"
						aria-pressed={ativo}
						title={
							preset.id === "personalizado"
								? "Escolher as datas no calendário"
								: `Ver ${preset.rotulo.toLowerCase()}`
						}
						onClick={() => {
							if (preset.id === "personalizado") {
								setCalendarioAberto(true);
								return;
							}
							aplicarPreset(preset.id);
						}}
					>
						{preset.rotulo}
					</Button>
				);
			})}

			<Popover open={calendarioAberto} onOpenChange={setCalendarioAberto}>
				<PopoverTrigger
					className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent hover:text-accent-foreground"
					title="Primeiro dia do período"
				>
					<CalendarIcon className="size-3.5" />
					{format(from, "dd/MM/yyyy", { locale: ptBR })}
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar mode="single" selected={from} onSelect={escolherDe} locale={ptBR} />
				</PopoverContent>
			</Popover>

			<span className="text-muted-foreground text-xs">-</span>

			<Popover>
				<PopoverTrigger
					className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent hover:text-accent-foreground"
					title="Último dia do período"
				>
					<CalendarIcon className="size-3.5" />
					{format(to, "dd/MM/yyyy", { locale: ptBR })}
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="end">
					<Calendar mode="single" selected={to} onSelect={escolherAte} locale={ptBR} />
				</PopoverContent>
			</Popover>

			{/* Comparação com o período anterior, de mesma duração. DESLIGADA por
			    padrão: a seta e o intervalo de referência só aparecem com ela
			    ligada — número sem régua é ruído. */}
			<Button
				variant={comparar ? "secondary" : "ghost"}
				size="sm"
				className="h-8 gap-1 text-xs"
				aria-pressed={comparar}
				onClick={() => setComparar((atual) => !atual)}
				title="Comparar com o período imediatamente anterior, de mesma duração"
			>
				<ScaleIcon className="size-3.5" aria-hidden="true" />
				Comparar
			</Button>

			{comparar && (
				<span
					className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-input px-3 text-xs text-muted-foreground"
					title="Período de referência: imediatamente anterior, de mesma duração"
				>
					<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
					{format(anterior.de, "dd/MM", { locale: ptBR })} –{" "}
					{format(anterior.ate, "dd/MM", { locale: ptBR })}
				</span>
			)}
		</div>
	);
}

"use client";

// O filtro de período do painel.
//
// O que ele guarda na URL é um DIA (`2026-08-24`), não um instante — quem
// resolve o dia em começo e fim de janela é `resolverPeriodo`, no servidor. A
// divisão importa: dia é o que o operador escolhe e o que cabe num link
// compartilhado; instante é o que o Postgres compara. Misturar os dois foi o que
// fez o intervalo comer o último dia e escorregar um dia na releitura.

import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { CalendarIcon } from "lucide-react";
import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { diaComoData, diaDoNegocio, periodoPadrao } from "@/lib/admin/periodo";
import { parseAsDiaDoNegocio } from "@/lib/admin/periodo-querystring";

/** Quantos dias o atalho "30d" abre. */
const DIAS_DO_ATALHO_LONGO = 30;

export function DateRangeFilter() {
	const padrao = periodoPadrao();

	const [from, setFrom] = useQueryState("from", parseAsDiaDoNegocio.withDefault(padrao.de));
	const [to, setTo] = useQueryState("to", parseAsDiaDoNegocio.withDefault(padrao.ate));

	/** Limpa a querystring: sem parâmetro, o padrão é hoje — nas telas e no servidor. */
	const verHoje = () => {
		setFrom(null);
		setTo(null);
	};

	const verUltimosDias = () => {
		setFrom(diaComoData(diaDoNegocio(subDays(new Date(), DIAS_DO_ATALHO_LONGO))));
		setTo(diaComoData(diaDoNegocio(new Date())));
	};

	// O calendário devolve meia-noite LOCAL; o que vai para a URL é o dia do
	// negócio daquela data, ancorado ao meio-dia UTC.
	const escolher = (definir: (d: Date | null) => void) => (data: Date | undefined) =>
		definir(data ? diaComoData(diaDoNegocio(data)) : null);

	const ehHoje =
		diaDoNegocio(from) === diaDoNegocio(padrao.de) && diaDoNegocio(to) === diaDoNegocio(padrao.ate);

	return (
		<div className="flex items-center gap-2">
			<span className="hidden text-muted-foreground text-sm sm:inline">Período:</span>

			<Popover>
				<PopoverTrigger className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent hover:text-accent-foreground">
					<CalendarIcon className="size-3.5" />
					{from ? format(from, "dd/MM/yyyy", { locale: ptBR }) : "De"}
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={from ?? undefined}
						onSelect={escolher(setFrom)}
						locale={ptBR}
					/>
				</PopoverContent>
			</Popover>

			<span className="text-muted-foreground text-xs">-</span>

			<Popover>
				<PopoverTrigger className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent hover:text-accent-foreground">
					<CalendarIcon className="size-3.5" />
					{to ? format(to, "dd/MM/yyyy", { locale: ptBR }) : "Até"}
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="end">
					<Calendar
						mode="single"
						selected={to ?? undefined}
						onSelect={escolher(setTo)}
						locale={ptBR}
					/>
				</PopoverContent>
			</Popover>

			{/* Os dois atalhos. "Hoje" ganha estado escrito (`aria-pressed` e o
			    realce do botão), nunca só cor — quem lê a tela precisa saber em qual
			    período está sem depender de enxergar o destaque. */}
			<Button
				variant={ehHoje ? "secondary" : "ghost"}
				size="sm"
				className="h-8 gap-1 text-xs"
				onClick={verHoje}
				aria-pressed={ehHoje}
				title="Só o dia de hoje"
			>
				Hoje
			</Button>

			<Button
				variant="ghost"
				size="sm"
				className="h-8 gap-1 text-xs"
				onClick={verUltimosDias}
				title="Últimos 30 dias"
			>
				30d
			</Button>
		</div>
	);
}

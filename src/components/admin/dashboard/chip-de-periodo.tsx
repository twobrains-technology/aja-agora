"use client";

// O CHIP DE PERÍODO — a resposta curta para "que janela estou vendo?".
//
// O filtro (`<DateRangeFilter/>`) mostra a janela em botões e calendário; este
// chip é a leitura em uma linha, no cabeçalho de toda tela do painel. Ele existe
// porque o período virou estado da PESSOA (URL + cookie) e atravessa a
// navegação — sem um lugar que diga em voz alta qual é a janela, duas telas com
// números diferentes parecem discordar quando estão falando de períodos
// diferentes.
//
// Quando a tela IGNORA o período (a sala de guerra, o cadastro, os atendentes),
// o chip não some: ele diz "Sem filtro de período". Silenciar a divergência
// faria o operador supor que aquela tela está recortada como as outras.

import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { CalendarIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import { diaDeHoje } from "@/lib/admin/periodo";
import { parseAsDiaDoNegocio } from "@/lib/admin/periodo-querystring";
import { cn } from "@/lib/utils";
import { PRESETS, presetDoIntervalo } from "./date-range-filter";
import { usePeriodoPadrao } from "./periodo-provider";

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * As telas que recortam por data — as que usam `<DateRangeFilter/>`.
 *
 * A lista é explícita de propósito: uma tela nova que passe a ler o período
 * precisa entrar aqui, e é melhor isso aparecer num diff do que o chip mentir
 * por omissão. `usePathname` é lido no cliente; no servidor o prefixo é o mesmo.
 */
const TELAS_COM_PERIODO = [
	"/admin/performance",
	"/admin/percurso",
	"/admin/campanhas",
	"/admin/remarketing",
	"/admin/mapa-de-calor",
	"/admin/conversations",
	"/admin/pipeline",
] as const;

function telaUsaPeriodo(pathname: string | null): boolean {
	if (!pathname) return true;
	return TELAS_COM_PERIODO.some(
		(prefixo) => pathname === prefixo || pathname.startsWith(`${prefixo}/`),
	);
}

export function ChipDePeriodo({ className }: { className?: string }) {
	const pathname = usePathname();
	const padrao = usePeriodoPadrao();
	// DIA, e ancorado — o mesmo formato do filtro. O `?? padrao` é o que faz o
	// chip abrir com o cookie antes de o filtro hidratar a URL.
	const [fromUrl] = useQueryState("from", parseAsDiaDoNegocio);
	const [toUrl] = useQueryState("to", parseAsDiaDoNegocio);
	const from = fromUrl ?? padrao.de;
	const to = toUrl ?? padrao.ate;
	const hoje = useMemo(() => diaDeHoje(), []);

	const comPeriodo = telaUsaPeriodo(pathname);
	const preset = presetDoIntervalo(from, to, hoje);
	const nomeDoPreset =
		preset === "personalizado" ? null : (PRESETS.find((p) => p.id === preset)?.rotulo ?? null);

	// A contagem de dias é a régua de quem lê o número: "20/08 – 18/09" sozinho
	// não diz se são 30 dias ou um mês inteiro. O preset ativo, quando houver,
	// entra no lugar da contagem — é o nome que a pessoa escolheu no filtro.
	const dias = Math.max(1, Math.round((to.getTime() - from.getTime()) / UM_DIA_MS) + 1);
	const sufixo = nomeDoPreset ?? `${dias} ${dias === 1 ? "dia" : "dias"}`;

	return (
		<span
			className={cn(
				"inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs",
				comPeriodo ? "text-foreground" : "text-muted-foreground",
				className,
			)}
			title={
				comPeriodo
					? "Período em vigor neste painel"
					: "Esta tela não recorta por período — os números dela não mudam com a janela escolhida"
			}
		>
			<CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
			{comPeriodo ? (
				<span className="tabular-nums">
					{format(from, "dd/MM", { locale: ptBR })} – {format(to, "dd/MM", { locale: ptBR })}
					<span className="text-muted-foreground"> · {sufixo}</span>
				</span>
			) : (
				<span>Sem filtro de período</span>
			)}
		</span>
	);
}

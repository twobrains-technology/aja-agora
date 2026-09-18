"use client";

import { Search, X } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parserDeCampanha } from "@/components/admin/dashboard/campanha-filter";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { FiltrosDaTela } from "@/components/admin/dashboard/filtros";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { diaDeHoje, fimDoDia, inicioDoDia } from "@/lib/admin/periodo";
import { parseAsDiaDoNegocio } from "@/lib/admin/periodo-querystring";
import type { Lead } from "./lead-card";
import { periodoEfetivoDoPipeline } from "./periodo-do-pipeline";

const CHANNEL_OPTIONS = [
	{ value: "all", label: "Todos" },
	{ value: "web", label: "Web" },
	{ value: "whatsapp", label: "WhatsApp" },
] as const;

type ChannelFilter = "all" | "web" | "whatsapp";

/** Lista vazia com identidade estável: "sem filtro de campanha". */
const SEM_CAMPANHAS: readonly string[] = [];

function getChannelLabel(value: string): string {
	const option = CHANNEL_OPTIONS.find((opt) => opt.value === value);
	return option?.label ?? value;
}

export function useLeadFilters() {
	const [channel, setChannel] = useQueryState("channel", parseAsString.withDefault("all"));
	const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
	// DIA do negócio, não instante: é o mesmo parser que o `<DateRangeFilter/>` e
	// o chip usam, ancorado ao meio-dia UTC (ver `periodo-querystring.ts`).
	const [dateFrom, setDateFrom] = useQueryState("from", parseAsDiaDoNegocio);
	const [dateTo, setDateTo] = useQueryState("to", parseAsDiaDoNegocio);
	const hoje = useMemo(() => diaDeHoje(), []);

	// O período em vigor precisa estar na URL: é o que o chip do cabeçalho lê e o
	// que o `<DateRangeFilter/>` mostra. Sem escolha salva, o Pipeline não abre em
	// HOJE como o resto do painel — abre "Desde o início", senão o Kanban vazio se
	// lê como tela quebrada (ver `periodo-do-pipeline.ts`). O cookie é lido no
	// efeito porque `document.cookie` durante o render faria o servidor e o
	// navegador discordarem no primeiro quadro.
	const hidratado = useRef(false);
	useEffect(() => {
		if (hidratado.current) return;
		hidratado.current = true;
		if (dateFrom && dateTo) return;

		const efetivo = periodoEfetivoDoPipeline(
			dateFrom,
			dateTo,
			typeof document === "undefined" ? null : document.cookie,
			hoje,
		);
		if (!dateFrom) setDateFrom(efetivo.de);
		if (!dateTo) setDateTo(efetivo.ate);
	}, [dateFrom, dateTo, setDateFrom, setDateTo, hoje]);
	// Campanha é LISTA e vive na URL (`?campanha=a,b,c`), como no resto do painel:
	// o recorte acompanha o link e não some ao navegar. Lista vazia = sem filtro.
	const [campanhasUrl, setCampanhas] = useQueryState("campanha", parserDeCampanha);
	const campanhas = campanhasUrl ?? SEM_CAMPANHAS;

	const filterFn = useCallback(
		(lead: Lead): boolean => {
			// Channel filter
			if (channel !== "all" && lead.conversation.channel !== channel) {
				return false;
			}

			// Text search (name or phone, case-insensitive)
			if (search) {
				const q = search.toLowerCase();
				const nameMatch = lead.name?.toLowerCase().includes(q) ?? false;
				const phoneMatch = lead.phone?.toLowerCase().includes(q) ?? false;
				if (!nameMatch && !phoneMatch) {
					return false;
				}
			}

			// Campaign filter: só quando há recorte. Lead sem origem (WhatsApp
			// orgânico, importação) não tem campanha e fica de fora do recorte —
			// diferente de "direto", que é uma chegada medida sem anúncio.
			if (campanhas.length > 0 && !campanhas.includes(lead.origem?.campanha ?? "")) {
				return false;
			}

			// Recorte por dia do NEGÓCIO. `from`/`to` são DIAS ancorados ao meio-dia
			// UTC: comparar `createdAt` direto com eles cortaria metade do dia, e o
			// velho `setHours(23,59,59)` local fechava a janela no dia anterior no
			// fuso do negócio. Quem vira janela é `inicioDoDia`/`fimDoDia`, o mesmo
			// par que as rotas usam.
			if (dateFrom) {
				const createdAt = new Date(lead.createdAt);
				if (createdAt < inicioDoDia(dateFrom)) return false;
			}
			if (dateTo) {
				const createdAt = new Date(lead.createdAt);
				if (createdAt > fimDoDia(dateTo)) return false;
			}

			return true;
		},
		[channel, search, dateFrom, dateTo, campanhas],
	);

	return {
		channel: channel as ChannelFilter,
		setChannel,
		search,
		setSearch,
		dateFrom,
		setDateFrom,
		dateTo,
		setDateTo,
		campanhas,
		setCampanhas,
		filterFn,
	};
}

export function PipelineFilters({ filters }: { filters: ReturnType<typeof useLeadFilters> }) {
	const { channel, setChannel, search, setSearch, campanhas, setCampanhas } = filters;

	// Debounced search input
	const [localSearch, setLocalSearch] = useState(search);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		setLocalSearch(search);
	}, [search]);

	const handleSearchChange = (value: string) => {
		setLocalSearch(value);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setSearch(value || null);
		}, 300);
	};

	// O período NÃO entra: ele é estado do painel, escrito pelo `<DateRangeFilter/>`
	// na URL e no cookie. Limpar os filtros da tela não pode apagar a janela
	// escolhida.
	const hasActiveFilters = channel !== "all" || search !== "" || campanhas.length > 0;

	const clearFilters = () => {
		setChannel(null);
		setSearch(null);
		setCampanhas(null);
		setLocalSearch("");
	};

	// A lista completa de campanhas do pipeline só existe nas conversas carregadas;
	// a barra oferece o recorte que veio no link (removível). Quando a fonte de
	// campanhas for ligada aqui, é este array que cresce — o componente não muda.
	const opcoesDeCampanha = useMemo(
		() => campanhas.map((campanha) => ({ valor: campanha, rotulo: campanha })),
		[campanhas],
	);

	return (
		<FiltrosDaTela
			// O período é o MESMO do resto do painel — URL + cookie, via
			// `<DateRangeFilter/>`. Antes era um par De/Até próprio, sem cookie, e a
			// janela escolhida em outra tela não chegava aqui.
			periodo={<DateRangeFilter />}
			campanhas={opcoesDeCampanha}
		>
			{/* Channel filter */}
			<Select value={channel} onValueChange={(val) => setChannel(val === "all" ? null : val)}>
				<SelectTrigger size="sm">
					<SelectValue placeholder={getChannelLabel(channel)} />
				</SelectTrigger>
				<SelectContent>
					{CHANNEL_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{/* Text search */}
			<div className="relative">
				<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
				<Input
					placeholder="Buscar nome ou telefone..."
					value={localSearch}
					onChange={(e) => handleSearchChange(e.target.value)}
					className="h-7 w-[200px] pl-8 text-sm"
				/>
			</div>

			{/* Clear filters */}
			{hasActiveFilters && (
				<Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearFilters}>
					<X className="size-3" />
					Limpar
				</Button>
			)}
		</FiltrosDaTela>
	);
}

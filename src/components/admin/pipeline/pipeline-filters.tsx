"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { CalendarIcon, Search, X } from "lucide-react";
import { parseAsIsoDate, parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Lead } from "./lead-card";

const CHANNEL_OPTIONS = [
	{ value: "all", label: "Todos" },
	{ value: "web", label: "Web" },
	{ value: "whatsapp", label: "WhatsApp" },
] as const;

type ChannelFilter = "all" | "web" | "whatsapp";

export function useLeadFilters() {
	const [channel, setChannel] = useQueryState("channel", parseAsString.withDefault("all"));
	const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
	const [dateFrom, setDateFrom] = useQueryState("from", parseAsIsoDate);
	const [dateTo, setDateTo] = useQueryState("to", parseAsIsoDate);

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

			// Date range filter on lead.createdAt
			if (dateFrom) {
				const createdAt = new Date(lead.createdAt);
				if (createdAt < dateFrom) return false;
			}
			if (dateTo) {
				const createdAt = new Date(lead.createdAt);
				// Include the entire "to" day
				const endOfDay = new Date(dateTo);
				endOfDay.setHours(23, 59, 59, 999);
				if (createdAt > endOfDay) return false;
			}

			return true;
		},
		[channel, search, dateFrom, dateTo],
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
		filterFn,
	};
}

export function PipelineFilters({ filters }: { filters: ReturnType<typeof useLeadFilters> }) {
	const { channel, setChannel, search, setSearch, dateFrom, setDateFrom, dateTo, setDateTo } =
		filters;

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

	const hasActiveFilters =
		channel !== "all" || search !== "" || dateFrom !== null || dateTo !== null;

	const clearFilters = () => {
		setChannel(null);
		setSearch(null);
		setDateFrom(null);
		setDateTo(null);
		setLocalSearch("");
	};

	return (
		<div className="flex flex-wrap items-center gap-2">
			{/* Channel filter */}
			<Select value={channel} onValueChange={(val) => setChannel(val === "all" ? null : val)}>
				<SelectTrigger size="sm">
					<SelectValue />
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

			{/* Date from */}
			<Popover>
				<PopoverTrigger
					render={<Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" />}
				>
					<CalendarIcon className="size-3.5" />
					{dateFrom ? format(dateFrom, "dd/MM/yy", { locale: ptBR }) : "De"}
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={dateFrom ?? undefined}
						onSelect={(date) => setDateFrom(date ?? null)}
						locale={ptBR}
					/>
				</PopoverContent>
			</Popover>

			{/* Date to */}
			<Popover>
				<PopoverTrigger
					render={<Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" />}
				>
					<CalendarIcon className="size-3.5" />
					{dateTo ? format(dateTo, "dd/MM/yy", { locale: ptBR }) : "Ate"}
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={dateTo ?? undefined}
						onSelect={(date) => setDateTo(date ?? null)}
						locale={ptBR}
					/>
				</PopoverContent>
			</Popover>

			{/* Clear filters */}
			{hasActiveFilters && (
				<Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearFilters}>
					<X className="size-3" />
					Limpar
				</Button>
			)}
		</div>
	);
}

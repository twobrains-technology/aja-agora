"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { CalendarIcon, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

const CHANNEL_OPTIONS = [
	{ value: "all", label: "Todos os canais" },
	{ value: "web", label: "Web" },
	{ value: "whatsapp", label: "WhatsApp" },
] as const;

const STATUS_OPTIONS = [
	{ value: "all", label: "Todos os status" },
	{ value: "active", label: "Ativa" },
	{ value: "handed_off", label: "Com atendente" },
	{ value: "closed", label: "Encerrada" },
] as const;

export type ConversationsFiltersValue = {
	channel: string;
	status: string;
	q: string;
	from: Date | null;
	to: Date | null;
};

export function ConversationsFilters({
	value,
	onChange,
}: {
	value: ConversationsFiltersValue;
	onChange: (next: Partial<ConversationsFiltersValue>) => void;
}) {
	const [localQ, setLocalQ] = useState(value.q);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		setLocalQ(value.q);
	}, [value.q]);

	const handleSearchChange = (next: string) => {
		setLocalQ(next);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			onChange({ q: next });
		}, 300);
	};

	const hasActive =
		value.channel !== "all" ||
		value.status !== "all" ||
		value.q !== "" ||
		value.from !== null ||
		value.to !== null;

	const clear = () => {
		onChange({ channel: "all", status: "all", q: "", from: null, to: null });
		setLocalQ("");
	};

	return (
		<div className="flex flex-wrap items-center gap-2">
			<div className="relative">
				<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
				<Input
					value={localQ}
					onChange={(e) => handleSearchChange(e.target.value)}
					placeholder="Buscar nome ou telefone..."
					className="pl-8 h-8 w-[260px]"
				/>
			</div>

			<Select value={value.channel} onValueChange={(v) => onChange({ channel: v ?? "all" })}>
				<SelectTrigger size="sm" className="w-[180px]">
					<SelectValue>
						{(v) => CHANNEL_OPTIONS.find((o) => o.value === v)?.label ?? "Todos os canais"}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{CHANNEL_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={value.status} onValueChange={(v) => onChange({ status: v ?? "all" })}>
				<SelectTrigger size="sm" className="w-[180px]">
					<SelectValue>
						{(v) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? "Todos os status"}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{STATUS_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Popover>
				<PopoverTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
					<CalendarIcon className="size-3.5" />
					{value.from ? format(value.from, "dd/MM/yy", { locale: ptBR }) : "De"}
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={value.from ?? undefined}
						onSelect={(d) => onChange({ from: d ?? null })}
						locale={ptBR}
					/>
				</PopoverContent>
			</Popover>

			<Popover>
				<PopoverTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
					<CalendarIcon className="size-3.5" />
					{value.to ? format(value.to, "dd/MM/yy", { locale: ptBR }) : "Até"}
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={value.to ?? undefined}
						onSelect={(d) => onChange({ to: d ?? null })}
						locale={ptBR}
					/>
				</PopoverContent>
			</Popover>

			{hasActive && (
				<Button variant="ghost" size="sm" onClick={clear}>
					<X className="size-3.5" />
					Limpar
				</Button>
			)}
		</div>
	);
}

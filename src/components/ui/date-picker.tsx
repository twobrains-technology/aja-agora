"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
	value: string | null;
	onChange: (value: string | null) => void;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
};

export function DatePicker({
	value,
	onChange,
	placeholder = "Selecionar data",
	disabled,
	className,
}: DatePickerProps) {
	const date = value ? new Date(value) : undefined;

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						disabled={disabled}
						className={cn(
							"w-full justify-start font-normal",
							!date && "text-muted-foreground",
							className,
						)}
					>
						<CalendarIcon className="size-3.5" />
						{date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : placeholder}
					</Button>
				}
			/>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={date}
					onSelect={(d) => onChange(d ? d.toISOString() : null)}
					locale={ptBR}
				/>
				{date && (
					<div className="flex justify-end border-t p-2">
						<Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
							Limpar
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

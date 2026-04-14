"use client";

import { useQueryState, parseAsIsoDate } from "nuqs";
import { subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { CalendarIcon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

const DEFAULT_DAYS = 30;

function defaultFrom() {
  return subDays(new Date(), DEFAULT_DAYS);
}

function defaultTo() {
  return new Date();
}

export function DateRangeFilter() {
  const [from, setFrom] = useQueryState(
    "from",
    parseAsIsoDate.withDefault(defaultFrom()),
  );
  const [to, setTo] = useQueryState(
    "to",
    parseAsIsoDate.withDefault(defaultTo()),
  );

  const resetToDefaults = () => {
    setFrom(null);
    setTo(null);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground hidden sm:inline">
        Periodo:
      </span>

      {/* From date picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <CalendarIcon className="size-3.5" />
            {from ? format(from, "dd/MM/yyyy", { locale: ptBR }) : "De"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={from ?? undefined}
            onSelect={(date) => setFrom(date ?? null)}
            locale={ptBR}
          />
        </PopoverContent>
      </Popover>

      <span className="text-xs text-muted-foreground">-</span>

      {/* To date picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <CalendarIcon className="size-3.5" />
            {to ? format(to, "dd/MM/yyyy", { locale: ptBR }) : "Ate"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={to ?? undefined}
            onSelect={(date) => setTo(date ?? null)}
            locale={ptBR}
          />
        </PopoverContent>
      </Popover>

      {/* Quick reset button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs gap-1"
        onClick={resetToDefaults}
        title="Ultimos 30 dias"
      >
        <RotateCcw className="size-3" />
        <span className="hidden sm:inline">30d</span>
      </Button>
    </div>
  );
}

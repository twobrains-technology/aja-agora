"use client";

import type { ComparisonTablePayload } from "@/lib/chat/types";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const formatBRL = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

export function ComparisonTable({
  payload,
}: {
  payload: ComparisonTablePayload;
}) {
  const { groups, highlightBestIndex } = payload;

  if (!groups || groups.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full rounded-lg border border-border">
      {/* Scroll hint gradient on right edge */}
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-6 bg-gradient-to-l from-background to-transparent" />
      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <Table className="min-w-[600px]">
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="sticky left-0 z-10 bg-background min-w-[140px]">
              Administradora
            </TableHead>
            <TableHead scope="col">Credito</TableHead>
            <TableHead scope="col">Parcela</TableHead>
            <TableHead scope="col">Taxa Adm</TableHead>
            <TableHead scope="col">Prazo</TableHead>
            <TableHead scope="col">Vagas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group, index) => {
            const isHighlighted = highlightBestIndex === index;
            return (
              <TableRow
                key={group.id}
                aria-selected={isHighlighted || undefined}
                className={cn(
                  isHighlighted && "bg-accent/10 border-l-4 border-l-accent",
                )}
              >
                <TableCell className="sticky left-0 z-10 bg-background font-medium">
                  <div className="flex items-center gap-2">
                    <span>{group.administradora}</span>
                    {isHighlighted && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">
                        Melhor opcao
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono">
                  {formatBRL(group.creditValue)}
                </TableCell>
                <TableCell className="font-mono font-medium">
                  {formatBRL(group.monthlyPayment)}
                </TableCell>
                <TableCell className="font-mono">
                  {formatPercent(group.adminFeePercent)}
                </TableCell>
                <TableCell className="font-mono">
                  {group.termMonths} meses
                </TableCell>
                <TableCell className="font-mono">
                  {group.availableSlots}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}

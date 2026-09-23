"use client";

import { useMemo } from "react";
import { diaDoNegocio } from "@/lib/admin/periodo";
import { KanbanBoard } from "./kanban-board";
import { PipelineFilters, useLeadFilters } from "./pipeline-filters";

export function PipelineContent() {
	const filters = useLeadFilters();
	const { dateFrom, dateTo } = filters;

	// O recorte é do SERVIDOR, então o quadro leva o período na chamada. Como
	// `useLeadFilters` publica os dias na URL (e cai em "desde o início" quando
	// não há escolha), o que o chip do cabeçalho mostra e o que a rota recorta
	// são o MESMO par — antes o chip dizia uma janela e a resposta trazia tudo.
	const periodo = useMemo(
		() => ({
			de: dateFrom ? diaDoNegocio(dateFrom) : null,
			ate: dateTo ? diaDoNegocio(dateTo) : null,
		}),
		[dateFrom, dateTo],
	);

	return (
		<>
			<PipelineFilters filters={filters} />
			<KanbanBoard filterFn={filters.filterFn} periodo={periodo} />
		</>
	);
}

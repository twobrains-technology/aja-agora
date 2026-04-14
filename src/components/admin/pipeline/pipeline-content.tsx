"use client";

import { KanbanBoard } from "./kanban-board";
import { PipelineFilters, useLeadFilters } from "./pipeline-filters";

export function PipelineContent() {
  const filters = useLeadFilters();

  return (
    <>
      <PipelineFilters filters={filters} />
      <KanbanBoard filterFn={filters.filterFn} />
    </>
  );
}

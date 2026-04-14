"use client";

import { Droppable, Draggable } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { LeadCard, type Lead } from "./lead-card";
import { cn } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  novo: "Novo",
  engajado: "Engajado",
  qualificado: "Qualificado",
  em_negociacao: "Em Negociacao",
  proposta_enviada: "Proposta Enviada",
  fechado_ganho: "Fechado Ganho",
  perdido: "Perdido",
};

export function KanbanColumn({
  stage,
  leads,
}: {
  stage: string;
  leads: Lead[];
}) {
  const label = STAGE_LABELS[stage] ?? stage;
  const isWon = stage === "fechado_ganho";
  const isLost = stage === "perdido";

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-muted/30 min-w-[260px] w-[260px] shrink-0",
        isWon && "border-green-500/50 bg-green-50/50 dark:bg-green-950/20",
        isLost && "bg-muted/50 opacity-80",
      )}
    >
      {/* Column header */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2.5 border-b",
          isWon && "border-green-500/30",
        )}
      >
        <h3
          className={cn(
            "text-sm font-semibold truncate",
            isWon && "text-green-700 dark:text-green-400",
            isLost && "text-muted-foreground",
          )}
        >
          {label}
        </h3>
        <Badge
          variant={isWon ? "default" : "secondary"}
          className={cn(
            "text-[11px] px-1.5 h-5",
            isWon && "bg-green-600 text-white",
          )}
        >
          {leads.length}
        </Badge>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={stage}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-220px)] min-h-[80px] transition-colors",
              snapshot.isDraggingOver && "bg-primary/5",
            )}
          >
            {leads.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhum lead
              </p>
            )}
            {leads.map((lead, index) => (
              <Draggable key={lead.id} draggableId={lead.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                  >
                    <LeadCard
                      lead={lead}
                      isDragging={dragSnapshot.isDragging}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

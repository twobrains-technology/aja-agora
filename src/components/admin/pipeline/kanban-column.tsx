"use client";

import { Draggable, Droppable } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type Lead, LeadCard } from "./lead-card";

const STAGE_LABELS: Record<string, string> = {
	novo: "Novo",
	engajado: "Engajado",
	qualificado: "Qualificado",
	em_negociacao: "Em Negociação",
	proposta_enviada: "Proposta Enviada",
	na_administradora: "Na Administradora",
	aguardando_pagamento: "Aguardando Pagamento",
	fechado_ganho: "Fechado Ganho",
	perdido: "Perdido",
};

const STAGE_DOT_COLORS: Record<string, string> = {
	novo: "bg-blue-500",
	engajado: "bg-amber-500",
	qualificado: "bg-violet-500",
	em_negociacao: "bg-orange-500",
	proposta_enviada: "bg-cyan-500",
	na_administradora: "bg-indigo-500",
	aguardando_pagamento: "bg-teal-500",
	fechado_ganho: "bg-emerald-500",
	perdido: "bg-gray-400",
};

export function KanbanColumn({
	stage,
	leads,
	onLeadClick,
}: {
	stage: string;
	leads: Lead[];
	onLeadClick?: (leadId: string) => void;
}) {
	const label = STAGE_LABELS[stage] ?? stage;
	const isWon = stage === "fechado_ganho";
	const isLost = stage === "perdido";

	const dotColor = STAGE_DOT_COLORS[stage] ?? "bg-gray-400";

	return (
		<div
			className={cn(
				"flex flex-col rounded-lg border bg-card shadow-sm min-w-[260px] w-[260px] shrink-0",
				isWon && "border-emerald-500/50",
				isLost && "opacity-75",
			)}
		>
			{/* Column header */}
			<div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b">
				<div className="flex items-center gap-2 min-w-0">
					<span className={cn("size-2 rounded-full shrink-0", dotColor)} />
					<h3 className={cn("text-sm font-semibold truncate", isLost && "text-muted-foreground")}>
						{label}
					</h3>
				</div>
				<Badge variant="secondary" className="text-[11px] px-1.5 h-5 tabular-nums">
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
							<p className="text-xs text-muted-foreground text-center py-4">Nenhum lead</p>
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
											onLeadClick={onLeadClick}
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

"use client";

import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGE_ORDER } from "@/lib/admin/lead-stages";
import { ContactDetailPanel } from "./contact-detail-panel";
import { KanbanColumn } from "./kanban-column";
import type { Lead } from "./lead-card";
import { LeadDetailPanel } from "./lead-detail-panel";

type Columns = Record<string, Lead[]>;

const POLL_INTERVAL = 30_000;

export function KanbanBoard({ filterFn }: { filterFn?: (lead: Lead) => boolean }) {
	const [columns, setColumns] = useState<Columns>(() => {
		const init: Columns = {};
		for (const stage of STAGE_ORDER) {
			init[stage] = [];
		}
		return init;
	});
	const [loading, setLoading] = useState(true);
	const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
	const columnsRef = useRef(columns);
	columnsRef.current = columns;

	const selectedLead = useMemo(() => {
		if (!selectedLeadId) return null;
		for (const stage of STAGE_ORDER) {
			const found = (columns[stage] ?? []).find((l) => l.id === selectedLeadId);
			if (found) return found;
		}
		return null;
	}, [selectedLeadId, columns]);

	const fetchLeads = useCallback(async () => {
		try {
			const res = await fetch("/api/admin/leads");
			if (!res.ok) return;
			const data = await res.json();
			setColumns(data.leads);
		} catch {
			// Silently fail on poll errors
		}
	}, []);

	// Initial fetch
	useEffect(() => {
		fetchLeads().finally(() => setLoading(false));
	}, [fetchLeads]);

	// Polling
	useEffect(() => {
		const interval = setInterval(fetchLeads, POLL_INTERVAL);
		return () => clearInterval(interval);
	}, [fetchLeads]);

	const onDragEnd = useCallback(async (result: DropResult) => {
		const { source, destination, draggableId } = result;

		if (!destination) return;
		if (source.droppableId === destination.droppableId && source.index === destination.index) {
			return;
		}

		// Save previous state for rollback
		const previous = structuredClone(columnsRef.current);

		// Optimistic update
		setColumns((prev) => {
			const next = structuredClone(prev);
			const sourceLeads = next[source.droppableId];
			const [moved] = sourceLeads.splice(source.index, 1);
			moved.stage = destination.droppableId;
			next[destination.droppableId].splice(destination.index, 0, moved);
			return next;
		});

		// Persist to API
		try {
			const res = await fetch(`/api/admin/leads/${draggableId}/stage`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ stage: destination.droppableId }),
			});
			if (!res.ok) {
				setColumns(previous);
				window.alert("Erro ao mover lead. Tente novamente.");
			}
		} catch {
			setColumns(previous);
			window.alert("Erro de conexão. Tente novamente.");
		}
	}, []);

	if (loading) {
		return (
			<div className="flex gap-4 overflow-x-auto pb-4">
				{STAGE_ORDER.map((stage) => (
					<div
						key={stage}
						className="min-w-[260px] w-[260px] shrink-0 rounded-lg border bg-muted/30 p-3 space-y-3"
					>
						<Skeleton className="h-5 w-24" />
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-20 w-full" />
					</div>
				))}
			</div>
		);
	}

	return (
		<>
			<DragDropContext onDragEnd={onDragEnd}>
				<ScrollArea className="w-full">
					<div className="flex gap-3 pb-4 min-w-max">
						{STAGE_ORDER.map((stage) => {
							const leads = columns[stage] ?? [];
							const filtered = filterFn ? leads.filter(filterFn) : leads;
							return (
								<KanbanColumn
									key={stage}
									stage={stage}
									leads={filtered}
									onLeadClick={setSelectedLeadId}
								/>
							);
						})}
					</div>
					<ScrollBar orientation="horizontal" />
				</ScrollArea>
			</DragDropContext>

			{/* FIX-45: card com contato resolvido abre a visão consolidada; lead
			    anônimo (sem contactId) mantém o detalhe de conversa única. */}
			{selectedLead?.contactId ? (
				<ContactDetailPanel
					contactId={selectedLead.contactId}
					leadId={selectedLead?.id}
					leadName={selectedLead?.name}
					conversationId={selectedLead?.conversationId}
					activeHandoff={selectedLead?.activeHandoff ?? null}
					onMesaChanged={fetchLeads}
					open={!!selectedLeadId}
					onClose={() => setSelectedLeadId(null)}
				/>
			) : (
				<LeadDetailPanel
					lead={selectedLead}
					activeHandoff={selectedLead?.activeHandoff ?? null}
					onMesaChanged={fetchLeads}
					open={!!selectedLeadId}
					onClose={() => setSelectedLeadId(null)}
				/>
			)}
		</>
	);
}

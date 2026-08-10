"use client";

import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGE_ORDER } from "@/lib/admin/lead-stages";
import { ContactDetailPanel } from "./contact-detail-panel";
import { KanbanColumn } from "./kanban-column";
import type { Lead } from "./lead-card";
import { LeadDetailPanel } from "./lead-detail-panel";
import { mensagemDeFalhaAoMover } from "./mover-lead-feedback";

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
	// Recusa do servidor ao mover um card. Era `window.alert`: modal, bloqueava a
	// aba e ainda dizia "tente novamente" pra uma regra que nunca deixa passar.
	const [aviso, setAviso] = useState<string | null>(null);
	// Quais colunas desenhar. Vem do SERVIDOR (`stages` da resposta), não de
	// STAGE_ORDER: a mesa externa recebe só o pedaço do funil que opera, e é a
	// política do servidor que manda. STAGE_ORDER fica como estado inicial até a
	// primeira resposta chegar.
	const [stages, setStages] = useState<readonly string[]>(STAGE_ORDER);
	const columnsRef = useRef(columns);
	columnsRef.current = columns;

	const selectedLead = useMemo(() => {
		if (!selectedLeadId) return null;
		for (const stage of stages) {
			const found = (columns[stage] ?? []).find((l) => l.id === selectedLeadId);
			if (found) return found;
		}
		return null;
	}, [selectedLeadId, columns, stages]);

	const fetchLeads = useCallback(async () => {
		try {
			const res = await fetch("/api/admin/leads");
			if (!res.ok) return;
			const data = await res.json();
			setColumns(data.leads);
			if (Array.isArray(data.stages) && data.stages.length > 0) setStages(data.stages);
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

	/**
	 * Grava o movimento e desfaz se o servidor recusar.
	 *
	 * Uma função só para os DOIS caminhos de mover card — arrastar e o botão de
	 * avanço. Fossem dois, o tratamento de recusa (rollback + aviso) fatalmente
	 * divergiria, e o botão nasceria sem a lição que o arrasto já aprendeu.
	 */
	const persistirMovimento = useCallback(
		async (leadId: string, destino: string, previous: Columns) => {
			try {
				const res = await fetch(`/api/admin/leads/${leadId}/stage`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ stage: destino }),
				});
				if (!res.ok) {
					setColumns(previous);
					// O corpo carrega a raia REAL no 409 de regressão — sem ele o aviso não
					// consegue dizer onde o card ficou.
					const body = await res.json().catch(() => null);
					setAviso(mensagemDeFalhaAoMover(res.status, body));
				}
			} catch {
				setColumns(previous);
				setAviso(mensagemDeFalhaAoMover(null, null));
			}
		},
		[],
	);

	const onDragEnd = useCallback(
		async (result: DropResult) => {
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

			await persistirMovimento(draggableId, destination.droppableId, previous);
		},
		[persistirMovimento],
	);

	/** Avanço pelo botão do card — mesmo efeito do arrasto, sem precisar arrastar. */
	const onAvancar = useCallback(
		async (leadId: string, destino: string) => {
			const previous = structuredClone(columnsRef.current);

			setColumns((prev) => {
				const next = structuredClone(prev);
				for (const raia of Object.keys(next)) {
					const i = next[raia].findIndex((l) => l.id === leadId);
					if (i === -1) continue;
					const [movido] = next[raia].splice(i, 1);
					movido.stage = destino;
					if (!next[destino]) next[destino] = [];
					next[destino].unshift(movido);
					break;
				}
				return next;
			});

			await persistirMovimento(leadId, destino, previous);
		},
		[persistirMovimento],
	);

	// O aviso se apaga sozinho: ninguém deve precisar clicar num alerta pra voltar
	// a trabalhar. O botão de fechar existe pra quem quiser tirar antes.
	useEffect(() => {
		if (!aviso) return;
		const t = setTimeout(() => setAviso(null), 9000);
		return () => clearTimeout(t);
	}, [aviso]);

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
			{/* Ícone + texto, nunca só cor: o aviso tem que se ler sem depender de
			    distinguir matiz. `role="alert"` faz o leitor de tela anunciar. */}
			{aviso && (
				<div
					role="alert"
					className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
				>
					<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
					<p className="flex-1">{aviso}</p>
					<button
						type="button"
						onClick={() => setAviso(null)}
						aria-label="Fechar aviso"
						className="shrink-0 rounded p-0.5 hover:bg-amber-500/20"
					>
						<X className="size-4" aria-hidden />
					</button>
				</div>
			)}

			<DragDropContext onDragEnd={onDragEnd}>
				<ScrollArea className="w-full">
					{/* `items-start`: sem isto o flex row estica TODA coluna até a altura
					    da mais alta — coluna vazia virava 743px de espaço morto. */}
					<div className="flex items-start gap-3 pb-4 min-w-max">
						{stages.map((stage) => {
							const leads = columns[stage] ?? [];
							const filtered = filterFn ? leads.filter(filterFn) : leads;
							return (
								<KanbanColumn
									key={stage}
									stage={stage}
									leads={filtered}
									onLeadClick={setSelectedLeadId}
									raiasVisiveis={stages}
									onAvancar={onAvancar}
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

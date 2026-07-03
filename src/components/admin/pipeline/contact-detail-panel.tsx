"use client";

// FIX-45 — visão consolidada do CONTATO. Substitui o lead-detail (uma conversa)
// pela visão de tudo que o cliente fez: timeline unificada web+WhatsApp, propostas
// e histórico de movimentação no funil. Consome GET /api/admin/contacts/[id].

import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Globe, Headset, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientChatBox } from "./client-chat-box";
import type { LeadActiveHandoff } from "./lead-card";
import { MesaResponsavel } from "./mesa-responsavel";
import { MesaTransbordoDialog } from "./mesa-transbordo-dialog";

const STAGE_LABELS: Record<string, string> = {
	novo: "Novo",
	engajado: "Engajado",
	qualificado: "Qualificado",
	em_negociacao: "Em Negociação",
	proposta_enviada: "Proposta Enviada",
	na_administradora: "Na Administradora",
	em_atendimento: "Em Atendimento",
	aguardando_pagamento: "Aguardando Pagamento",
	fechado_ganho: "Fechado Ganho",
	perdido: "Perdido",
};

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
	simulacao: "Simulação",
	documentos: "Aguardando documentos",
	proposta_enviada: "Proposta enviada",
	em_assinatura: "Em assinatura",
	assinada: "Assinada",
	recusada: "Recusada",
};

function formatCurrency(value: string | null): string {
	if (!value) return "—";
	const num = Number.parseFloat(value);
	if (!Number.isFinite(num)) return value;
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(num);
}

function getProposalStatusLabel(status: string | null): string {
	if (!status) return "—";
	return PROPOSAL_STATUS_LABELS[status] || status;
}

interface TimelineMsg {
	id: string;
	conversationId: string;
	channel: "web" | "whatsapp";
	conversationStatus: string;
	role: string;
	content: string;
	createdAt: string;
}
interface Proposal {
	id: string;
	proposalId: string;
	administradora: string | null;
	creditValue: string | null;
	monthlyPayment: string | null;
	proposalStatus: string | null;
	consortiumProposalLink: string | null;
}
interface StageEvent {
	id: string;
	fromStage: string | null;
	toStage: string;
	actorType: string;
	createdAt: string;
}
interface ContactDetail {
	contact: {
		id: string;
		name: string | null;
		phone: string | null;
		cpf: string | null;
		email: string | null;
	};
	channels: ("web" | "whatsapp")[];
	currentStage: string | null;
	conversationCount: number;
	currentProposalId: string | null;
	activeConversationId: string | null;
	timeline: TimelineMsg[];
	proposals: Proposal[];
	stageHistory: StageEvent[];
}

function ChannelBadge({ channel }: { channel: "web" | "whatsapp" }) {
	return (
		<Badge variant="secondary" className="text-[10px] px-1.5 h-5">
			{channel === "whatsapp" ? (
				<Smartphone className="size-3 text-green-600" />
			) : (
				<Globe className="size-3 text-blue-600" />
			)}
			<span className="ml-0.5">{channel === "whatsapp" ? "WA" : "Web"}</span>
		</Badge>
	);
}

export function ContactDetailPanel({
	contactId,
	open,
	onClose,
	// FIX-atendimento: o card selecionado (kanban-board) fornece o id do lead e da
	// conversa — sem eles a visão consolidada não consegue transbordar nem enviar
	// mensagem. leadId → MesaTransbordoDialog; conversationId → rota de mensagem.
	leadId,
	leadName,
	conversationId,
	// Responsável da mesa (spec 2026-07-03) — vem do card selecionado (leads API). Quando existe,
	// a aba Atendimento mostra o bloco de gestão (reatribuir/encerrar) no lugar do botão transbordar.
	activeHandoff,
	onMesaChanged,
}: {
	contactId: string | null;
	open: boolean;
	onClose: () => void;
	leadId?: string | null;
	leadName?: string | null;
	conversationId?: string | null;
	activeHandoff?: LeadActiveHandoff | null;
	onMesaChanged?: () => void;
}) {
	const [detail, setDetail] = useState<ContactDetail | null>(null);
	const [loading, setLoading] = useState(false);
	const [transbordoOpen, setTransbordoOpen] = useState(false);

	useEffect(() => {
		if (!contactId || !open) return;
		setLoading(true);
		setDetail(null);
		fetch(`/api/admin/contacts/${contactId}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => setDetail(d))
			.catch(() => setDetail(null))
			.finally(() => setLoading(false));
	}, [contactId, open]);

	// Reset da ação de transbordo ao trocar de contato (o ClientChatBox reseta sozinho).
	// biome-ignore lint/correctness/useExhaustiveDependencies: contactId é o gatilho do reset
	useEffect(() => {
		setTransbordoOpen(false);
	}, [contactId]);

	const c = detail?.contact;
	const title = c?.name || c?.phone || "Contato";

	return (
		<Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<SheetContent
				side="right"
				className="w-full sm:w-[540px] sm:max-w-[540px] flex flex-col p-0"
				data-testid="contact-detail-panel"
			>
				<SheetHeader className="border-b px-4 py-3">
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>Tudo que o cliente fez — web e WhatsApp</SheetDescription>
					{detail && (
						<div className="flex flex-wrap items-center gap-2 mt-1">
							{detail.currentStage && (
								<Badge variant="secondary" className="text-xs">
									{STAGE_LABELS[detail.currentStage] ?? detail.currentStage}
								</Badge>
							)}
							{detail.channels.map((ch) => (
								<ChannelBadge key={ch} channel={ch} />
							))}
							{c?.cpf && (
								<span className="text-xs text-muted-foreground" data-testid="contact-cpf">
									CPF {c.cpf}
								</span>
							)}
							{c?.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
						</div>
					)}
				</SheetHeader>

				<Tabs defaultValue="timeline" className="flex-1 flex flex-col min-h-0">
					<TabsList className="mx-4 mt-2">
						<TabsTrigger value="timeline">Timeline</TabsTrigger>
						<TabsTrigger value="propostas">Propostas</TabsTrigger>
						<TabsTrigger value="funil">Funil</TabsTrigger>
						<TabsTrigger value="atendimento">Atendimento</TabsTrigger>
					</TabsList>

					<TabsContent value="timeline" className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
						{loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
						{detail?.timeline.length === 0 && (
							<p className="text-sm text-muted-foreground">Sem mensagens.</p>
						)}
						{detail?.timeline.map((msg) => (
							<div key={msg.id} className="text-sm" data-testid="timeline-message">
								<div className="flex items-center gap-2 mb-0.5">
									<ChannelBadge channel={msg.channel} />
									{/* FIX-50: selo só nas mensagens da conversa que ainda está rodando. */}
									{detail?.activeConversationId === msg.conversationId && (
										<Badge
											variant="outline"
											className="text-[10px] h-5 px-1.5 border-green-600/40 text-green-700"
											data-testid="conversation-active-badge"
										>
											Em andamento
										</Badge>
									)}
									<span className="text-[11px] text-muted-foreground">
										{msg.role} · {format(new Date(msg.createdAt), "dd/MM HH:mm", { locale: ptBR })}
									</span>
								</div>
								<p className="whitespace-pre-wrap">{msg.content}</p>
							</div>
						))}
					</TabsContent>

					<TabsContent value="propostas" className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
						{detail?.proposals.length === 0 && (
							<p className="text-sm text-muted-foreground">Nenhuma proposta.</p>
						)}
						{detail?.proposals.map((p) => {
							// FIX-50: a vigente sobe em destaque; as superadas ficam esmaecidas.
							const isCurrent = detail?.currentProposalId === p.id;
							return (
								<div
									key={p.id}
									className={`rounded-lg border p-3 text-sm ${
										isCurrent ? "border-primary/40 bg-primary/[.04]" : "opacity-60"
									}`}
									data-testid={`proposal-item-${p.id}`}
									data-current={isCurrent ? "true" : undefined}
								>
									<div className="flex items-center gap-2">
										<span className="font-medium">{p.administradora ?? "Proposta"}</span>
										{isCurrent && (
											<Badge
												className="text-[10px] h-5 px-1.5"
												data-testid="proposal-current-badge"
											>
												Atual
											</Badge>
										)}
									</div>
									<div className="text-xs text-muted-foreground">
										Crédito {formatCurrency(p.creditValue)} · Parcela{" "}
										{formatCurrency(p.monthlyPayment)} · Status{" "}
										{getProposalStatusLabel(p.proposalStatus)}
									</div>
									{p.consortiumProposalLink && (
										<a
											href={p.consortiumProposalLink}
											target="_blank"
											rel="noreferrer"
											className="text-xs text-blue-600 underline"
										>
											Abrir PDF da proposta
										</a>
									)}
								</div>
							);
						})}
					</TabsContent>

					<TabsContent value="funil" className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
						{detail?.stageHistory.length === 0 && (
							<p className="text-sm text-muted-foreground">Sem movimentação registrada.</p>
						)}
						{detail?.stageHistory.map((e) => (
							<div key={e.id} className="text-xs flex items-center gap-2" data-testid="stage-event">
								<span className="text-muted-foreground">
									{format(new Date(e.createdAt), "dd/MM HH:mm", { locale: ptBR })}
								</span>
								<span>
									{e.fromStage ? `${STAGE_LABELS[e.fromStage] ?? e.fromStage} → ` : ""}
									<strong>{STAGE_LABELS[e.toStage] ?? e.toStage}</strong>
								</span>
								<Badge variant="outline" className="text-[10px] h-4 px-1">
									{e.actorType}
								</Badge>
							</div>
						))}
					</TabsContent>

					{/* Atendimento: transbordo manual (broadcast à mesa) + chat do operador
					    com o cliente. Portado do LeadDetailPanel (FIX-64/FIX-87) pra visão
					    consolidada — antes essas ações só existiam pro lead anônimo. */}
					<TabsContent value="atendimento" className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
						{/* Já transbordado → gestão do responsável (reatribuir/encerrar). Senão →
						    ação de transbordar. Spec 2026-07-03. */}
						{activeHandoff ? (
							<MesaResponsavel activeHandoff={activeHandoff} onChanged={onMesaChanged} />
						) : (
							<div className="space-y-2">
								<h4 className="text-sm font-semibold">Transbordo para a mesa</h4>
								<p className="text-xs text-muted-foreground">
									Envia o caso a todos os atendentes de mesa. O primeiro que tocar em "Vou atender"
									no WhatsApp assume o cliente e formaliza o contrato na administradora.
								</p>
								<Button
									variant="outline"
									size="sm"
									className="w-fit"
									onClick={() => setTransbordoOpen(true)}
									disabled={!leadId}
								>
									<Headset className="size-3.5" />
									Transbordar para a mesa
								</Button>
							</div>
						)}

						{/* FIX-87 + templates HSM: chat do operador → WhatsApp. Compartilhado com o
						    LeadDetailPanel via ClientChatBox; janela fechada oferece envio de template. */}
						<div className="border-t pt-4">
							<ClientChatBox conversationId={conversationId} onSent={onClose} />
						</div>
					</TabsContent>
				</Tabs>

				{leadId && (
					<MesaTransbordoDialog
						leadId={leadId}
						leadName={leadName}
						open={transbordoOpen}
						onOpenChange={setTransbordoOpen}
					/>
				)}
			</SheetContent>
		</Sheet>
	);
}

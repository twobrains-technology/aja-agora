"use client";

// FIX-45 — visão consolidada do CONTATO. Substitui o lead-detail (uma conversa)
// pela visão de tudo que o cliente fez: timeline unificada web+WhatsApp, propostas
// e histórico de movimentação no funil. Consome GET /api/admin/contacts/[id].

import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Globe, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STAGE_LABELS: Record<string, string> = {
	novo: "Novo",
	engajado: "Engajado",
	qualificado: "Qualificado",
	em_negociacao: "Em Negociacao",
	proposta_enviada: "Proposta Enviada",
	na_administradora: "Na Administradora",
	aguardando_pagamento: "Aguardando Pagamento",
	fechado_ganho: "Fechado Ganho",
	perdido: "Perdido",
};

interface TimelineMsg {
	id: string;
	channel: "web" | "whatsapp";
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
}: {
	contactId: string | null;
	open: boolean;
	onClose: () => void;
}) {
	const [detail, setDetail] = useState<ContactDetail | null>(null);
	const [loading, setLoading] = useState(false);

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
						{detail?.proposals.map((p) => (
							<div key={p.id} className="rounded-lg border p-3 text-sm" data-testid="proposal-item">
								<div className="font-medium">{p.administradora ?? "Proposta"}</div>
								<div className="text-xs text-muted-foreground">
									Crédito {p.creditValue ?? "—"} · Parcela {p.monthlyPayment ?? "—"} · Status{" "}
									{p.proposalStatus ?? "—"}
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
						))}
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
				</Tabs>
			</SheetContent>
		</Sheet>
	);
}

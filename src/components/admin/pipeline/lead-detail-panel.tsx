"use client";

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
import { ClientDocumentsTab } from "./client-documents-tab";
import { ConversationTimeline } from "./conversation-timeline";
import { InsightCards } from "./insight-cards";
import type { Lead } from "./lead-card";
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

function getDisplayName(lead: Lead): string {
	if (lead.name) return lead.name;
	if (lead.phone) return lead.phone;
	return "Lead sem nome";
}

export function LeadDetailPanel({
	lead,
	open,
	onClose,
}: {
	lead: Lead | null;
	open: boolean;
	onClose: () => void;
}) {
	const [activeTab, setActiveTab] = useState("conversa");
	const [insightsLoaded, setInsightsLoaded] = useState(false);
	const [transbordoOpen, setTransbordoOpen] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: lead?.id change is the trigger to reset
	useEffect(() => {
		setInsightsLoaded(false);
		setActiveTab("conversa");
		setTransbordoOpen(false);
	}, [lead?.id]);

	return (
		<Sheet
			open={open}
			onOpenChange={(isOpen) => {
				if (!isOpen) onClose();
			}}
		>
			<SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-[480px] flex flex-col p-0">
				{lead && (
					<>
						<SheetHeader className="border-b px-4 py-3">
							<SheetTitle>{getDisplayName(lead)}</SheetTitle>
							<SheetDescription>Histórico de conversa e análise do lead</SheetDescription>
							<div className="flex items-center gap-2 mt-1">
								<Badge variant="secondary" className="text-xs">
									{STAGE_LABELS[lead.stage] ?? lead.stage}
								</Badge>
								{lead.conversation.channel === "whatsapp" ? (
									<Smartphone className="size-3.5 text-green-600" />
								) : (
									<Globe className="size-3.5 text-blue-600" />
								)}
								<span className="text-xs text-muted-foreground">
									{format(new Date(lead.createdAt), "dd/MM/yyyy", {
										locale: ptBR,
									})}
								</span>
							</div>
							<Button
								variant="outline"
								size="sm"
								className="mt-2 w-fit"
								onClick={() => setTransbordoOpen(true)}
							>
								<Headset className="size-3.5" />
								Transbordar para a mesa
							</Button>
						</SheetHeader>

						<Tabs
							value={activeTab}
							onValueChange={setActiveTab}
							className="flex-1 flex flex-col min-h-0"
						>
							<TabsList className="mx-4 mt-2">
								<TabsTrigger value="conversa">Conversa</TabsTrigger>
								<TabsTrigger value="insights">Insights</TabsTrigger>
								<TabsTrigger value="documentos">Documentos</TabsTrigger>
							</TabsList>
							<TabsContent value="conversa" className="flex-1 min-h-0">
								<ConversationTimeline endpoint={`/api/admin/leads/${lead.id}/conversation`} />
							</TabsContent>
							<TabsContent value="insights" className="p-4">
								{insightsLoaded ? (
									<InsightCards source="lead" id={lead.id} />
								) : (
									<div className="flex items-center justify-center py-8">
										<p className="text-sm text-muted-foreground">
											Selecione esta aba para gerar insights
										</p>
									</div>
								)}
							</TabsContent>
							<TabsContent value="documentos" className="flex-1 min-h-0 overflow-y-auto">
								<ClientDocumentsTab leadId={lead.id} />
							</TabsContent>
						</Tabs>

						{/* FIX-87 + templates HSM: chat do operador → WhatsApp (janela fechada oferece
						    template). Compartilhado com o ContactDetailPanel via ClientChatBox. */}
						<div className="border-t p-4 bg-muted/30">
							<ClientChatBox conversationId={lead.conversationId} onSent={onClose} />
						</div>

						<MesaTransbordoDialog
							leadId={lead.id}
							leadName={lead.name}
							open={transbordoOpen}
							onOpenChange={setTransbordoOpen}
						/>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}

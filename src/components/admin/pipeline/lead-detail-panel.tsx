"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Globe, Headset, Send, Smartphone } from "lucide-react";
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
	const [message, setMessage] = useState("");
	const [sending, setSending] = useState(false);
	const [windowError, setWindowError] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: lead?.id change is the trigger to reset
	useEffect(() => {
		setInsightsLoaded(false);
		setActiveTab("conversa");
		setTransbordoOpen(false);
		setMessage("");
		setSending(false);
		setWindowError(null);
	}, [lead?.id]);

	const handleSendMessage = async (text: string) => {
		if (!lead) return;
		setSending(true);
		setWindowError(null);

		try {
			// O id da CONVERSA (≠ id do lead) é a chave que a rota usa pra resolver a
			// janela de 24h e persistir a mensagem. Usar lead.id aqui batia na conversa errada.
			const endpoint = `/api/admin/conversations/${lead.conversationId}/message`;

			const res = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ conversationId: lead.conversationId, text }),
			});

			const data = await res.json();

			if (!res.ok) {
				// A rota devolve { error: "<código>", message: "<motivo legível>" } — mostrar
				// `message` (não `error.message`, que não existe e caía sempre no fallback).
				throw new Error(data.message || "Falha ao enviar mensagem");
			}

			// Alert visual simples
			alert(`Mensagem enviada com sucesso!\nId: ${data.messageId}`);

			setMessage("");
			onClose();
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
			setWindowError(errorMsg);
			alert(`Erro ao enviar mensagem:\n${errorMsg}`);
		} finally {
			setSending(false);
		}
	};

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

						{/* FIX-87: Chat do operador no Kanban → WhatsApp oficial */}
						<div className="border-t p-4 bg-muted/30">
							<h4 className="text-sm font-semibold mb-3">Chat com o cliente</h4>

							{/* Erro da API */}
							{windowError && (
								<div className="mb-3 p-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
									{windowError}
								</div>
							)}

							{/* Input de chat */}
							<div className="space-y-2">
								<textarea
									placeholder="Digite sua mensagem para o cliente..."
									value={message}
									onChange={(e) => setMessage(e.target.value)}
									rows={3}
									className="w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
									disabled={sending}
								/>
								<div className="flex justify-end">
									<Button
										size="sm"
										onClick={() => handleSendMessage(message)}
										disabled={!message.trim() || sending}
									>
										<Send className="size-4 mr-2" />
										{sending ? "Enviando..." : "Enviar"}
									</Button>
								</div>
							</div>
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

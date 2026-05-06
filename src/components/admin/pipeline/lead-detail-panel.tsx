"use client";

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
import { ConversationTimeline } from "./conversation-timeline";
import { InsightCards } from "./insight-cards";
import type { Lead } from "./lead-card";

const STAGE_LABELS: Record<string, string> = {
	novo: "Novo",
	engajado: "Engajado",
	qualificado: "Qualificado",
	em_negociacao: "Em Negociacao",
	proposta_enviada: "Proposta Enviada",
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

	// Reset insights state when lead changes
	useEffect(() => {
		setInsightsLoaded(false);
		setActiveTab("conversa");
	}, [lead?.id]);

	// Track when insights tab is first activated
	useEffect(() => {
		if (activeTab === "insights") setInsightsLoaded(true);
	}, [activeTab]);

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
							<SheetDescription>Historico de conversa e analise do lead</SheetDescription>
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
						</SheetHeader>

						<Tabs
							value={activeTab}
							onValueChange={setActiveTab}
							className="flex-1 flex flex-col min-h-0"
						>
							<TabsList className="mx-4 mt-2">
								<TabsTrigger value="conversa">Conversa</TabsTrigger>
								<TabsTrigger value="insights">Insights</TabsTrigger>
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
						</Tabs>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}

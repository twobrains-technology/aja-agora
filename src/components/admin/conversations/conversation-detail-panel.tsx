"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Globe, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { ConversationTimeline } from "@/components/admin/pipeline/conversation-timeline";
import { InsightCards } from "@/components/admin/pipeline/insight-cards";
import { Badge } from "@/components/ui/badge";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Detail = {
	conversation: {
		id: string;
		contactName: string | null;
		waId: string | null;
		channel: "web" | "whatsapp";
		status: "active" | "handed_off" | "closed";
		currentCategory: string | null;
		handedOffUser: { id: string; name: string | null; phone: string | null } | null;
		createdAt: string;
		updatedAt: string;
	};
	messages: Array<{
		id: string;
		role: "user" | "assistant" | "system";
		content: string;
		createdAt: string;
		artifacts: Array<{ id: string; type: string; payload: Record<string, unknown> }>;
	}>;
	lead: {
		id: string;
		name: string | null;
		phone: string | null;
		email: string | null;
		stage: string;
	} | null;
};

const STATUS_LABELS: Record<Detail["conversation"]["status"], string> = {
	active: "Ativa",
	handed_off: "Com atendente",
	closed: "Encerrada",
};

const CATEGORY_LABELS: Record<string, string> = {
	imovel: "Imóvel",
	auto: "Automóvel",
	servicos: "Serviços",
};

const STATUS_VARIANTS: Record<
	Detail["conversation"]["status"],
	"default" | "secondary" | "outline"
> = {
	active: "default",
	handed_off: "secondary",
	closed: "outline",
};

export function ConversationDetailPanel({
	conversationId,
	open,
	onClose,
}: {
	conversationId: string | null;
	open: boolean;
	onClose: () => void;
}) {
	const [data, setData] = useState<Detail | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState("conversa");
	const [insightsLoaded, setInsightsLoaded] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: conversationId change is the trigger to reset
	useEffect(() => {
		setActiveTab("conversa");
		setInsightsLoaded(false);
	}, [conversationId]);

	useEffect(() => {
		if (activeTab === "insights") setInsightsLoaded(true);
	}, [activeTab]);

	useEffect(() => {
		if (!conversationId || !open) {
			setData(null);
			setError(null);
			return;
		}
		let cancelled = false;
		setData(null);
		setError(null);
		(async () => {
			try {
				const res = await fetch(`/api/admin/conversations/${conversationId}`, {
					cache: "no-store",
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { error?: string };
					throw new Error(body.error ?? `HTTP ${res.status}`);
				}
				const json = (await res.json()) as Detail;
				if (!cancelled) setData(json);
			} catch (err) {
				if (!cancelled) setError(err instanceof Error ? err.message : String(err));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [conversationId, open]);

	const conv = data?.conversation;
	const display = conv?.contactName ?? conv?.waId ?? "Conversa";

	return (
		<Sheet
			open={open}
			onOpenChange={(isOpen) => {
				if (!isOpen) onClose();
			}}
		>
			<SheetContent side="right" className="w-full sm:w-[520px] sm:max-w-[520px] flex flex-col p-0">
				<SheetHeader className="border-b px-4 py-3">
					<SheetTitle>{display}</SheetTitle>
					<SheetDescription>Histórico completo da conversa</SheetDescription>
					{conv && (
						<div className="flex flex-wrap items-center gap-2 mt-1">
							<Badge variant={STATUS_VARIANTS[conv.status]} className="text-xs">
								{STATUS_LABELS[conv.status]}
							</Badge>
							{conv.channel === "whatsapp" ? (
								<Smartphone className="size-3.5 text-green-600" />
							) : (
								<Globe className="size-3.5 text-blue-600" />
							)}
							{conv.currentCategory && (
								<span className="text-xs text-muted-foreground">
									{CATEGORY_LABELS[conv.currentCategory] ?? conv.currentCategory}
								</span>
							)}
							{conv.handedOffUser?.name && (
								<span className="text-xs text-muted-foreground">
									• Atendente: {conv.handedOffUser.name}
								</span>
							)}
							<span className="text-xs text-muted-foreground">
								•{" "}
								{format(new Date(conv.updatedAt), "dd/MM/yyyy HH:mm", {
									locale: ptBR,
								})}
							</span>
						</div>
					)}
				</SheetHeader>

				<div className="flex-1 min-h-0 overflow-hidden flex flex-col">
					{error && (
						<div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
							{error}
						</div>
					)}
					{!data && !error && (
						<div className="flex flex-col gap-3 p-4">
							<Skeleton className="h-16 w-3/4" />
							<Skeleton className="h-12 w-2/3 self-end" />
							<Skeleton className="h-20 w-3/4" />
						</div>
					)}
					{data && (
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
								<ConversationTimeline
									initialMessages={data.messages.map((m) => ({
										id: m.id,
										role: m.role,
										content: m.content,
										createdAt: m.createdAt,
										artifacts: m.artifacts,
									}))}
								/>
							</TabsContent>
							<TabsContent value="insights" className="p-4 overflow-y-auto">
								{insightsLoaded ? (
									<InsightCards
										source="conversation"
										id={data.conversation.id}
										messageCount={data.messages.length}
									/>
								) : (
									<div className="flex items-center justify-center py-8">
										<p className="text-sm text-muted-foreground">
											Selecione esta aba para gerar insights
										</p>
									</div>
								)}
							</TabsContent>
						</Tabs>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

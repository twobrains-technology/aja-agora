"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { List, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { WhatsAppView } from "@/components/admin/conversa/whatsapp-view";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ArtifactPreview } from "./artifact-preview";

interface MessageArtifact {
	id: string;
	type: string;
	payload: Record<string, unknown>;
}

interface Message {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	createdAt: string;
	artifacts: MessageArtifact[];
	/** Presente só quando a mensagem tem anexo (colunas nullable em `messages`). */
	mediaType?: string | null;
	mediaFilename?: string | null;
}

type Props =
	| { endpoint: string; initialMessages?: undefined }
	| { initialMessages: Message[]; endpoint?: undefined };

export function ConversationTimeline(props: Props) {
	const { endpoint, initialMessages } = props;
	const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
	const [loading, setLoading] = useState(endpoint !== undefined);
	const [error, setError] = useState<string | null>(null);
	// Duas leituras da MESMA conversa: a lista é registro (auditar, ver artifact),
	// a de WhatsApp é atendimento (ver o que o cliente viu, do jeito que ele viu).
	// Mora aqui, no componente que todas as telas de conversa usam, pra a visão
	// existir em qualquer lugar que mostre histórico — sem cada tela reimplementar.
	const [modo, setModo] = useState<"lista" | "whatsapp">("lista");
	const bottomRef = useRef<HTMLDivElement>(null);

	const fetchMessages = useCallback(async () => {
		if (!endpoint) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(endpoint);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error ?? `Erro ${res.status}`);
			}
			const data = await res.json();
			setMessages(data.messages ?? []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao carregar conversa");
		} finally {
			setLoading(false);
		}
	}, [endpoint]);

	useEffect(() => {
		if (endpoint) {
			fetchMessages();
		}
	}, [endpoint, fetchMessages]);

	// Auto-scroll to bottom after messages load
	useEffect(() => {
		if (!loading && messages.length > 0) {
			bottomRef.current?.scrollIntoView({ behavior: "instant" });
		}
	}, [loading, messages.length]);

	if (loading) {
		return (
			<div className="flex flex-col gap-3 p-4">
				<Skeleton className="h-16 w-3/4" />
				<Skeleton className="h-12 w-2/3 self-end" />
				<Skeleton className="h-20 w-3/4" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center gap-3 p-4">
				<p className="text-sm text-destructive">{error}</p>
				<Button variant="outline" size="sm" onClick={fetchMessages}>
					Tentar novamente
				</Button>
			</div>
		);
	}

	if (messages.length === 0) {
		return (
			<div className="flex items-center justify-center p-8">
				<p className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa</p>
			</div>
		);
	}

	const alternador = (
		<div className="flex items-center justify-end gap-1 px-4 pt-3">
			<fieldset className="inline-flex rounded-md border p-0.5">
				<legend className="sr-only">Modo de exibição da conversa</legend>
				<button
					type="button"
					data-testid="modo-lista"
					aria-pressed={modo === "lista"}
					onClick={() => setModo("lista")}
					className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${modo === "lista" ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50"}`}
				>
					<List className="size-3.5" aria-hidden />
					Lista
				</button>
				<button
					type="button"
					data-testid="modo-whatsapp"
					aria-pressed={modo === "whatsapp"}
					onClick={() => setModo("whatsapp")}
					className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${modo === "whatsapp" ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50"}`}
				>
					<MessageCircle className="size-3.5" aria-hidden />
					WhatsApp
				</button>
			</fieldset>
		</div>
	);

	if (modo === "whatsapp") {
		return (
			<div className="flex flex-1 flex-col">
				{alternador}
				<ScrollArea className="flex-1 h-[calc(100vh-260px)]">
					<div className="p-4">
						<WhatsAppView mensagens={messages} />
					</div>
				</ScrollArea>
			</div>
		);
	}

	return (
		<ScrollArea className="flex-1 h-[calc(100vh-220px)]">
			{alternador}
			<div className="flex flex-col gap-3 p-4">
				{messages
					.filter((msg) => msg.role !== "system")
					.map((msg) => {
						const isUser = msg.role === "user";
						return (
							<div key={msg.id} className={`flex flex-col ${isUser ? "items-start" : "items-end"}`}>
								<span className="text-[10px] font-medium text-muted-foreground mb-0.5 px-1">
									{isUser ? "Cliente" : "Agente"}
								</span>
								<div
									className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
										isUser ? "bg-blue-100 dark:bg-blue-900/30" : "bg-muted"
									}`}
								>
									{msg.content}
								</div>
								{msg.artifacts.length > 0 && (
									<div
										className={`flex flex-col gap-1.5 mt-1.5 max-w-[80%] ${isUser ? "" : "self-end"}`}
									>
										{msg.artifacts.map((artifact) => (
											<ArtifactPreview
												key={artifact.id}
												type={artifact.type}
												payload={artifact.payload}
											/>
										))}
									</div>
								)}
								<span className="text-[10px] text-muted-foreground mt-0.5 px-1">
									{formatDistanceToNow(new Date(msg.createdAt), {
										addSuffix: true,
										locale: ptBR,
									})}
								</span>
							</div>
						);
					})}
				<div ref={bottomRef} />
			</div>
		</ScrollArea>
	);
}

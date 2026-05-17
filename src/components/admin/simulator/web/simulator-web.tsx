"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatInput } from "@/components/chat/chat-input";
import { MessageList } from "@/components/chat/message-list";
import { ChatProvider, useChatContext } from "@/lib/chat/provider";
import { HandoffBanner } from "../handoff-banner";
import { SimulatorInbox } from "../inbox";
import { MemoryDevPanel } from "../memory-dev-panel";
import { SimulatedBadge } from "../simulated-badge";

interface SessionMeta {
	contactName: string | null;
	authorName: string | null;
}

export function SimulatorWeb() {
	const [selectedId, setSelectedId] = useState<string>("");
	const [meta, setMeta] = useState<SessionMeta>({ contactName: null, authorName: null });

	// Quando troca a conversa selecionada, busca metadata pra header (autor, nome contato).
	useEffect(() => {
		if (!selectedId) {
			setMeta({ contactName: null, authorName: null });
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`/api/admin/simulator/sessions/${selectedId}`, {
					cache: "no-store",
				});
				if (!res.ok) return;
				const data = (await res.json()) as {
					conversation: {
						contactName: string | null;
						createdBy: { id: string; name: string | null } | null;
					};
				};
				if (!cancelled) {
					setMeta({
						contactName: data.conversation.contactName,
						authorName: data.conversation.createdBy?.name ?? null,
					});
				}
			} catch {
				// silencioso
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [selectedId]);

	return (
		<div className="flex h-[calc(100dvh-8rem)] overflow-hidden rounded-lg border">
			<aside className="w-72 shrink-0 border-r">
				<SimulatorInbox channel="web" selectedId={selectedId} onSelect={setSelectedId} />
			</aside>

			<main className="flex flex-1 flex-col overflow-hidden bg-background">
				{!selectedId ? (
					<div className="flex h-full flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
						Selecione uma simulação na lateral ou crie uma nova.
					</div>
				) : (
					<ChatProvider initialConversationId={selectedId}>
						<SimulatedBadge authorName={meta.authorName} />
						<HandoffWatcher />
						<EmbeddedChatBody />
					</ChatProvider>
				)}
			</main>

			{selectedId && <MemoryDevPanel conversationId={selectedId} />}
		</div>
	);
}

function HandoffWatcher() {
	const { handoff } = useChatContext();
	if (handoff.status !== "handed_off") return null;
	return <HandoffBanner />;
}

function EmbeddedChatBody() {
	const { messages, status, error, sendUserMessage, refreshHandoff } = useChatContext();

	// Refresh handoff state quando status volta a "ready" — captura a transição
	// que acontece após o submit do lead-form artifact (handoff disparado pelo /api/leads).
	const isStreaming = status === "streaming" || status === "submitted";
	const handleSend = useCallback(
		async (text: string) => {
			await sendUserMessage(text);
		},
		[sendUserMessage],
	);
	useEffect(() => {
		if (status === "ready") {
			void refreshHandoff();
		}
	}, [status, refreshHandoff]);

	return (
		<>
			<div className="flex-1 overflow-hidden">
				<MessageList
					messages={messages}
					isStreaming={isStreaming}
					hasError={Boolean(error)}
				/>
			</div>
			<div className="border-t bg-background">
				<EmbeddedChatInputBridge isStreaming={isStreaming} onSend={handleSend} />
			</div>
		</>
	);
}

// O ChatInput original lê do useChatContext.sendUserMessage diretamente, então
// já manda pelo provider injetado. Esse wrapper só repassa props (mantém o input
// idêntico ao do site sem fork).
function EmbeddedChatInputBridge({
	isStreaming,
}: {
	isStreaming: boolean;
	onSend: (text: string) => Promise<void>;
}) {
	return <ChatInput isStreaming={isStreaming} />;
}

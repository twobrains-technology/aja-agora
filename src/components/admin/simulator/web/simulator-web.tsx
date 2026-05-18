"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatInput } from "@/components/chat/chat-input";
import { MessageList } from "@/components/chat/message-list";
import { ChatProvider, useChatContext } from "@/lib/chat/provider";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { HandoffBanner } from "../handoff-banner";
import { SimulatorInbox } from "../inbox";
import { MemoryDevPanel } from "../memory-dev-panel";
import { SimulatedBadge } from "../simulated-badge";

interface SessionMeta {
	contactName: string | null;
	authorName: string | null;
}

type PersistedMessage = {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	channel: string;
	createdAt: string;
};

function toUIMessages(messages: PersistedMessage[]): AjaUIMessage[] {
	return messages
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map(
			(m) =>
				({
					id: m.id,
					role: m.role as "user" | "assistant",
					parts: [{ type: "text" as const, text: m.content }],
				}) as AjaUIMessage,
		);
}

export function SimulatorWeb() {
	const [selectedId, setSelectedId] = useState<string>("");
	const [meta, setMeta] = useState<SessionMeta>({ contactName: null, authorName: null });
	const [initialMessages, setInitialMessages] = useState<AjaUIMessage[] | null>(null);

	// Quando troca a conversa selecionada, busca metadata + histórico pra
	// hidratar o ChatProvider. Sem hidratar, o chat re-abre vazio mesmo com
	// mensagens persistidas no DB.
	useEffect(() => {
		if (!selectedId) {
			setMeta({ contactName: null, authorName: null });
			setInitialMessages(null);
			return;
		}
		let cancelled = false;
		// Reseta o estado enquanto o fetch carrega — evita pintar a tela com
		// histórico antigo de outra sessão.
		setInitialMessages(null);
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
					messages: PersistedMessage[];
				};
				if (!cancelled) {
					setMeta({
						contactName: data.conversation.contactName,
						authorName: data.conversation.createdBy?.name ?? null,
					});
					setInitialMessages(toUIMessages(data.messages ?? []));
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
				) : initialMessages === null ? (
					<div className="flex h-full flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
						Carregando conversa...
					</div>
				) : (
					// `key={selectedId}` força remount do provider quando a sessão muda,
					// garantindo que o `useChat` seja reconstruído com o seed correto
					// de `initialMessages` (Chat instance é criada uma vez por id).
					<ChatProvider
						key={selectedId}
						initialConversationId={selectedId}
						initialMessages={initialMessages}
					>
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

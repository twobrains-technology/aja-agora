"use client";

import { useEffect, useState } from "react";
import { HandoffBanner } from "../handoff-banner";
import { SimulatorInbox } from "../inbox";
import { MemoryDevPanel } from "../memory-dev-panel";
import { SimulatedBadge } from "../simulated-badge";
import { useConversationStatus } from "./use-conversation-status";
import { type WhatsAppStageItem, WhatsAppStage } from "./whatsapp-stage";

type PersistedMessage = {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	channel: string;
	createdAt: string;
};

function toStageItems(messages: PersistedMessage[]): WhatsAppStageItem[] {
	return messages
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map<WhatsAppStageItem>((m) => ({
			kind: "bubble",
			id: m.id,
			// role user = mensagem ENVIADA pelo cliente simulado (verde, à direita)
			// role assistant = RECEBIDA do agente (cinza, à esquerda)
			direction: m.role === "user" ? "sent" : "received",
			text: m.content,
			createdAt: m.createdAt,
		}));
}

export function SimulatorWhatsapp() {
	const [selectedId, setSelectedId] = useState<string>("");
	const [authorName, setAuthorName] = useState<string | null>(null);
	const [initialItems, setInitialItems] = useState<WhatsAppStageItem[] | null>(null);
	const status = useConversationStatus(selectedId);

	useEffect(() => {
		if (!selectedId) {
			setAuthorName(null);
			setInitialItems(null);
			return;
		}
		let cancelled = false;
		setInitialItems(null);
		(async () => {
			try {
				const res = await fetch(`/api/admin/simulator/sessions/${selectedId}`, {
					cache: "no-store",
				});
				if (!res.ok) return;
				const data = (await res.json()) as {
					conversation: { createdBy: { id: string; name: string | null } | null };
					messages: PersistedMessage[];
				};
				if (!cancelled) {
					setAuthorName(data.conversation.createdBy?.name ?? null);
					setInitialItems(toStageItems(data.messages ?? []));
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
				<SimulatorInbox channel="whatsapp" selectedId={selectedId} onSelect={setSelectedId} />
			</aside>

			<main className="flex flex-1 flex-col overflow-hidden bg-muted/20">
				{!selectedId ? (
					<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
						Selecione uma simulação na lateral ou crie uma nova.
					</div>
				) : initialItems === null ? (
					<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
						Carregando conversa...
					</div>
				) : (
					<>
						<SimulatedBadge authorName={authorName} />
						{status === "handed_off" && <HandoffBanner showAssumeInline />}
						<div className="flex-1 overflow-hidden p-3">
							{/* key força remount ao trocar sessão pra que o stage seed
							    com initialItems da nova conversa, sem vazar SSE/state da anterior */}
							<WhatsAppStage
								key={selectedId}
								conversationId={selectedId}
								initialItems={initialItems}
							/>
						</div>
					</>
				)}
			</main>

			{selectedId && <MemoryDevPanel conversationId={selectedId} />}
		</div>
	);
}

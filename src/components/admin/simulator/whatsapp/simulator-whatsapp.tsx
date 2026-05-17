"use client";

import { useEffect, useState } from "react";
import { HandoffBanner } from "../handoff-banner";
import { SimulatorInbox } from "../inbox";
import { MemoryDevPanel } from "../memory-dev-panel";
import { SimulatedBadge } from "../simulated-badge";
import { useConversationStatus } from "./use-conversation-status";
import { WhatsAppStage } from "./whatsapp-stage";

export function SimulatorWhatsapp() {
	const [selectedId, setSelectedId] = useState<string>("");
	const [authorName, setAuthorName] = useState<string | null>(null);
	const status = useConversationStatus(selectedId);

	useEffect(() => {
		if (!selectedId) {
			setAuthorName(null);
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
					conversation: { createdBy: { id: string; name: string | null } | null };
				};
				if (!cancelled) setAuthorName(data.conversation.createdBy?.name ?? null);
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
				) : (
					<>
						<SimulatedBadge authorName={authorName} />
						{status === "handed_off" && <HandoffBanner showAssumeInline />}
						<div className="flex-1 overflow-hidden p-3">
							<WhatsAppStage conversationId={selectedId} />
						</div>
					</>
				)}
			</main>

			{selectedId && <MemoryDevPanel conversationId={selectedId} />}
		</div>
	);
}

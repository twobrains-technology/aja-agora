import { useEffect, useState } from "react";

/**
 * Polling leve do status da conversa simulada (3s). Foi a opção mais simples
 * que evita rebuild da subscrição SSE só pra refletir handoff. Volume é
 * baixíssimo (1 usuário admin por aba).
 */
export function useConversationStatus(conversationId: string): string | null {
	const [status, setStatus] = useState<string | null>(null);

	useEffect(() => {
		if (!conversationId) {
			setStatus(null);
			return;
		}
		let cancelled = false;
		const fetchOnce = async () => {
			try {
				const res = await fetch(`/api/admin/simulator/sessions/${conversationId}`, {
					cache: "no-store",
				});
				if (!res.ok) return;
				const data = (await res.json()) as { conversation: { status: string } };
				if (!cancelled) setStatus(data.conversation.status);
			} catch {
				// silencioso
			}
		};
		void fetchOnce();
		const t = setInterval(fetchOnce, 3000);
		return () => {
			cancelled = true;
			clearInterval(t);
		};
	}, [conversationId]);

	return status;
}

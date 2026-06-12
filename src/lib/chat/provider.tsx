"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { generateId } from "@/lib/utils/id";
import type { ChatAction } from "./actions";
import { appendBusMessage } from "./bus-merge";
import type { AjaUIMessage } from "./ui-message";

/** @deprecated Use `ChatAction` from `./actions`. Kept as alias for back-compat. */
export type GateAction = ChatAction;

export type HandoffState = {
	status: "active" | "handed_off" | "closed";
	agentName: string | null;
};

type ChatContextValue = {
	conversationId: string;
	messages: AjaUIMessage[];
	status: "submitted" | "streaming" | "ready" | "error";
	error: Error | undefined;
	handoff: HandoffState;
	sendUserMessage: (text: string) => Promise<void>;
	sendAction: (action: ChatAction, label: string) => Promise<void>;
	regenerate: () => Promise<void>;
	reset: () => void;
	/** D17 — comando oculto /reset: apaga a conversa no servidor (cascade) +
	 * purga a memória do agente + regenera o cookie, então zera o estado local. */
	resetAll: () => Promise<void>;
	refreshHandoff: () => Promise<void>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

type SseEvent =
	| { type: "connected"; status: "active" | "handed_off" | "closed"; agentName: string | null }
	| {
			type: "message";
			message: {
				id: string;
				role: "user" | "assistant";
				content: string;
				agentName?: string;
				createdAt: string;
			};
	  }
	| { type: "ping" };

export function ChatProvider({
	children,
	initialConversationId,
	initialMessages,
}: {
	children: ReactNode;
	/**
	 * Se passado, usa esse ID como conversa inicial (caso do simulador, que
	 * cria a conversa antes via /api/admin/simulator/sessions). Sem isso, mantém
	 * comportamento padrão de gerar UUID local.
	 */
	initialConversationId?: string;
	/**
	 * Hidrata o `useChat` com mensagens já persistidas (ex: re-abrir conversa
	 * simulada no admin). Sem isso, o chat re-monta vazio e o histórico do DB
	 * só reaparece após o próximo turno. Se `undefined`, mantém o comportamento
	 * legado de iniciar com `[]`.
	 */
	initialMessages?: AjaUIMessage[];
}) {
	const [conversationId, setConversationId] = useState<string>(
		() => initialConversationId ?? generateId(),
	);
	const [handoff, setHandoff] = useState<HandoffState>({ status: "active", agentName: null });

	// Captura o snapshot do array no primeiro render — evita que toda nova
	// reference de `initialMessages` (caso pai re-renderize sem memoizar)
	// re-dispare o effect de hidratação. Hidratação só acontece quando o
	// conversationId muda de fato (ou no mount inicial).
	const seedMessagesRef = useRef<AjaUIMessage[] | undefined>(initialMessages);
	seedMessagesRef.current = initialMessages;

	const transport = useMemo(
		() =>
			new DefaultChatTransport<AjaUIMessage>({
				api: "/api/chat",
				prepareSendMessagesRequest: ({ messages, body }) => ({
					body: { conversationId, messages, ...(body ?? {}) },
				}),
			}),
		[conversationId],
	);

	const chat = useChat<AjaUIMessage>({
		id: conversationId,
		transport,
		// Semeia o estado inicial do hook com o histórico vindo do servidor
		// quando o pai já tem as mensagens em mãos (simulador admin reabrindo
		// conversa). Em fluxos sem hidratação (chat público), permanece undefined
		// e o hook começa com [].
		messages: initialMessages,
	});

	const setMessagesRef = useRef(chat.setMessages);
	setMessagesRef.current = chat.setMessages;

	// Quando o pai (ex: simulador) troca conversationId via prop, limpa o estado
	// herdado da sessão anterior (mensagens + handoff). Sem isso, as mensagens
	// da sessão antiga vazam pra UI da nova até o useChat reconciliar. Se o pai
	// já entregou `initialMessages` pra nova conversa, hidrata em vez de zerar.
	useEffect(() => {
		if (!initialConversationId) return;
		if (initialConversationId === conversationId) return;
		setMessagesRef.current(seedMessagesRef.current ?? []);
		setConversationId(initialConversationId);
		setHandoff({ status: "active", agentName: null });
		// biome-ignore lint/correctness/useExhaustiveDependencies: dispara só ao trocar pai
	}, [initialConversationId]);

	const refreshHandoff = useCallback(async () => {
		try {
			const res = await fetch(`/api/conversations/${conversationId}/status`);
			if (!res.ok) return;
			const data = (await res.json()) as HandoffState;
			setHandoff(data);
		} catch {
			// Network blip — keep prior state.
		}
	}, [conversationId]);

	useEffect(() => {
		void refreshHandoff();
	}, [refreshHandoff]);

	useEffect(() => {
		if (handoff.status !== "handed_off") return;
		const url = `/api/chat/stream?conversationId=${conversationId}`;
		const source = new EventSource(url);
		source.onmessage = (e) => {
			let payload: SseEvent;
			try {
				payload = JSON.parse(e.data) as SseEvent;
			} catch {
				return;
			}
			if (payload.type === "connected") {
				setHandoff({ status: payload.status, agentName: payload.agentName });
				return;
			}
			if (payload.type === "message") {
				const m = payload.message;
				const ui: AjaUIMessage = {
					id: m.id,
					role: m.role,
					parts: [{ type: "text", text: m.content }],
				} as AjaUIMessage;
				setMessagesRef.current((prev) => appendBusMessage(prev, ui));
			}
		};
		source.onerror = () => {
			// EventSource auto-retries; close on hard fail to avoid runaway.
			if (source.readyState === EventSource.CLOSED) source.close();
		};
		return () => source.close();
	}, [handoff.status, conversationId]);

	const sendUserMessage = useCallback(
		async (text: string) => {
			await chat.sendMessage({ text });
		},
		[chat],
	);

	const sendAction = useCallback(
		async (action: ChatAction, label: string) => {
			await chat.sendMessage({ text: label }, { body: { action } });
		},
		[chat],
	);

	const regenerate = useCallback(async () => {
		await chat.regenerate();
	}, [chat]);

	const reset = useCallback(() => {
		chat.setMessages([]);
		chat.clearError?.();
		setConversationId(generateId());
		setHandoff({ status: "active", agentName: null });
	}, [chat]);

	// D17 — /reset oculto: servidor primeiro (delete + purge + cookie novo),
	// depois o reset local. Falha de rede não trava a UI — zera local mesmo assim.
	const resetAll = useCallback(async () => {
		try {
			await fetch("/api/chat/reset", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ conversationId }),
			});
		} catch {
			// best-effort — o reset local acontece de qualquer jeito
		}
		reset();
	}, [conversationId, reset]);

	const value = useMemo<ChatContextValue>(
		() => ({
			conversationId,
			messages: chat.messages,
			status: chat.status,
			error: chat.error,
			handoff,
			sendUserMessage,
			sendAction,
			regenerate,
			reset,
			resetAll,
			refreshHandoff,
		}),
		[
			conversationId,
			chat.messages,
			chat.status,
			chat.error,
			handoff,
			sendUserMessage,
			sendAction,
			regenerate,
			reset,
			resetAll,
			refreshHandoff,
		],
	);

	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
	const ctx = useContext(ChatContext);
	if (!ctx) {
		throw new Error("useChatContext must be used within ChatProvider");
	}
	return ctx;
}

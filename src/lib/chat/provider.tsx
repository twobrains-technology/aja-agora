"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { AjaUIMessage } from "./ui-message";

export type GateAction =
	| {
			kind: "gate";
			gate: "experience";
			value: "first" | "returning" | "doubts";
			label: string;
	  }
	| { kind: "gate"; gate: "consent"; value: "yes" | "more"; label: string }
	| {
			kind: "gate";
			gate: "credit";
			value: { credit: number; monthlyBudget: number };
			label: string;
	  }
	| { kind: "gate"; gate: "timeframe"; value: { prazoMeses: number }; label: string }
	| { kind: "gate"; gate: "lance"; value: "yes" | "maybe" | "no"; label: string }
	| { kind: "category"; category: "imovel" | "auto" | "servicos" }
	| {
			kind: "select-group";
			groupId: string;
			administradora: string;
			creditValue: number;
			termMonths: number;
			label: string;
	  }
	| { kind: "interest"; administradora: string; label: string };

type ChatContextValue = {
	conversationId: string;
	messages: AjaUIMessage[];
	status: "submitted" | "streaming" | "ready" | "error";
	error: Error | undefined;
	sendUserMessage: (text: string) => Promise<void>;
	sendAction: (action: GateAction, label: string) => Promise<void>;
	regenerate: () => Promise<void>;
	reset: () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
	const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());

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
	});

	const sendUserMessage = useCallback(
		async (text: string) => {
			await chat.sendMessage({ text });
		},
		[chat],
	);

	const sendAction = useCallback(
		async (action: GateAction, label: string) => {
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
		setConversationId(crypto.randomUUID());
	}, [chat]);

	const value = useMemo<ChatContextValue>(
		() => ({
			conversationId,
			messages: chat.messages,
			status: chat.status,
			error: chat.error,
			sendUserMessage,
			sendAction,
			regenerate,
			reset,
		}),
		[
			conversationId,
			chat.messages,
			chat.status,
			chat.error,
			sendUserMessage,
			sendAction,
			regenerate,
			reset,
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

// src/lib/chat/use-chat.ts
"use client";

import { useChatStore, type ChatState } from "./store";

/**
 * Convenience hook for chat components.
 * Thin wrapper over the Zustand store — selects commonly used fields.
 * Uses individual selectors to minimize re-renders.
 */
export function useChat() {
  const messages = useChatStore((s: ChatState) => s.messages);
  const conversationId = useChatStore((s: ChatState) => s.conversationId);
  const isStreaming = useChatStore((s: ChatState) => s.isStreaming);
  const error = useChatStore((s: ChatState) => s.error);
  const sendMessage = useChatStore((s: ChatState) => s.sendMessage);
  const retry = useChatStore((s: ChatState) => s.retry);
  const reset = useChatStore((s: ChatState) => s.reset);

  return {
    messages,
    conversationId,
    isStreaming,
    error,
    sendMessage,
    retry,
    reset,
  };
}

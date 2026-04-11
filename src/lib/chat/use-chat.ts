// src/lib/chat/use-chat.ts
"use client";

import { useChatStore } from "./store";

/**
 * Convenience hook for chat components.
 * Thin wrapper over the Zustand store — selects commonly used fields.
 * Uses individual selectors to minimize re-renders.
 */
export function useChat() {
  const messages = useChatStore((s) => s.messages);
  const conversationId = useChatStore((s) => s.conversationId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const error = useChatStore((s) => s.error);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const retry = useChatStore((s) => s.retry);
  const reset = useChatStore((s) => s.reset);

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

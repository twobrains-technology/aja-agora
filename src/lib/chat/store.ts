// src/lib/chat/store.ts
"use client";

import { create } from "zustand";
import type { Artifact, ChatMessage, SSEEvent } from "./types";
import { parseSSEChunk } from "./sse-parser";

interface ChatState {
  // Data
  conversationId: string | null;
  messages: ChatMessage[];

  // UI state
  isStreaming: boolean;
  error: string | null;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  retry: () => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  isStreaming: false,
  error: null,

  sendMessage: async (content: string) => {
    const { isStreaming } = get();
    if (isStreaming) return; // Prevent concurrent sends

    // Create user message + placeholder assistant message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      artifacts: [],
      createdAt: new Date(),
      status: "complete",
    };

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      artifacts: [],
      createdAt: new Date(),
      status: "streaming",
    };

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isStreaming: true,
      error: null,
    }));

    // Build messages payload for API (full conversation history)
    const allMessages = get().messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          conversationId: get().conversationId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          response.status === 429
            ? "Muitas mensagens em pouco tempo. Aguarde um momento."
            : response.status === 404
              ? "Conversa nao encontrada. Iniciando nova conversa."
              : `Erro do servidor: ${errorText}`,
        );
      }

      // Store conversationId from response header
      const convId = response.headers.get("X-Conversation-Id");
      if (convId && !get().conversationId) {
        set({ conversationId: convId });
      }

      // Process SSE stream
      const reader = response.body!
        .pipeThrough(new TextDecoderStream())
        .getReader();

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const [events, streamDone, newBuffer] = parseSSEChunk(value, buffer);
        buffer = newBuffer;

        for (const event of events) {
          processSSEEvent(event, set);

          // Stop processing on error event
          if (event.type === "error") return;
        }

        if (streamDone) break;
      }

      // Mark streaming complete
      set((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          msgs[msgs.length - 1] = { ...last, status: "complete" };
        }
        return { messages: msgs, isStreaming: false };
      });
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "Erro de conexao. Tente novamente.";

      set((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          msgs[msgs.length - 1] = {
            ...last,
            status: "error",
            content:
              last.content || "Nao foi possivel obter uma resposta.",
          };
        }
        return { messages: msgs, isStreaming: false, error: errorMsg };
      });
    }
  },

  retry: () => {
    const { messages, isStreaming } = get();
    if (isStreaming) return;

    // Find the last user message
    const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
    if (lastUserIndex === -1) return;

    const lastUserContent = messages[lastUserIndex].content;

    // Remove the failed assistant message (and the user message — sendMessage will re-add)
    set((state) => ({
      messages: state.messages.slice(0, lastUserIndex),
      error: null,
    }));

    // Re-send
    get().sendMessage(lastUserContent);
  },

  reset: () => {
    set({
      conversationId: null,
      messages: [],
      isStreaming: false,
      error: null,
    });
  },
}));

/** Process a single SSE event, updating the store accordingly. */
function processSSEEvent(
  event: SSEEvent,
  set: (fn: (state: ChatState) => Partial<ChatState>) => void,
) {
  switch (event.type) {
    case "text-delta":
      set((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          msgs[msgs.length - 1] = {
            ...last,
            content: last.content + event.textDelta,
          };
        }
        return { messages: msgs };
      });
      break;

    case "artifact":
      set((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          const artifact: Artifact = {
            id: event.artifact.id,
            type: event.artifact.type,
            payload: event.artifact.payload as unknown as Artifact["payload"],
          };
          msgs[msgs.length - 1] = {
            ...last,
            artifacts: [...last.artifacts, artifact],
          };
        }
        return { messages: msgs };
      });
      break;

    case "error":
      set((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          msgs[msgs.length - 1] = {
            ...last,
            status: "error",
          };
        }
        return { messages: msgs, error: event.error, isStreaming: false };
      });
      break;
  }
}

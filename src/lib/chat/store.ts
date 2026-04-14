// src/lib/chat/store.ts
"use client";

import { create } from "zustand";
import type { Artifact, ChatMessage, SSEEvent } from "./types";
import { parseSSEChunk } from "./sse-parser";

export interface ChatState {
  // Data
  conversationId: string | null;
  messages: ChatMessage[];

  // UI state
  isStreaming: boolean;
  isHandedOff: boolean;
  agentName: string | null;
  error: string | null;

  // SSE connection for handoff
  _eventSource: EventSource | null;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  retry: () => void;
  reset: () => void;
  connectHandoff: () => void;
  disconnectHandoff: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  isStreaming: false,
  isHandedOff: false,
  agentName: null,
  error: null,
  _eventSource: null,

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

      // Detect handoff — connect SSE for real-time vendor messages
      if (response.headers.get("X-Handed-Off") === "true") {
        set({ isHandedOff: true });
        get().connectHandoff();
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

  connectHandoff: () => {
    const { conversationId, _eventSource } = get();
    if (!conversationId || _eventSource) return;

    const es = new EventSource(`/api/chat/stream?conversationId=${conversationId}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "message") {
          const msg = data.message;
          const chatMsg: ChatMessage = {
            id: msg.id ?? crypto.randomUUID(),
            role: msg.role,
            content: msg.agentName ? `**${msg.agentName}:** ${msg.content}` : msg.content,
            artifacts: [],
            createdAt: new Date(msg.createdAt),
            status: "complete",
          };
          set((state) => ({
            messages: [...state.messages, chatMsg],
            agentName: msg.agentName ?? state.agentName,
          }));
        } else if (data.type === "connected" && data.agentName) {
          set({ agentName: data.agentName });
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // Auto-reconnect is built into EventSource
      console.warn("[handoff-sse] Connection error, will auto-reconnect");
    };

    set({ _eventSource: es });
  },

  disconnectHandoff: () => {
    const { _eventSource } = get();
    if (_eventSource) {
      _eventSource.close();
      set({ _eventSource: null, isHandedOff: false, agentName: null });
    }
  },

  reset: () => {
    get().disconnectHandoff();
    set({
      conversationId: null,
      messages: [],
      isStreaming: false,
      isHandedOff: false,
      agentName: null,
      error: null,
      _eventSource: null,
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

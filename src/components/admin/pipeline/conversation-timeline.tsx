"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArtifactPreview } from "./artifact-preview";

interface MessageArtifact {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  artifacts: MessageArtifact[];
}

export function ConversationTimeline({ leadId }: { leadId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/conversation`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar conversa");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Auto-scroll to bottom after messages load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [loading, messages.length]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="h-12 w-2/3 self-end" />
        <Skeleton className="h-20 w-3/4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchMessages}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          Nenhuma mensagem nesta conversa
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 h-[calc(100vh-220px)]">
      <div className="flex flex-col gap-3 p-4">
        {messages
          .filter((msg) => msg.role !== "system")
          .map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-start" : "items-end"}`}
              >
                <span className="text-[10px] font-medium text-muted-foreground mb-0.5 px-1">
                  {isUser ? "Cliente" : "Agente"}
                </span>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    isUser
                      ? "bg-blue-100 dark:bg-blue-900/30"
                      : "bg-muted"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.artifacts.length > 0 && (
                  <div className={`flex flex-col gap-1.5 mt-1.5 max-w-[80%] ${isUser ? "" : "self-end"}`}>
                    {msg.artifacts.map((artifact) => (
                      <ArtifactPreview
                        key={artifact.id}
                        type={artifact.type}
                        payload={artifact.payload}
                      />
                    ))}
                  </div>
                )}
                <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                  {formatDistanceToNow(new Date(msg.createdAt), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
              </div>
            );
          })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

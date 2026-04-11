"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage as ChatMessageType } from "@/lib/chat/types";
import { ChatMessage } from "./chat-message";
import { cn } from "@/lib/utils";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MessageListProps {
  messages: ChatMessageType[];
  isStreaming: boolean;
  onRetry?: () => void;
}

export function MessageList({ messages, isStreaming, onRetry }: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Track whether user is at the bottom via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry.isIntersecting);
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.5,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll when at bottom or streaming
  useEffect(() => {
    if (isAtBottom || isStreaming) {
      sentinelRef.current?.scrollIntoView({
        behavior: isStreaming ? "auto" : "smooth",
      });
    }
  }, [messages, isStreaming, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <div
      ref={scrollContainerRef}
      data-message-list
      className="flex-1 overflow-y-auto"
      role="log"
      aria-live="polite"
    >
      <div className="flex flex-col gap-6 px-4 py-4 sm:px-6">
        {!hasMessages && <EmptyState />}

        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            isNew={index >= messages.length - 2}
            onRetry={message.status === "error" ? onRetry : undefined}
            isStreaming={isStreaming}
          />
        ))}

        {/* Bottom sentinel for IntersectionObserver + input clearance */}
        <div ref={sentinelRef} className="h-20 shrink-0" aria-hidden="true" />
      </div>

      {/* Scroll-to-bottom pill when user has scrolled up */}
      {!isAtBottom && hasMessages && (
        <div className="sticky bottom-4 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={scrollToBottom}
            className="gap-1.5 rounded-full shadow-md"
          >
            <ArrowDown className="size-3.5" />
            <span>Novas mensagens</span>
          </Button>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h2 className="text-xl font-semibold text-foreground">
        Ola! Sou seu consultor de consorcio.
      </h2>
      <p className="mt-3 max-w-sm text-base text-muted-foreground">
        Me conta o que voce quer conquistar — um carro, um imovel, ou algo
        diferente. Vou encontrar o melhor plano pra voce.
      </p>
    </div>
  );
}

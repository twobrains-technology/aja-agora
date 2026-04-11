"use client";

import type { ChatMessage as ChatMessageType } from "@/lib/chat/types";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { ArtifactRenderer } from "./artifact-renderer";
import { QuickReplies } from "./quick-replies";
import { StreamingDots } from "./streaming-dots";
import type { QuickReplyPayload } from "@/lib/chat/types";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

interface ChatMessageProps {
  message: ChatMessageType;
  /** When true, the message animates in. Set false for messages loaded from history. */
  isNew?: boolean;
  /** Callback to retry sending the last message on error. */
  onRetry?: () => void;
  /** Whether the chat is currently streaming (disables retry button). */
  isStreaming?: boolean;
}

const messageSpring = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

export function ChatMessage({ message, isNew = false, onRetry, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isError = message.status === "error";
  const isStreamingEmpty =
    message.status === "streaming" && message.content.length === 0;
  const prefersReduced = useReducedMotion();

  // Only animate the newest message; skip for history/re-renders
  const animationProps =
    isNew && !prefersReduced
      ? {
          initial: { opacity: 0, y: 12 } as const,
          animate: { opacity: 1, y: 0 } as const,
          transition: messageSpring,
        }
      : {
          initial: false as const,
          animate: { opacity: 1, y: 0 } as const,
        };

  return (
    <motion.div
      {...animationProps}
      className={cn("flex w-full flex-col gap-1", isUser ? "items-end" : "items-start")}
    >
      {/* Message bubble */}
      <div
        className={cn(
          "max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-base sm:max-w-[80%] sm:px-4 sm:py-2.5",
          isUser
            ? "rounded-br-lg bg-primary text-primary-foreground"
            : "rounded-bl-lg bg-muted text-foreground",
          isError && "border border-destructive"
        )}
      >
        {isStreamingEmpty ? (
          <StreamingDots />
        ) : (
          <div className="flex items-start gap-2">
            {isError && (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            )}
            {isUser ? (
              <span>{message.content}</span>
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0.5 prose-p:leading-snug prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0 prose-strong:text-foreground prose-headings:text-foreground prose-headings:text-sm prose-headings:font-semibold prose-headings:my-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Retry button for error messages */}
      {isError && onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          disabled={isStreaming}
          className="gap-1.5 text-destructive hover:text-destructive"
        >
          <RotateCcw className="size-3.5" />
          <span>Tentar novamente</span>
        </Button>
      )}

      {/* Skeleton loading cards — show only when agent is actively fetching results */}
      {!isUser && message.status === "streaming" && message.content.length > 20 && message.artifacts.length === 0 && /busca|opcoe|opcõe|resultado|encontr|melhor/i.test(message.content) && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex w-full max-w-[90%] gap-2.5 overflow-hidden sm:max-w-[80%]"
        >
          {[0, 1, 2].map((i) => (
            <Card key={i} className="w-[160px] shrink-0 animate-pulse">
              <CardContent className="space-y-2 p-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-px w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Artifacts — rendered below bubble, full available width */}
      {message.artifacts.length > 0 && (
        <div
          className={cn(
            "flex w-full max-w-[90%] flex-col gap-2 sm:max-w-[80%]",
            isUser ? "items-end" : "items-start"
          )}
        >
          <AnimatePresence mode="popLayout">
            {message.artifacts.map((artifact, i) => (
              <motion.div
                key={artifact.id}
                layout={!prefersReduced}
                initial={
                  prefersReduced
                    ? false
                    : { opacity: 0, scale: 0.96, y: 8 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={
                  prefersReduced
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.96 }
                }
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 25,
                  delay: prefersReduced ? 0 : i * 0.06,
                }}
                className="w-full"
              >
                <ArtifactRenderer artifact={artifact} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

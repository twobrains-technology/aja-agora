"use client";

import type { ChatMessage as ChatMessageType } from "@/lib/chat/types";
import { ArtifactRenderer } from "./artifact-renderer";
import { StreamingDots } from "./streaming-dots";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isError = message.status === "error";
  const isStreamingEmpty =
    message.status === "streaming" && message.content.length === 0;

  return (
    <div
      className={cn("flex w-full flex-col gap-1", isUser ? "items-end" : "items-start")}
    >
      {/* Message bubble */}
      <div
        className={cn(
          "max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-base sm:max-w-[80%]",
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
            <span>{message.content}</span>
          </div>
        )}
      </div>

      {/* Artifacts — rendered below bubble, full available width */}
      {message.artifacts.length > 0 && (
        <div
          className={cn(
            "flex w-full max-w-[90%] flex-col gap-2 sm:max-w-[80%]",
            isUser ? "items-end" : "items-start"
          )}
        >
          {message.artifacts.map((artifact) => (
            <ArtifactRenderer key={artifact.id} artifact={artifact} />
          ))}
        </div>
      )}
    </div>
  );
}

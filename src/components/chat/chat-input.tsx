"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (content: string) => void;
  isStreaming: boolean;
}

export function ChatInput({ onSend, isStreaming }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    // Re-focus after sending
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [value, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const canSend = value.trim().length > 0 && !isStreaming;

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 border-t border-border bg-background",
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <div className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          inputMode="text"
          placeholder="Diga o que voce quer realizar..."
          disabled={isStreaming}
          rows={1}
          aria-label="Digite sua mensagem"
          className={cn(
            "flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2.5 text-base",
            "outline-none transition-colors placeholder:text-muted-foreground",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:bg-input/30"
          )}
          style={{ height: "auto", maxHeight: "120px", overflow: "auto" }}
        />
        <Button
          variant="default"
          size="icon"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Enviar mensagem"
          className="size-11 shrink-0"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

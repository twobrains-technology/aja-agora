"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatLayoutProps {
  children: React.ReactNode;
  onReset?: () => void;
  error?: string | null;
}

export function ChatLayout({ children, onReset, error }: ChatLayoutProps) {
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const showError = error && error !== dismissedError;

  // Virtual keyboard handling — scroll message list to bottom when keyboard opens
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleResize = () => {
      document.querySelector("[data-message-list]")?.scrollTo({
        top: Number.MAX_SAFE_INTEGER,
        behavior: "smooth",
      });
    };

    viewport.addEventListener("resize", handleResize);
    return () => viewport.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-x-hidden bg-background">
      {/* Header — 48px, sticky top */}
      <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <h1 className="text-base font-semibold text-foreground">Aja Agora</h1>
        {onReset && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onReset}
            aria-label="Nova conversa"
            className="size-10"
          >
            <RefreshCw className="size-4" />
          </Button>
        )}
      </header>

      {/* Dismissible error banner */}
      {showError && (
        <div className="flex items-center justify-between gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDismissedError(error)}
            className="size-7 shrink-0 text-destructive hover:text-destructive"
            aria-label="Fechar erro"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Content area — scrollable messages + fixed input */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}

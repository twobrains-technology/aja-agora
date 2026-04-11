"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatLayoutProps {
  children: React.ReactNode;
  onReset?: () => void;
}

export function ChatLayout({ children, onReset }: ChatLayoutProps) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header — 48px, sticky top */}
      <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <h1 className="text-base font-semibold text-foreground">Aja Agora</h1>
        {onReset && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onReset}
            aria-label="Nova conversa"
          >
            <RefreshCw className="size-4" />
          </Button>
        )}
      </header>

      {/* Content area — scrollable messages + fixed input */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}

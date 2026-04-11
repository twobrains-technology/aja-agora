"use client";

// Placeholder for ArtifactRenderer — built by plan 03-03 (parallel wave).
// This stub allows chat-message.tsx to compile. The real implementation
// will replace this file when plan 03-03 completes.

import type { Artifact } from "@/lib/chat/types";

interface ArtifactRendererProps {
  artifact: Artifact;
}

export function ArtifactRenderer({ artifact }: ArtifactRendererProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
      <p>Artefato: {artifact.type}</p>
    </div>
  );
}

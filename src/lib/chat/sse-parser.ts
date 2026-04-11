// src/lib/chat/sse-parser.ts
import type { SSEEvent } from "./types";

/**
 * Parses a chunk of SSE data, handling the buffer for partial lines.
 *
 * SSE format: "data: <json>\n\n" or "data: [DONE]\n\n"
 * Chunks may arrive split across multiple read() calls.
 *
 * @returns [parsedEvents, isDone, updatedBuffer]
 */
export function parseSSEChunk(
  chunk: string,
  buffer: string,
): [SSEEvent[], boolean, string] {
  const events: SSEEvent[] = [];
  let isDone = false;

  const combined = buffer + chunk;
  const lines = combined.split("\n");
  // Last element may be incomplete — keep it in buffer
  const remainder = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines (SSE event boundaries)
    if (trimmed === "") continue;

    // Only process data lines
    if (!trimmed.startsWith("data: ")) continue;

    const payload = trimmed.slice(6); // Remove "data: " prefix

    // Check for stream termination
    if (payload === "[DONE]") {
      isDone = true;
      continue;
    }

    // Parse JSON event
    try {
      const event = JSON.parse(payload) as SSEEvent;
      events.push(event);
    } catch {
      // Malformed JSON — skip this event
      console.warn("[SSE Parser] Failed to parse event:", payload);
    }
  }

  return [events, isDone, remainder];
}

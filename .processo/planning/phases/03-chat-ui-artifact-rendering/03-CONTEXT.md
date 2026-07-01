# Phase 3: Chat UI & Artifact Rendering - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the chat interface with SSE streaming, artifact renderer, and all interactive components so users can converse with the agent and interact with visual cards, tables, and simulations.

</domain>

<decisions>
## Implementation Decisions

### Chat Layout & Component Architecture
- Chat layout based on shadcn/studio `application-shell` inspiration via `/iui` — adapted with central chat area, no sidebar. Mobile-first fullscreen chat
- Virtualized message list (`src/components/chat/message-list.tsx`) with auto-scroll, typing indicator, inline artifact support
- Chat input uses shadcn Input refined via `/rui` — auto-resize textarea, send button, disabled during streaming. Mobile-optimized
- Streaming indicator with animated dots via Motion v12 (`motion/react`) — 3 pulsing dots

### Artifact Cards & Rendering
- Type-dispatch artifact renderer (`src/components/chat/artifact-renderer.tsx`) — receives `{type, payload}`, dispatches to correct component. Extensible for new types
- GroupCard uses shadcn Card refined via `/rui` — category badge, credit amount, estimated parcela, rate. Clickable (triggers `get_group_details`). Entry animation with Motion
- ComparisonTable uses shadcn Table — sticky header, best option highlight, responsive with horizontal scroll on mobile
- SimulationResult uses Card with visual breakdown — monthly parcela in large highlight, rate/reserve/term in smaller items below. Refined via `/rui`

### Streaming Integration & Mobile UX
- Custom SSE client (`src/lib/chat/use-chat.ts`) consumes SSE from Agent SDK API route. Zustand store for chat state. NOT using AI SDK `useChat()` since backend uses Agent SDK protocol, not AI SDK protocol
- JSON markers in stream for artifact detection — Agent SDK tool results sent as `artifact` SSE events with type+payload. Frontend renders inline
- 320px minimum breakpoint with container queries. Cards stack vertically. Fixed bottom input. No horizontal scroll
- Motion v12 (`motion/react`) — `AnimatePresence` for artifact enter/exit, `layout` animations for reorder, spring physics for cards

### shadcn/studio Pro Usage
- ALL visual components must come from or be inspired by shadcn/studio Pro blocks
- Use `/rui` to refine Button, Card, Input, Table components with Pro variants
- Use `/iui` with `application-shell` for chat layout inspiration
- NEVER create UI components from scratch if a Pro block exists

### Claude's Discretion
- Exact animation timing and spring physics values
- Scroll behavior details (intersection observer vs scroll events)
- SSE reconnection and error recovery strategy

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/button.tsx` — shadcn Button from Phase 1
- `src/components/ui/card.tsx` — shadcn Card from Phase 1
- `src/lib/utils.ts` — cn() utility
- `src/app/api/chat/route.ts` — Agent SDK API route from Phase 2

### Established Patterns
- shadcn/ui components in `src/components/ui/`
- Tailwind CSS 4 with CSS-native config
- Agent SDK `query()` for backend, SSE streaming to frontend
- Drizzle ORM for DB access

### Integration Points
- `src/app/api/chat/route.ts` — SSE endpoint (Agent SDK)
- `src/app/page.tsx` — will host the chat interface (or `/chat` route)
- `package.json` — add motion, zustand, @ai-sdk/react (for future frontend needs)

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond what was decided above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

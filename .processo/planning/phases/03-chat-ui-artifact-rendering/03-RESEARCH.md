# Phase 3: Chat UI & Artifact Rendering — Research

**Researched:** 2026-04-11
**Status:** Complete

## Key Findings

1. **The backend SSE protocol is custom** — the Agent SDK `query()` yields `assistant` and `result` message types, which the route transforms into `data: {"type":"text-delta","textDelta":"..."}` SSE events terminated by `data: [DONE]`. This is NOT the AI SDK wire protocol, so `useChat()` from `ai` cannot be used. A custom SSE client using `fetch` + `ReadableStream` is required.

2. **Artifact delivery is the missing piece** — currently the route only streams `text-delta` events. Tool results (group data, simulations, rates) are consumed internally by the agent but never surfaced as structured artifacts to the frontend. Phase 3 must add `artifact` SSE events from the route AND presentation tools on the agent side (AGENT-07).

3. **The DB schema already supports artifacts** — `artifacts` table with `artifact_type` enum (`group_card`, `comparison_table`, `simulation_result`, `recommendation_card`, `lead_form`) and a `jsonb` payload column. The type-dispatch pattern maps directly to this enum.

4. **Two new dependencies needed** — `motion` (animations) and `zustand` (state management). Both are already in the CLAUDE.md stack spec. `ai` and `@ai-sdk/anthropic` are already installed but won't be used for the chat hook — they'll serve as the Anthropic provider for the backend.

5. **shadcn/ui components to install** — Input, Textarea, Table, Badge, Separator, ScrollArea, Skeleton. Card and Button already exist.

---

## Technical Research

### 1. SSE Client Pattern

#### Current Backend Protocol

The route at `src/app/api/chat/route.ts` sends SSE via `ReadableStream` with `TextEncoder`:

```
data: {"type":"text-delta","textDelta":"Olá, como..."}\n\n
data: {"type":"text-delta","textDelta":" posso ajudar?"}\n\n
data: [DONE]\n\n
```

On error:
```
data: {"type":"error","error":"..."}\n\n
```

Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, plus `X-Conversation-Id` for session tracking.

#### Why NOT `EventSource`

- `EventSource` only supports GET requests. The chat endpoint is POST (sends message body).
- `EventSource` has no way to send custom headers or request bodies.
- `EventSource` auto-reconnects, which is undesirable for a chat (reconnection should create a new turn, not replay the last).

#### Recommended: `fetch` + `ReadableStream` + `TextDecoderStream`

```typescript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages, conversationId }),
});

const reader = response.body!
  .pipeThrough(new TextDecoderStream())
  .getReader();

let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += value;
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? ''; // Keep incomplete line in buffer
  
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6); // Remove 'data: ' prefix
    if (payload === '[DONE]') { /* streaming complete */ continue; }
    
    const event = JSON.parse(payload);
    switch (event.type) {
      case 'text-delta':
        // Append to current message content
        break;
      case 'artifact':
        // Insert artifact into message artifacts array
        break;
      case 'error':
        // Handle error
        break;
    }
  }
}
```

#### SSE Parser Edge Cases

- **Chunked delivery**: A single `data: {...}\n\n` may arrive split across multiple `read()` calls. The buffer approach above handles this.
- **Multi-line data fields**: The SSE spec allows `data:` on multiple consecutive lines (merged with `\n`). Current backend sends single-line JSON, so this is not a concern now, but the parser should be aware.
- **Empty lines**: Lines with just `\n` are event boundaries in SSE. The parser should skip empty lines.

#### Reconnection Strategy

- Do NOT auto-reconnect on stream end. Each chat turn is a discrete request.
- On network error mid-stream: show error message in chat, allow user to retry (re-send last message).
- On HTTP 429: show "aguarde um momento" with retry timer from `Retry-After` header.
- On HTTP 404 (conversation not found): create new conversation.

#### Hook Shape

```typescript
// src/lib/chat/use-chat.ts
export function useChat() {
  const { 
    messages, conversationId, isStreaming, error,
    sendMessage, retry, reset 
  } = useChatStore();
  
  return { messages, conversationId, isStreaming, error, sendMessage, retry, reset };
}
```

The hook is a thin wrapper over the Zustand store — it calls `sendMessage()` which triggers the fetch+stream internally.

---

### 2. Zustand Chat Store

#### State Shape

```typescript
interface ChatMessage {
  id: string;           // client-generated UUID
  role: 'user' | 'assistant';
  content: string;      // accumulated text for assistant, full text for user
  artifacts: Artifact[]; // inline artifacts attached to this message
  createdAt: Date;
  status: 'pending' | 'streaming' | 'complete' | 'error';
}

interface Artifact {
  id: string;
  type: 'group_card' | 'comparison_table' | 'simulation_result' | 'recommendation_card';
  payload: GroupCardPayload | ComparisonTablePayload | SimulationResultPayload;
}

interface ChatState {
  // Data
  conversationId: string | null;
  messages: ChatMessage[];
  
  // UI state
  isStreaming: boolean;
  error: string | null;
  
  // Actions
  sendMessage: (content: string) => Promise<void>;
  appendTextDelta: (delta: string) => void;
  appendArtifact: (artifact: Artifact) => void;
  completeStream: () => void;
  setError: (error: string) => void;
  retry: () => void;
  reset: () => void;
}
```

#### Key Design Decisions

- **Messages are append-only during streaming**: `appendTextDelta` mutates the last assistant message's `content` field via Zustand's `set()` with immer-like semantics. This avoids creating new message objects on every token.
- **Artifacts are part of messages**: Each assistant message has an `artifacts: Artifact[]` array. When an `artifact` SSE event arrives, it's pushed to the current streaming message's array. This keeps artifacts positionally tied to the message that generated them.
- **No persistence layer in store**: The store is ephemeral (current session). Conversation history is in PostgreSQL. On page reload, the store starts empty. Future: could hydrate from DB by `conversationId` in URL.
- **`conversationId` from response header**: On first `sendMessage`, the store reads `X-Conversation-Id` from the response and stores it. Subsequent messages include it in the request body.

#### Store Implementation Pattern

```typescript
// src/lib/chat/store.ts
import { create } from 'zustand';

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  isStreaming: false,
  error: null,

  sendMessage: async (content: string) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      artifacts: [],
      createdAt: new Date(),
      status: 'complete',
    };
    
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      artifacts: [],
      createdAt: new Date(),
      status: 'streaming',
    };

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isStreaming: true,
      error: null,
    }));

    // Build messages array for API (all messages in conversation)
    const allMessages = get().messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          conversationId: get().conversationId,
        }),
      });

      if (!response.ok) { /* handle errors */ }

      // Store conversationId from header
      const convId = response.headers.get('X-Conversation-Id');
      if (convId) set({ conversationId: convId });

      // Stream processing...
      await processSSEStream(response, get, set);
    } catch (err) {
      get().setError(err instanceof Error ? err.message : 'Erro de conexão');
    }
  },
  // ... other actions
}));
```

---

### 3. shadcn/studio Pro Components

#### Mandatory Workflow (from 03-CONTEXT.md)

All visual components MUST come from or be inspired by shadcn/studio Pro:

1. **`/rui` (Refine UI)**: Take existing shadcn components and refine them with Pro styling. Use for: Button (send), Card (GroupCard, SimulationResult), Input (chat input), Table (ComparisonTable).
2. **`/iui` (Inspire UI)**: Get inspiration from Pro blocks. Use for: `application-shell` (chat layout), chat bubbles, data display cards.
3. **`/cui` (Create UI)**: Create new components from Pro patterns when no existing component fits.

#### Components to Install

Already installed:
- `button` — send button, card actions
- `card` — GroupCard, SimulationResult, message containers

Need to install:
- `input` — chat input field (will be refined to auto-resize textarea)
- `textarea` — auto-resize variant for chat input
- `table` — ComparisonTable
- `badge` — category badges on GroupCard (imóvel, auto, serviços)
- `separator` — between message groups
- `scroll-area` — message list with custom scrollbar
- `skeleton` — loading states for artifacts
- `tooltip` — hover info on financial terms

#### Installation Commands

```bash
npx shadcn@latest add input textarea table badge separator scroll-area skeleton tooltip
```

#### Pro Block Candidates (via `/iui`)

- **`application-shell`**: Full-screen app layout with header, content area, bottom bar. Adapt for chat: remove sidebar, center content, pin input to bottom.
- **Chat message blocks**: If available, Pro chat message components. Otherwise, create via `/cui` with bubble pattern.
- **Data card blocks**: Financial data display cards. Adapt for GroupCard and SimulationResult.

#### Refine Workflow (via `/rui`)

For each component that needs Pro styling:
1. Install base component
2. Run `/rui` with the component and describe the desired variant
3. The MCP tool returns refined code
4. Place in `src/components/chat/` (NOT in `src/components/ui/` — those stay as base)

---

### 4. Motion v12 Animations

#### Import Pattern (CRITICAL)

```typescript
// CORRECT — Motion v12
import { motion, AnimatePresence } from 'motion/react';

// WRONG — deprecated package name
import { motion } from 'framer-motion'; // DO NOT USE
```

#### Animation Patterns for Chat

**1. Message Enter Animation**

```typescript
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
>
  <ChatMessage ... />
</motion.div>
```

**2. Artifact Card Enter (with stagger)**

```typescript
<AnimatePresence mode="popLayout">
  {artifacts.map((artifact, i) => (
    <motion.div
      key={artifact.id}
      layout
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25,
        delay: i * 0.05, // stagger
      }}
    >
      <ArtifactRenderer artifact={artifact} />
    </motion.div>
  ))}
</AnimatePresence>
```

**3. Streaming Dots Indicator**

```typescript
function StreamingDots() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  );
}
```

**4. GroupCard Hover (desktop)**

```typescript
<motion.div
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
>
  <GroupCard ... />
</motion.div>
```

#### Key Motion v12 Features

- **`layout` prop**: Automatically animates layout changes (e.g., when new messages push cards around). Use on message list items.
- **`AnimatePresence`**: Required for exit animations. Wrap the message list and artifact containers.
- **`mode="popLayout"`**: New in v12 — elements are popped out of the layout flow during exit animation, preventing layout jumps.
- **Spring physics**: `type: 'spring'` with `stiffness` and `damping` gives natural feel. Higher stiffness = snappier, higher damping = less bounce.
- **Hardware acceleration**: Motion v12 uses Web Animations API under the hood — 120fps capable, GPU-composited transforms.

#### Performance Considerations

- Use `layout` only on elements that actually change position. Don't apply to every message.
- Prefer `opacity` and `transform` animations (GPU-accelerated) over `height`, `width`, `top`, `left`.
- For the message list: animate only the LATEST message/artifact. Older messages should already be in their final position.
- `will-change: transform` is applied automatically by Motion. No manual CSS needed.

---

### 5. Artifact Rendering Pattern

#### Type-Dispatch Architecture

```
SSE Event → { type: "artifact", artifactType: "group_card", payload: {...} }
                ↓
         ArtifactRenderer (switch on type)
                ↓
    ┌───────────┼───────────────┼──────────────────┐
    ↓           ↓               ↓                  ↓
GroupCard  ComparisonTable  SimulationResult   (future types)
```

#### ArtifactRenderer Component

```typescript
// src/components/chat/artifact-renderer.tsx
import type { Artifact } from '@/lib/chat/types';
import { GroupCard } from './artifacts/group-card';
import { ComparisonTable } from './artifacts/comparison-table';
import { SimulationResult } from './artifacts/simulation-result';

const ARTIFACT_COMPONENTS: Record<string, React.ComponentType<{ payload: any }>> = {
  group_card: GroupCard,
  comparison_table: ComparisonTable,
  simulation_result: SimulationResult,
};

export function ArtifactRenderer({ artifact }: { artifact: Artifact }) {
  const Component = ARTIFACT_COMPONENTS[artifact.type];
  if (!Component) {
    console.warn(`Unknown artifact type: ${artifact.type}`);
    return null;
  }
  return <Component payload={artifact.payload} />;
}
```

#### Artifact Payload Types (derived from adapter types)

```typescript
// src/lib/chat/types.ts

// Maps to GroupSummary from adapters/types.ts
interface GroupCardPayload {
  id: string;
  administradora: string;
  category: 'imovel' | 'auto' | 'servicos';
  creditValue: number;
  monthlyPayment: number;
  adminFeePercent: number;
  termMonths: number;
  availableSlots: number;
  contemplationRate: number;
}

// Array of groups for side-by-side comparison
interface ComparisonTablePayload {
  groups: GroupCardPayload[];
  highlightBestIndex?: number; // index of recommended group
}

// Maps to QuotaSimulation from adapters/types.ts
interface SimulationResultPayload {
  groupId: string;
  creditValue: number;
  monthlyPayment: number;
  adminFee: number;
  reserveFund: number;
  insurance: number;
  totalCost: number;
  termMonths: number;
  effectiveRate: number;
}
```

#### Backend Changes Needed (AGENT-07)

The route currently only sends `text-delta` events. To support artifacts, two changes are needed:

**1. Add presentation tools to the agent**

New tools that the agent calls to "present" data to the user. These tools don't fetch data — they package already-fetched data into artifact format:

```typescript
const presentGroupCard = tool(
  "present_group_card",
  "Apresenta um grupo de consórcio como card visual para o usuário. Use após buscar grupos com search_groups.",
  { /* GroupCardPayload schema */ },
  async (args) => {
    // Tool returns a special marker that the route intercepts
    return {
      content: [{ type: "text" as const, text: "✅ Card apresentado" }],
      _artifact: { type: "group_card", payload: args },
    };
  }
);
```

**2. Detect tool results with artifacts in the stream**

In the route's stream handler, check for `message.type === 'tool_result'` events. When a presentation tool is called, emit an `artifact` SSE event:

```typescript
// In route.ts stream handler
if (message.type === 'tool_use') {
  // The Agent SDK processes tool calls internally, 
  // but we can intercept presentation tool results
}

// Alternative: have presentation tools return a structured format
// that the agent's text response includes as JSON markers
```

**Alternative approach (simpler)**: Instead of separate presentation tools, use JSON markers in the agent's text response. The agent includes `:::artifact{type="group_card"}...:::` blocks in its text, and the frontend parser splits text and artifacts. However, this is fragile and conflates text generation with structured data. The presentation tool approach is more robust.

**Recommended approach**: Modify the route to intercept tool_use/tool_result events from the Agent SDK stream. When a tool with name starting with `present_` is called, emit an `artifact` SSE event with the tool's input as payload. The tool itself returns a simple confirmation text that the agent can reference.

---

### 6. Mobile-First Chat UX

#### Viewport Strategy

- **320px minimum**: iPhone SE (1st gen), small Android devices. All content must fit without horizontal scroll.
- **Container queries** over media queries where possible — components adapt to their container, not the viewport.
- **`dvh` for full-height**: Use `100dvh` (dynamic viewport height) to account for mobile browser chrome and virtual keyboard.

#### Layout Structure

```
┌─────────────────────────┐
│ Header (48px)           │  ← Compact: app name + minimal actions
├─────────────────────────┤
│                         │
│  Message List           │  ← flex-1, overflow-y-auto
│  (scroll area)          │
│                         │
│  ┌───────────────────┐  │
│  │ GroupCard          │  │  ← Full-width cards on mobile
│  └───────────────────┘  │
│                         │
│  ┌───────────────────┐  │
│  │ ComparisonTable    │  │  ← Horizontal scroll for table
│  └───────────────────┘  │
│                         │
├─────────────────────────┤
│ Chat Input (fixed)      │  ← Safe area padding for notch devices
└─────────────────────────┘
```

#### Critical Mobile Patterns

**1. Fixed Bottom Input with Virtual Keyboard**

```css
.chat-input-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--background);
  border-top: 1px solid var(--border);
}
```

The `env(safe-area-inset-bottom)` handles iPhone notch/home indicator. When the virtual keyboard opens, `visualViewport.height` changes — listen for this to scroll the message list up:

```typescript
useEffect(() => {
  const viewport = window.visualViewport;
  if (!viewport) return;
  
  const handleResize = () => {
    // Keyboard opened: viewport shrinks
    // Scroll message list to bottom
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'smooth',
    });
  };
  
  viewport.addEventListener('resize', handleResize);
  return () => viewport.removeEventListener('resize', handleResize);
}, []);
```

**2. Auto-scroll to Latest Message**

- Use `IntersectionObserver` on a sentinel element at the bottom of the message list.
- If the sentinel is visible (user is at bottom), auto-scroll on new messages.
- If user has scrolled up, do NOT auto-scroll — show a "new messages" pill button instead.
- During streaming, always auto-scroll (user hasn't scrolled up intentionally).

```typescript
const [isAtBottom, setIsAtBottom] = useState(true);
const sentinelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => setIsAtBottom(entry.isIntersecting),
    { threshold: 0.5 }
  );
  if (sentinelRef.current) observer.observe(sentinelRef.current);
  return () => observer.disconnect();
}, []);
```

**3. Auto-resize Textarea**

```typescript
const textareaRef = useRef<HTMLTextAreaElement>(null);

const handleInput = () => {
  const textarea = textareaRef.current;
  if (!textarea) return;
  textarea.style.height = 'auto'; // Reset
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`; // Max 5 lines
};
```

**4. Card Responsiveness**

- GroupCard: single column, full-width. Key info (credit, parcela) prominently displayed.
- ComparisonTable: horizontal scroll with sticky first column (group name). Table has `min-width` wider than viewport.
- SimulationResult: stacked layout. Monthly parcela large at top, breakdown items below in 2-column grid.

**5. Touch Interactions**

- GroupCard: `whileTap={{ scale: 0.98 }}` for press feedback (no hover on mobile).
- Minimum tap target: 44x44px (Apple HIG) / 48x48dp (Material).
- No swipe gestures in v1 — keep it simple.

#### Tailwind Breakpoints

```
320px  — base styles (mobile-first)
375px  — sm: slight spacing adjustments (iPhone standard)
640px  — md: two-column artifact layout if applicable
768px  — lg: wider message area, larger cards
1024px — xl: max-width constraint, comfortable reading width
```

Use Tailwind's default breakpoints (`sm:`, `md:`, etc.) but design from 320px up.

---

### 7. Dependencies to Install

#### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `zustand` | `^5.x` | Chat state management |
| `motion` | `^12.x` | Animations (AnimatePresence, layout, spring) |

#### shadcn Components to Add

```bash
npx shadcn@latest add input textarea table badge separator scroll-area skeleton tooltip
```

#### Already Installed (no action needed)

- `ai` (^6.0.158) — not used for `useChat`, but available
- `@ai-sdk/anthropic` (^3.0.69) — backend provider
- `@anthropic-ai/claude-agent-sdk` (^0.2.101) — agent backend
- `react` (19.2.4), `next` (16.2.3) — framework
- `zod` (^4.3.6) — validation
- `lucide-react` — icons
- `class-variance-authority`, `clsx`, `tailwind-merge` — styling utils

#### Install Commands

```bash
npm install zustand motion
npx shadcn@latest add input textarea table badge separator scroll-area skeleton tooltip
```

---

## Implementation Approach

### Execution Order

The implementation should follow this dependency chain:

1. **Types & Store first** — Define `ChatMessage`, `Artifact` types and the Zustand store with SSE parsing logic. This is the data foundation everything else builds on.

2. **SSE client + backend artifact events** — Extend `route.ts` to emit `artifact` SSE events when presentation tools are called. Build the `fetch` + `ReadableStream` parser in the store's `sendMessage` action. Add presentation tools to the agent.

3. **Chat layout shell** — Use `/iui` with `application-shell` for inspiration. Build the container: header, scrollable message area, fixed bottom input. Mobile-first.

4. **MessageList + ChatInput** — Message bubbles (user right-aligned, assistant left-aligned). Auto-resize textarea. Send on Enter. Streaming indicator.

5. **Artifact components** — GroupCard, ComparisonTable, SimulationResult. Each refined via `/rui`. Type-dispatch renderer.

6. **Animations** — Motion v12 enter/exit on messages and artifacts. Streaming dots. Stagger on multiple cards.

7. **Mobile polish** — Test at 320px, virtual keyboard handling, safe-area padding, scroll behavior.

### File Structure

```
src/
├── lib/
│   └── chat/
│       ├── types.ts           # ChatMessage, Artifact, payload types
│       ├── store.ts           # Zustand store with SSE logic
│       └── use-chat.ts        # Thin hook wrapper
├── components/
│   ├── ui/                    # Base shadcn components (existing)
│   └── chat/
│       ├── chat-layout.tsx    # Full-screen layout shell
│       ├── message-list.tsx   # Scrollable message container
│       ├── chat-message.tsx   # Single message bubble
│       ├── chat-input.tsx     # Auto-resize input + send
│       ├── streaming-dots.tsx # Animated typing indicator
│       ├── artifact-renderer.tsx  # Type-dispatch
│       └── artifacts/
│           ├── group-card.tsx
│           ├── comparison-table.tsx
│           └── simulation-result.tsx
├── app/
│   ├── chat/
│   │   └── page.tsx           # Chat page (or use root page.tsx)
│   └── api/
│       └── chat/
│           └── route.ts       # Extended with artifact events
└── lib/
    └── agent/
        └── tools/
            ├── index.ts       # Extended with presentation tools
            └── presentation.ts # present_group_card, present_comparison, etc.
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Agent SDK `query()` doesn't expose tool_use events granularly** | Can't intercept presentation tool calls to emit artifacts | Alternative: have presentation tools return JSON with a marker prefix that the route detects in the text content. Or use a callback/event hook if the SDK supports it. |
| **SSE parsing bugs with chunked responses** | Broken JSON, lost events, garbled text | Comprehensive buffer handling in SSE parser. Unit test the parser with various chunk patterns. |
| **Virtual keyboard pushes content off-screen on mobile** | Poor UX on the primary target device | Use `visualViewport` API to detect keyboard. Apply `dvh` units. Test on real iOS/Android devices. |
| **Motion animations cause jank on low-end mobile** | Stuttery card animations | Use only GPU-composited properties (transform, opacity). Add `will-change` hints. Reduce animation complexity on `prefers-reduced-motion`. |
| **shadcn/studio Pro MCP server unavailable or blocks don't match needs** | Can't follow the mandatory Pro block workflow | Fall back to base shadcn components and manual Tailwind styling. Document which components were refined vs created manually. |
| **Large message lists cause scroll performance issues** | Slow rendering with 50+ messages | Virtualize the message list with `IntersectionObserver`-based lazy rendering or a windowing library if needed. For MVP, 50-100 messages should be fine without virtualization. |
| **Agent doesn't call presentation tools consistently** | Artifacts appear sometimes but not always | Strengthen the system prompt with explicit instructions to ALWAYS use presentation tools when showing financial data. Add few-shot examples. |

---

## RESEARCH COMPLETE

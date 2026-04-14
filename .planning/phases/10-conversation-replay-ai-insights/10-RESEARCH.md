# Phase 10: Conversation Replay & AI Insights - Research

**Researched:** 2026-04-14
**Domain:** Admin panel — conversation viewer + AI-powered lead insights
**Confidence:** HIGH

## Summary

Phase 10 adds a slide-over detail panel to the existing Kanban board. When an admin clicks a lead card, a Sheet opens with two tabs: "Conversa" (message timeline with inline artifact previews) and "Insights" (AI-generated analysis via Claude Haiku). The data model is fully in place -- `messages`, `artifacts`, `leads`, and `lead_insights` tables all exist with proper relations. The main work is UI (Sheet + Tabs + timeline + compact artifact previews) and two new API routes (conversation fetch + insight generation).

The existing codebase already has: Sheet component installed, artifact payload types defined, artifact renderer pattern, `requireRole()` for API protection, and `@ai-sdk/anthropic` for Claude API calls. The Tabs component needs to be installed via `npx shadcn@latest add tabs`. The `generateText` function from `ai` SDK will be used for the Haiku insight call (non-streaming, structured output).

**Primary recommendation:** Build the Sheet panel as a controlled component in KanbanBoard, pass an `onLeadClick` callback through KanbanColumn to LeadCard, and use two simple API routes that leverage existing Drizzle relations for data fetching and AI SDK `generateText` for insight generation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Clicking a lead card opens a slide-over panel (Sheet) on right side -- NOT a new page, NOT a modal
- D-02: Panel shows two tabs: "Conversa" (conversation replay) and "Insights" (AI analysis)
- D-03: Panel header shows lead name, stage badge, channel icon, and created date
- D-04: Panel has close button and clicking outside closes it
- D-05: Messages render in chat-like timeline with role indicators (user left/blue, assistant right/gray)
- D-06: Each message shows timestamp (relative, e.g. "ha 2h")
- D-07: Artifacts render inline as compact visual previews -- NOT full interactive components
- D-08: Artifact previews show type icon + key info (e.g. "Simulacao: R$ 800/mes, 60 meses, Bevi")
- D-09: Messages fetched via GET /api/admin/leads/[id]/conversation
- D-10: Conversation auto-scrolls to bottom on open
- D-11: Insights generated on-demand when admin opens "Insights" tab first time
- D-12: Claude API extracts: detected intent, estimated budget, key objections, recommended next action
- D-13: Insights cached in lead_insights table -- one row per insight type per lead
- D-14: Cache TTL 1 hour -- if cached and < 1hr old, use cached; otherwise regenerate
- D-15: API route: POST /api/admin/leads/[id]/insights
- D-16: Use Claude Haiku for insight generation via @ai-sdk/anthropic
- D-17: Insights display as cards: Intent, Budget, Objections, Next Action -- each with icon and formatted content

### Claude's Discretion
- Exact prompt for insight generation (must extract: intent, budget, objections, next_action)
- Visual design of insight cards
- Loading states during insight generation
- Error handling if Claude API fails
- Conversation timeline visual details

### Deferred Ideas (OUT OF SCOPE)
- Full interactive artifact replay (click to expand)
- Insight history/versioning
- Conversation export (PDF/email)
- Real-time conversation monitoring (live feed)
- Sentiment analysis timeline
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BACK-07 | Replay completo de conversa -- timeline de mensagens com artifacts inline | Drizzle relational query (conversations -> messages -> artifacts) provides all data. Sheet + ScrollArea + custom timeline component. Compact artifact preview components. |
| BACK-08 | Insights AI por conversa -- resumo automatico: intencao, orcamento, objecoes, proxima acao sugerida | `generateText` from AI SDK with `@ai-sdk/anthropic` provider using `claude-haiku-3-5-latest`. Cached in `lead_insights` table with 1hr TTL. |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | 6.0.159 | `generateText` for Haiku insight calls | Already in project, non-streaming structured output [VERIFIED: npm view] |
| `@ai-sdk/anthropic` | 3.0.69 | Anthropic provider for AI SDK | Already in project, creates Claude model instances [VERIFIED: npm view] |
| `drizzle-orm` | 0.45.2 | Relational queries for conversation + messages + artifacts | Already in project, relations defined in schema [VERIFIED: codebase] |
| `date-fns` | 4.1.0 | Relative timestamps (`formatDistanceToNow`) | Already used in lead-card.tsx [VERIFIED: codebase] |

### Components (already installed)
| Component | Status | Purpose |
|-----------|--------|---------|
| `Sheet` | Installed | Slide-over panel [VERIFIED: src/components/ui/sheet.tsx] |
| `ScrollArea` | Installed | Scrollable message timeline [VERIFIED: src/components/ui/] |
| `Badge` | Installed | Stage badge in panel header [VERIFIED: src/components/ui/] |
| `Skeleton` | Installed | Loading states [VERIFIED: src/components/ui/] |
| `Card` | Installed | Insight cards [VERIFIED: src/components/ui/] |
| `Separator` | Installed | Visual dividers [VERIFIED: src/components/ui/] |

### Components (need installation)
| Component | Status | Purpose |
|-----------|--------|---------|
| `Tabs` | **NOT installed** | Two-tab panel (Conversa / Insights) |

**Installation:**
```bash
npx shadcn@latest add tabs
```
[VERIFIED: dry-run confirmed `src/components/ui/tabs.tsx` will be created]

### No Alternatives Needed
All libraries are locked decisions from CLAUDE.md. No alternatives to evaluate.

## Architecture Patterns

### New Files Structure
```
src/
├── app/api/admin/leads/[id]/
│   ├── conversation/
│   │   └── route.ts            # GET - fetch messages + artifacts
│   └── insights/
│       └── route.ts            # POST - generate/return AI insights
├── components/admin/pipeline/
│   ├── lead-detail-panel.tsx   # Sheet wrapper with tabs
│   ├── conversation-timeline.tsx # Message list with artifact previews
│   ├── artifact-preview.tsx    # Compact read-only artifact summary
│   └── insight-cards.tsx       # AI insight display cards
└── lib/admin/
    └── insights-prompt.ts      # Prompt template for Claude Haiku
```
[ASSUMED -- file structure is Claude's discretion]

### Pattern 1: Controlled Sheet via State Lifting
**What:** KanbanBoard manages `selectedLeadId` state. When set, Sheet opens. LeadCard gets `onClick` prop.
**When to use:** When a child component needs to trigger a panel that lives at the parent level.
**Why:** Sheet must be rendered outside the DragDropContext to avoid z-index/portal conflicts with drag-and-drop.

```typescript
// In kanban-board.tsx
const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
const selectedLead = selectedLeadId
  ? Object.values(columns).flat().find(l => l.id === selectedLeadId) ?? null
  : null;

// Pass to KanbanColumn, which passes to LeadCard
<KanbanColumn onLeadClick={setSelectedLeadId} />

// Render Sheet outside DragDropContext
<LeadDetailPanel
  lead={selectedLead}
  open={!!selectedLeadId}
  onClose={() => setSelectedLeadId(null)}
/>
```
[VERIFIED: existing Sheet uses `@base-ui/react/dialog` which supports controlled `open` prop]

### Pattern 2: Drizzle Relational Query for Conversation Data
**What:** Single query fetches lead -> conversation -> messages (ordered) -> artifacts.
**Why:** Drizzle relations are already defined. One round-trip to DB.

```typescript
// GET /api/admin/leads/[id]/conversation
const lead = await db.query.leads.findFirst({
  where: eq(leads.id, leadId),
  with: {
    conversation: {
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
          with: {
            artifacts: true,
          },
        },
      },
    },
  },
});
```
[VERIFIED: relations defined in schema.ts -- leads -> conversation, conversations -> messages, messages -> artifacts]

### Pattern 3: AI SDK generateText for Structured Insights
**What:** Use `generateText` (not `streamText`) with Claude Haiku for insight generation. Non-streaming because insights are short and we want the full result atomically.
**Why:** Insights are a batch analysis, not a conversational stream. `generateText` returns the complete response.

```typescript
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic();

const { text } = await generateText({
  model: anthropic("claude-haiku-3-5-latest"),
  system: INSIGHTS_SYSTEM_PROMPT,
  prompt: buildInsightPrompt(conversationMessages),
});

// Parse structured JSON from response
const insights = JSON.parse(text);
```
[VERIFIED: `ai` package exports `generateText`, `@ai-sdk/anthropic` is installed and used in route.ts]

### Pattern 4: Cache-First with TTL Check
**What:** Check `lead_insights` table first. If entries exist and `generatedAt` < 1hr ago, return cached. Otherwise call Claude and upsert.
**Why:** Avoids redundant API calls. 1hr TTL balances freshness with cost.

```typescript
const cached = await db.query.leadInsights.findMany({
  where: eq(leadInsights.leadId, leadId),
});

const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
const isStale = cached.length === 0 || cached.some(i => i.generatedAt < oneHourAgo);

if (!isStale) return cached;

// Delete old + insert fresh
await db.delete(leadInsights).where(eq(leadInsights.leadId, leadId));
// ... generate + insert new insights
```
[VERIFIED: `lead_insights` table has `generatedAt` timestamp and `insightType` enum with intent/budget/objections/next_action/summary]

### Anti-Patterns to Avoid
- **Rendering full interactive artifacts in the replay:** Decision D-07 explicitly says compact previews only. Do NOT reuse ArtifactRenderer -- build lightweight summary components.
- **Streaming insights:** Don't use `streamText` for insight generation. The response is short (~200 tokens) and the admin needs the complete analysis, not partial streaming.
- **Separate page for lead details:** Decision D-01 locks this as a Sheet slide-over, not a page navigation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slide-over panel | Custom positioned div with transitions | shadcn/ui Sheet | Handles focus trap, escape key, overlay, animations, portal rendering |
| Tab switching | Manual state + conditional rendering | shadcn/ui Tabs | Accessible tab pattern with keyboard navigation (ARIA) |
| Scrollable timeline | Overflow div | shadcn/ui ScrollArea | Cross-browser custom scrollbar, consistent styling |
| Relative timestamps | Manual date math | `date-fns/formatDistanceToNow` with `ptBR` locale | Already used in lead-card.tsx, handles all edge cases |
| Structured AI output | String parsing with regex | JSON mode in prompt + `JSON.parse` | Claude Haiku handles JSON output reliably when prompted correctly |

## Common Pitfalls

### Pitfall 1: Sheet Conflicts with Drag-and-Drop
**What goes wrong:** Opening a Sheet inside a Draggable or Droppable can break drag-and-drop or cause z-index issues.
**Why it happens:** Sheet portals to document body, which can interfere with hello-pangea/dnd's portal handling.
**How to avoid:** Render LeadDetailPanel at the KanbanBoard level, outside the DragDropContext. The Sheet's `open` state should be controlled by KanbanBoard.
**Warning signs:** Drag stops working after opening/closing the panel, or the panel appears behind the board.

### Pitfall 2: LeadCard onClick Fires During Drag
**What goes wrong:** Clicking a card to open details also triggers at the end of a drag operation.
**Why it happens:** `mouseup` after drag fires the `onClick` handler.
**How to avoid:** Track `isDragging` state. In the `onClick` handler, skip if the card was just dragged. The existing `isDragging` prop from `dragSnapshot.isDragging` can be used -- store it in a ref and check on click.
**Warning signs:** Panel opens unexpectedly after dropping a card.

### Pitfall 3: Claude Haiku JSON Output Parsing Failures
**What goes wrong:** Claude returns malformed JSON or wraps it in markdown code blocks.
**Why it happens:** Without explicit instructions, Claude sometimes adds ```json wrappers or explanatory text.
**How to avoid:** Use a clear system prompt: "Respond with ONLY valid JSON, no markdown, no explanation." Add try/catch with a retry or fallback. Strip markdown fences before parsing.
**Warning signs:** `JSON.parse` throws SyntaxError in production.

### Pitfall 4: N+1 Query for Conversation Messages
**What goes wrong:** Fetching messages then artifacts separately per message.
**Why it happens:** Not using Drizzle's `with` clause for nested relations.
**How to avoid:** Use single relational query with nested `with` as shown in Pattern 2.
**Warning signs:** Slow API response for conversations with many messages.

### Pitfall 5: Missing Lead-to-Conversation Link
**What goes wrong:** API returns 404 for leads that have a conversation.
**Why it happens:** The lead's `conversationId` references a conversation, but the query path goes through the lead first. If the conversation was deleted or the lead has no conversation, the join fails.
**How to avoid:** Always check that `lead.conversation` exists in the API response. Return appropriate error message.
**Warning signs:** Empty conversation panel for leads that clearly had interactions.

## Code Examples

### Compact Artifact Preview Component
```typescript
// Source: Derived from existing artifact types in src/lib/chat/types.ts
import { BarChart3, Calculator, Star, Users } from "lucide-react";

const ARTIFACT_ICONS: Record<string, typeof BarChart3> = {
  group_card: Users,
  simulation_result: Calculator,
  recommendation_card: Star,
  comparison_table: BarChart3,
};

const ARTIFACT_LABELS: Record<string, string> = {
  group_card: "Grupo",
  simulation_result: "Simulacao",
  recommendation_card: "Recomendacao",
  comparison_table: "Comparacao",
};

function getArtifactSummary(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "group_card":
      return `${payload.administradora} - ${formatBRL(payload.creditValue as number)} (${payload.termMonths} meses)`;
    case "simulation_result":
      return `${formatBRL(payload.monthlyPayment as number)}/mes, ${payload.termMonths} meses`;
    case "recommendation_card":
      return `${payload.administradora} - Score ${((payload.score as number) * 100).toFixed(0)}%`;
    case "comparison_table": {
      const groups = payload.groups as Array<Record<string, unknown>>;
      return `${groups?.length ?? 0} grupos comparados`;
    }
    default:
      return type;
  }
}
```
[VERIFIED: payload shapes match types in src/lib/chat/types.ts]

### Insight Generation Prompt
```typescript
// Source: Claude's discretion per CONTEXT.md
const INSIGHTS_SYSTEM_PROMPT = `Voce e um analista de vendas de consorcio.
Analise a conversa entre um cliente e um agente de IA de consorcio.
Extraia insights estruturados em JSON.

Responda APENAS com JSON valido, sem markdown, sem explicacao.

Formato:
{
  "intent": "descricao da intencao do cliente (o que quer comprar, prazo, etc)",
  "budget": {
    "monthly": number ou null,
    "total": number ou null,
    "notes": "observacoes sobre capacidade financeira"
  },
  "objections": ["objecao 1", "objecao 2"] ou [],
  "next_action": "acao recomendada para o vendedor"
}`;
```
[ASSUMED -- prompt content is Claude's discretion]

### API Route with requireRole and Cache TTL
```typescript
// Source: Pattern from existing src/app/api/admin/leads/[id]/stage/route.ts
import { requireRole } from "@/lib/admin/require-role";
import { db } from "@/db";
import { leadInsights, leads, messages } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("admin", "viewer");
  if (error) return error;

  const { id: leadId } = await params;
  // ... TTL check + generate logic
}
```
[VERIFIED: `requireRole` pattern matches existing usage in leads API routes]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Not yet configured |
| Config file | None -- Wave 0 setup needed |
| Quick run command | TBD |
| Full suite command | TBD |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BACK-07 | Conversation API returns messages with artifacts ordered by date | integration | TBD | -- Wave 0 |
| BACK-07 | Artifact previews render correct summary text | unit | TBD | -- Wave 0 |
| BACK-08 | Insights API returns cached data when < 1hr | integration | TBD | -- Wave 0 |
| BACK-08 | Insights API regenerates when cache > 1hr | integration | TBD | -- Wave 0 |
| BACK-08 | Insights API requires admin/viewer role | integration | TBD | -- Wave 0 |

### Wave 0 Gaps
- [ ] Test framework setup (vitest recommended for Next.js)
- [ ] Test utilities for Drizzle mock/test DB
- [ ] API route test helpers

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireRole()` checks session via Better Auth |
| V4 Access Control | yes | Both API routes gated with `requireRole("admin", "viewer")` |
| V5 Input Validation | yes | Lead ID validated as UUID format before DB query |
| V6 Cryptography | no | No crypto operations in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized access to conversation data | Information Disclosure | `requireRole()` on both API routes |
| Lead ID enumeration | Information Disclosure | UUID format (non-sequential), auth required |
| Prompt injection via stored messages | Tampering | Insights prompt uses messages as data context, not as instructions. System prompt is separate. |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateText` with string parsing | `generateText` with JSON output mode | AI SDK 6 | Cleaner structured output |
| `framer-motion` for panel animations | shadcn/ui Sheet (built-in transitions) | shadcn CLI v4 | No need for custom animation |
| Radix Dialog for sheets | `@base-ui/react/dialog` | shadcn v4 (March 2026) | Already migrated in codebase |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | File structure for new components | Architecture Patterns | Low -- purely organizational, easy to adjust |
| A2 | Insights prompt content | Code Examples | Low -- prompt is Claude's discretion, can iterate |
| A3 | `claude-haiku-3-5-latest` is the correct model string for Haiku via AI SDK | Architecture Patterns | Medium -- if model string differs, API call fails; easy to fix |

## Open Questions

1. **Should `viewer` role see insights or only conversation?**
   - What we know: `requireRole("admin", "viewer")` pattern used in existing routes
   - What's unclear: Whether insight generation (which costs API credits) should be available to viewers
   - Recommendation: Allow both roles to see cached insights, but only admins can trigger regeneration. Or simpler: both can access (consistent with existing pattern).

2. **What happens when a lead has no conversation messages?**
   - What we know: A lead always has a `conversationId`, but the conversation might have 0 messages (edge case)
   - What's unclear: Should insights tab show "Nenhuma mensagem" or be disabled?
   - Recommendation: Show empty state "Nenhuma mensagem para analisar" and disable the generate button.

## Sources

### Primary (HIGH confidence)
- `src/db/schema.ts` -- Full schema with relations for leads, messages, artifacts, lead_insights
- `src/app/api/chat/route.ts` -- How messages and artifacts are persisted
- `src/components/admin/pipeline/lead-card.tsx` -- Current LeadCard with placeholder onClick
- `src/components/admin/pipeline/kanban-board.tsx` -- Current board structure with DragDropContext
- `src/components/ui/sheet.tsx` -- Sheet uses @base-ui/react/dialog, supports controlled open prop
- `src/lib/admin/require-role.ts` -- API protection pattern

### Secondary (MEDIUM confidence)
- npm registry -- `@ai-sdk/anthropic@3.0.69`, `ai@6.0.159` current versions
- shadcn CLI dry-run -- Tabs component installation confirmed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in codebase
- Architecture: HIGH -- patterns derived from existing code, schema fully defined
- Pitfalls: HIGH -- based on known interactions between hello-pangea/dnd and portaled UI

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable domain, no fast-moving dependencies)

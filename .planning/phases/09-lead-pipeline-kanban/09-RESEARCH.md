# Phase 9: Lead Pipeline Kanban - Research

**Researched:** 2026-04-14
**Domain:** Drag-and-drop Kanban board, API routes, auto-transitions
**Confidence:** HIGH

## Summary

This phase builds a Kanban pipeline board at `/admin/pipeline` with drag-and-drop between 7 funnel stages, lead cards with summary info, client-side filters with URL state, and automatic stage transitions triggered by chat tool executions. The foundation is solid: the `leads`, `lead_events`, and `lead_stage` enum already exist in the DB schema, the admin layout shell with sidebar and auth is complete, and `requireRole()` protects API routes.

Two critical schema issues were found: (1) `lead_events.actorId` is typed as `uuid` but Better Auth user IDs are `text` -- a migration is required before admin drag-and-drop can log the actor, and (2) the `leads` table has no `creditValue` column -- credit value must be extracted from conversation artifacts via a join query. Both need to be addressed in Wave 0.

**Primary recommendation:** Fix the schema mismatch first (actorId uuid->text), then build API routes, then the Kanban UI with `@hello-pangea/dnd`, and finally wire auto-transitions into the chat route.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Use `@hello-pangea/dnd` for drag-and-drop
- D-02: 7 funnel stages as Kanban columns: Novo, Engajado, Qualificado, Em Negociacao, Proposta Enviada, Fechado Ganho, Perdido
- D-03: Drag triggers DB update + lead_events insert + optimistic UI
- D-04: Card shows name, channel icon, time in stage, credit value, last interaction
- D-05: Card click does nothing for now (toast "Em breve")
- D-06: Cards ordered by most recent first within columns
- D-07: Card count badge on column headers
- D-08/09/10: Auto-transitions: capture_lead->novo, simulate_quota->engajado, recommend_groups->qualificado
- D-11: Transitions only advance forward, never regress
- D-12: Auto-transitions create lead_events with actor_type='system'
- D-13: Auto-transition logic in /api/chat/route.ts after tool execution
- D-14: GET /api/admin/leads returns all leads grouped by stage
- D-15: PATCH /api/admin/leads/[id]/stage for manual transitions
- D-16: Polling every 30 seconds
- D-17: Optimistic UI updates on drag, revert on error
- D-18: Filter bar with channel dropdown, date range picker, text search
- D-19: Client-side filtering (no server-side for MVP)
- D-20: Filter state in URL via nuqs
- D-21: Manual transitions logged to lead_events with admin user ID
- D-22: lead_events table serves as audit log (BSEC-03)

### Claude's Discretion
- Card visual design (colors, shadows, spacing)
- Column header styling and stage colors
- Loading states and skeleton UI
- Empty state messaging per column
- Drag animation and drop indicators

### Deferred Ideas (OUT OF SCOPE)
- Real-time updates via WebSocket/SSE
- Bulk actions
- Lead assignment to specific admins
- Stage-specific action buttons
- Lead scoring/priority indicators
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BACK-04 | Kanban board with drag-and-drop for lead stage management | @hello-pangea/dnd v18.0.1 with DragDropContext/Droppable/Draggable pattern |
| BACK-05 | Lead cards with summary (name, channel, stage, time in stage, credit value) | Requires artifact join query for credit value; date-fns for relative time |
| BACK-06 | Filters by channel, stage, date, text search | nuqs for URL state; client-side filtering on fetched data |
| BACK-09 | Auto stage transitions based on chat events | Tool name detection in chat route after tool-call stream events |
| BSEC-03 | Audit log of backoffice actions | lead_events table with actorType/actorId; requires actorId schema fix |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @hello-pangea/dnd | 18.0.1 | Drag-and-drop | Maintained fork of react-beautiful-dnd; supports React 19 (`^18.0.0 \|\| ^19.0.0` peer dep); simple API for list-based DnD; accessibility built-in |
| nuqs | 2.8.9 | URL state management | Type-safe URL search params for Next.js App Router; useQueryState hook; shareable filtered views |

[VERIFIED: npm registry -- `npm view @hello-pangea/dnd@18.0.1 peerDependencies` confirms React 19 support]
[VERIFIED: npm registry -- `npm view nuqs version` returns 2.8.9]

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | (in CLAUDE.md stack) | Relative time display | "2h ago", "3d ago" on cards |
| lucide-react | installed | Icons | Globe (web), Smartphone (whatsapp), Filter, Search |
| shadcn/ui | CLI v4 | UI components | Card, Badge, Input, Select, Skeleton |
| drizzle-orm | 0.45.x | DB queries | Leads + events + artifacts queries |
| zod | 4.3.x | Validation | API route input validation |

### Components to Install
| Component | Purpose | Install Command |
|-----------|---------|-----------------|
| Select | Channel dropdown filter | `npx shadcn@latest add select` |
| Popover | Date range picker container | `npx shadcn@latest add popover` |
| Calendar | Date range selection | `npx shadcn@latest add calendar` |
| ScrollArea | Horizontal scroll on mobile for Kanban columns | `npx shadcn@latest add scroll-area` |

Note: `scroll-area` is already installed. Select, Popover, and Calendar are not.

**Installation:**
```bash
npm install @hello-pangea/dnd nuqs date-fns
npx shadcn@latest add select popover calendar
```

Note: `date-fns` is listed in CLAUDE.md recommended stack but is NOT currently in package.json. [VERIFIED: checked package.json]

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/admin/(dashboard)/pipeline/
│   └── page.tsx                    # Server component → wraps client KanbanBoard
├── components/admin/pipeline/
│   ├── kanban-board.tsx            # "use client" — DragDropContext + columns + polling
│   ├── kanban-column.tsx           # Droppable column with header + card count
│   ├── lead-card.tsx               # Draggable card with lead summary
│   └── pipeline-filters.tsx        # Filter bar with nuqs state
├── app/api/admin/leads/
│   ├── route.ts                    # GET — all leads with stage grouping
│   └── [id]/stage/
│       └── route.ts                # PATCH — manual stage transition
└── lib/admin/
    └── lead-transitions.ts         # Shared transition logic (used by chat route + API)
```

### Pattern 1: DragDropContext with Optimistic Updates
**What:** Kanban board using @hello-pangea/dnd with local state for optimistic UI
**When to use:** Any drag-and-drop between columns
**Example:**
```typescript
// Source: @hello-pangea/dnd docs + marmelab kanban pattern
"use client";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

function KanbanBoard() {
  const [columns, setColumns] = useState<Record<string, Lead[]>>(initialState);

  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Optimistic update
    const prev = structuredClone(columns);
    const sourceCol = [...columns[source.droppableId]];
    const [moved] = sourceCol.splice(source.index, 1);
    moved.stage = destination.droppableId as LeadStage;
    const destCol = [...(columns[destination.droppableId] || [])];
    destCol.splice(destination.index, 0, moved);
    setColumns({ ...columns, [source.droppableId]: sourceCol, [destination.droppableId]: destCol });

    // API call — revert on failure
    try {
      await fetch(`/api/admin/leads/${draggableId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage: destination.droppableId }),
      });
    } catch {
      setColumns(prev); // Revert
    }
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      {stages.map(stage => (
        <Droppable droppableId={stage} key={stage}>
          {(provided, snapshot) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {columns[stage]?.map((lead, index) => (
                <Draggable draggableId={lead.id} index={index} key={lead.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                      <LeadCard lead={lead} isDragging={snapshot.isDragging} />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      ))}
    </DragDropContext>
  );
}
```

### Pattern 2: nuqs Filter State
**What:** Persist filter state in URL for shareable views
**When to use:** Filter bar on Kanban board
**Example:**
```typescript
// Source: nuqs docs (nuqs.dev)
"use client";
import { useQueryState, parseAsStringEnum, parseAsString } from "nuqs";

const channels = ["all", "web", "whatsapp"] as const;

function PipelineFilters() {
  const [channel, setChannel] = useQueryState("channel",
    parseAsStringEnum(channels).withDefault("all")
  );
  const [search, setSearch] = useQueryState("q",
    parseAsString.withDefault("")
  );
  // date range: use parseAsIsoDate or parseAsString for from/to
}
```

**Important:** Requires `NuqsAdapter` in root layout:
```typescript
// src/app/layout.tsx (or admin layout)
import { NuqsAdapter } from "nuqs/adapters/next/app";

export default function Layout({ children }) {
  return <NuqsAdapter>{children}</NuqsAdapter>;
}
```
[CITED: nuqs.dev docs]

### Pattern 3: Shared Transition Logic
**What:** Extract stage transition logic into a shared module used by both the chat route and the admin API
**When to use:** Prevents code duplication between auto-transitions and manual transitions
**Example:**
```typescript
// src/lib/admin/lead-transitions.ts
import { db } from "@/db";
import { leads, leadEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

const STAGE_ORDER = ["novo","engajado","qualificado","em_negociacao","proposta_enviada","fechado_ganho","perdido"] as const;

export async function transitionLeadStage(
  leadId: string,
  toStage: typeof STAGE_ORDER[number],
  actor: { type: "system" | "admin"; id?: string },
  options?: { onlyAdvance?: boolean }
) {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return null;

  // Only advance forward check
  if (options?.onlyAdvance) {
    const currentIdx = STAGE_ORDER.indexOf(lead.stage);
    const targetIdx = STAGE_ORDER.indexOf(toStage);
    if (targetIdx <= currentIdx) return lead; // No-op
  }

  await db.update(leads).set({ stage: toStage, updatedAt: new Date() }).where(eq(leads.id, leadId));
  await db.insert(leadEvents).values({
    leadId,
    fromStage: lead.stage,
    toStage,
    actorType: actor.type,
    actorId: actor.id ?? null,
  });

  return { ...lead, stage: toStage };
}
```

### Anti-Patterns to Avoid
- **Duplicating transition logic:** Don't write stage update code in both chat route and API route. Use shared `transitionLeadStage()`.
- **Server Component DnD:** `@hello-pangea/dnd` requires `"use client"` -- the page.tsx can be a Server Component that wraps the client Kanban component.
- **Polling without cleanup:** Always clear the interval on unmount to prevent memory leaks and duplicate fetches.
- **Filtering on server for MVP:** With low lead volume, fetching all leads and filtering client-side is simpler and avoids complex query building.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop | Custom drag handlers | @hello-pangea/dnd | Accessibility, touch support, animation, keyboard support |
| URL state sync | Manual searchParams parsing | nuqs | Type safety, history management, serialization |
| Relative time | Custom time-ago function | date-fns `formatDistanceToNow` | i18n, edge cases (just now, minutes, hours, days) |
| Date picker | Custom calendar | shadcn/ui Calendar + Popover | Accessibility, range selection, keyboard nav |
| Select dropdown | Custom dropdown | shadcn/ui Select | Accessibility, keyboard nav, mobile support |

## Common Pitfalls

### Pitfall 1: actorId UUID vs Better Auth Text ID
**What goes wrong:** `lead_events.actorId` is `uuid("actor_id")` but Better Auth user IDs are `text` (not UUID format). Inserting a text ID into a UUID column will throw a PostgreSQL type error.
**Why it happens:** The schema was created in Phase 8 before the Better Auth ID format was fully considered.
**How to avoid:** Migrate `actorId` from `uuid` to `text` in the schema before implementing drag-and-drop logging.
**Warning signs:** `invalid input syntax for type uuid` errors when logging admin actions.

### Pitfall 2: Credit Value Not on Leads Table
**What goes wrong:** D-04 requires showing credit value on lead cards, but the `leads` table only has name, phone, email, stage, timestamps.
**Why it happens:** Credit value lives in artifact payloads (JSONB in `artifacts` table) as `creditValue` on recommendation_card or simulation_result artifacts.
**How to avoid:** The GET /api/admin/leads query must join through `leads -> conversations -> messages -> artifacts` and extract the latest `creditValue` from artifact payloads. Alternatively, add a `creditValue` column to leads and populate it during capture_lead or auto-transition.
**Warning signs:** Empty credit value fields on all lead cards.

### Pitfall 3: DragDropContext Must Be Client Component
**What goes wrong:** Using @hello-pangea/dnd in a Server Component causes hydration errors.
**Why it happens:** DnD requires browser APIs and React context.
**How to avoid:** Mark the Kanban board component with `"use client"`. The page.tsx can remain a Server Component that imports the client component.
**Warning signs:** Hydration mismatch errors, `window is not defined`.

### Pitfall 4: Strict Mode Double-Render
**What goes wrong:** @hello-pangea/dnd can behave unexpectedly with React Strict Mode's double-invocation of effects.
**Why it happens:** Strict Mode in development mounts/unmounts components twice.
**How to avoid:** This is a known non-issue in production. If dev mode causes visual glitches, test in production build.
**Warning signs:** Drag-and-drop works inconsistently in development only.

### Pitfall 5: NuqsAdapter Missing
**What goes wrong:** `useQueryState` throws an error about missing adapter.
**Why it happens:** nuqs requires a provider wrapper in the layout.
**How to avoid:** Add `<NuqsAdapter>` in the admin dashboard layout (or root layout).
**Warning signs:** Runtime error: "Missing NuqsAdapter" or similar.

### Pitfall 6: Polling Stale Closures
**What goes wrong:** setInterval callback captures stale filter state, causing filtered view to reset on each poll.
**Why it happens:** JavaScript closure captures the filter values at interval creation time.
**How to avoid:** Use `useRef` for filter values or re-create interval when filters change. Or use `useCallback` with proper dependencies.
**Warning signs:** Filters appear to "reset" every 30 seconds.

## Code Examples

### GET /api/admin/leads Query Pattern
```typescript
// Source: Drizzle ORM docs + project schema
import { db } from "@/db";
import { leads, conversations, messages, artifacts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

// Fetch leads with conversation metadata
const allLeads = await db.query.leads.findMany({
  orderBy: [desc(leads.updatedAt)],
  with: {
    conversation: {
      columns: { channel: true, createdAt: true, updatedAt: true },
    },
  },
});

// For credit value, fetch latest artifact per lead's conversation
// Option A: Separate query for artifacts (simpler)
// Option B: Add creditValue to leads table (recommended for performance)
```

### PATCH Stage Transition with Auth
```typescript
// Source: project patterns (requireRole)
import { requireRole } from "@/lib/admin/require-role";
import { transitionLeadStage } from "@/lib/admin/lead-transitions";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRole("admin");
  if (error) return error;

  const { id } = await params;
  const { stage } = await req.json();
  // Validate stage is valid enum value with zod

  const result = await transitionLeadStage(id, stage, {
    type: "admin",
    id: session!.user.id,
  });

  return Response.json(result);
}
```

### Auto-Transition in Chat Route
```typescript
// Source: project chat route pattern
// In src/app/api/chat/route.ts, inside the stream processing loop:
case "tool-call": {
  // After existing presentation tool handling...
  
  // Auto-transition logic
  const TOOL_TRANSITIONS: Record<string, string> = {
    capture_lead: "novo",
    simulate_quota: "engajado",
    recommend_groups: "qualificado",
  };
  
  const targetStage = TOOL_TRANSITIONS[part.toolName];
  if (targetStage && conversationId) {
    // Find lead for this conversation
    const lead = await db.query.leads.findFirst({
      where: eq(leads.conversationId, conversationId),
    });
    if (lead) {
      await transitionLeadStage(lead.id, targetStage, 
        { type: "system" }, 
        { onlyAdvance: true }
      );
    }
  }
  break;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd | @hello-pangea/dnd | 2023 (fork) | Drop-in replacement, React 18/19 support |
| Manual URL parsing | nuqs | 2024+ | Type-safe, framework-aware URL state |
| useSearchParams (Next.js) | nuqs | 2024+ | Better DX, serialization, history control |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | date-fns v4 supports pt-BR locale for `formatDistanceToNow` | Standard Stack | Minor -- would need locale import adjustment |
| A2 | NuqsAdapter can be placed in admin layout (not just root) | Architecture Patterns | Medium -- may need root layout placement |
| A3 | @hello-pangea/dnd works without issues on Next.js 16 with Turbopack | Common Pitfalls | Medium -- would need testing; fallback is webpack |

## Open Questions

1. **Credit value strategy**
   - What we know: Credit value is in artifact JSONB payloads, not on the leads table
   - What's unclear: Whether to add a `creditValue` column to leads (denormalize) or join through artifacts each time
   - Recommendation: Add `creditValue` numeric column to leads table and populate during `capture_lead` or auto-transition. Simpler queries, better performance. The join path through 4 tables is expensive for a dashboard view.

2. **actorId schema migration**
   - What we know: `lead_events.actorId` is `uuid`, Better Auth user IDs are `text`
   - What's unclear: Whether any existing lead_events rows exist with UUID actor IDs
   - Recommendation: Since the app is pre-launch, migrate `actorId` from `uuid` to `text`. No data migration needed if no rows exist.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently configured |
| Config file | none -- see Wave 0 |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BACK-04 | Kanban drag updates stage in DB | integration | Manual verification | No |
| BACK-05 | Lead cards show correct info | visual | Manual verification | No |
| BACK-06 | Filters work correctly | integration | Manual verification | No |
| BACK-09 | Auto-transitions fire on tool execution | integration | Manual verification | No |
| BSEC-03 | Audit log records admin actions | integration | Manual verification | No |

### Wave 0 Gaps
- No test framework configured -- all verification is manual for this phase
- Focus on build verification (`npm run build`) and manual testing

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Better Auth session validation via requireRole() |
| V3 Session Management | yes | Better Auth handles session lifecycle |
| V4 Access Control | yes | requireRole("admin") on all API routes; viewer role cannot modify leads |
| V5 Input Validation | yes | Zod validation on PATCH body (stage must be valid enum) |
| V6 Cryptography | no | No crypto in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized lead stage modification | Elevation of Privilege | requireRole("admin") on PATCH endpoint |
| Lead data exposure to non-admins | Information Disclosure | requireRole("admin", "viewer") on GET endpoint |
| Stage injection (invalid enum value) | Tampering | Zod validation against leadStageEnum values |
| IDOR on lead ID | Tampering | UUID format validation; admin has access to all leads (single-tenant MVP) |

## Project Constraints (from CLAUDE.md)

- **Stack:** Next.js 16 + shadcn/ui + Tailwind CSS 4
- **No serverless:** Docker/VPS deployment
- **Mobile-first:** Pipeline board needs horizontal scroll on mobile
- **Performance:** < 3s response time for API calls
- **shadcn/studio Pro:** Use for card/component design where applicable (via MCP)
- **Biome:** For linting/formatting (not ESLint)
- **No Axios:** Use native fetch
- **Zustand:** For client state if needed (but useQueryState from nuqs handles filter state)
- **SidebarMenuButton render prop:** Use `render={<Link />}` pattern, NOT `asChild`

## Sources

### Primary (HIGH confidence)
- npm registry: @hello-pangea/dnd@18.0.1 peerDependencies verified React 19 support [VERIFIED]
- npm registry: nuqs@2.8.9 version verified [VERIFIED]
- Project codebase: schema.ts, route.ts, ai-sdk.ts, require-role.ts inspected [VERIFIED]
- Project package.json: dependency versions confirmed [VERIFIED]

### Secondary (MEDIUM confidence)
- [nuqs docs](https://nuqs.dev/) -- NuqsAdapter pattern, useQueryState API [CITED]
- [Marmelab Kanban + shadcn article](https://marmelab.com/blog/2026/01/15/building-a-kanban-board-with-shadcn.html) -- DnD patterns, optimistic updates [CITED]
- [@hello-pangea/dnd GitHub](https://github.com/hello-pangea/dnd) -- API docs, examples [CITED]

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions verified on npm registry, peer deps confirmed
- Architecture: HIGH - patterns derived from existing codebase + official docs
- Pitfalls: HIGH - schema issues verified by reading actual code; DnD pitfalls from community docs

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable libraries, low churn)

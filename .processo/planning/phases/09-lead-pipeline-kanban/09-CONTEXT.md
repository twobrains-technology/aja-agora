# Phase 9: Lead Pipeline Kanban - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Build the Kanban board for lead pipeline management with drag-and-drop between funnel stages, lead cards with summary info, filters, and automatic stage transitions based on chat events. This is the core pipeline management feature.

</domain>

<decisions>
## Implementation Decisions

### Drag-and-Drop Library
- **D-01:** Use `@hello-pangea/dnd` — maintained fork of react-beautiful-dnd, simple API, lightweight
- **D-02:** Kanban columns represent the 7 funnel stages: Novo, Engajado, Qualificado, Em Negociação, Proposta Enviada, Fechado Ganho, Perdido
- **D-03:** Dragging a card between columns triggers: DB update (lead.stage), insert into lead_events (from_stage, to_stage, actor_type='admin', actor_id=session.user.id), and UI optimistic update

### Lead Card Design
- **D-04:** Each card shows: lead name, channel icon (globe for web, phone for whatsapp), time in current stage (relative, e.g. "2h", "3d"), credit value (formatted BRL), last interaction timestamp
- **D-05:** Card click opens lead detail (Phase 10 — conversation replay). For now, card click does nothing or shows a toast "Em breve"
- **D-06:** Cards ordered within each column by most recent first (newest leads at top)
- **D-07:** Card count badge on each column header showing total leads in that stage

### Automatic Stage Transitions
- **D-08:** When `capture_lead` tool runs in chat → lead stage auto-set to `novo` (already default)
- **D-09:** When `simulate_quota` tool runs → update lead stage to `engajado` (if currently `novo`)
- **D-10:** When `recommend_groups` tool runs → update lead stage to `qualificado` (if currently `engajado`)
- **D-11:** Transitions are idempotent — only advance forward, never regress. A lead at `qualificado` won't go back to `engajado`
- **D-12:** Each auto-transition creates a `lead_events` entry with `actor_type='system'`
- **D-13:** Implementation: add stage transition logic to the chat API route (`/api/chat/route.ts`) — after tool execution, check tool name and update lead stage accordingly

### Data Fetching & Updates
- **D-14:** API route `GET /api/admin/leads` returns all leads grouped by stage, with conversation metadata
- **D-15:** API route `PATCH /api/admin/leads/[id]/stage` for manual stage transitions (drag-and-drop)
- **D-16:** Polling every 30 seconds to refresh the Kanban (simple for MVP, no WebSocket needed)
- **D-17:** Optimistic UI updates on drag — revert on API error

### Filter System
- **D-18:** Filter bar above the Kanban board with: channel dropdown (All/Web/WhatsApp), date range picker (leads created in period), text search (name/phone)
- **D-19:** Filters apply client-side on the already-fetched leads data (no server-side filtering for MVP — lead volume is low)
- **D-20:** Filter state persisted in URL search params via `nuqs` (shareable filtered views)

### Audit Log
- **D-21:** Every manual stage transition (drag) logged to `lead_events` with admin user ID and optional notes
- **D-22:** BSEC-03 requirement: `lead_events` table serves as the audit log — no separate audit table needed

### Claude's Discretion
- Exact card visual design (colors, shadows, spacing)
- Column header styling and stage colors
- Loading states and skeleton UI
- Empty state messaging per column
- Drag animation and drop indicators

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database & Schema
- `src/db/schema.ts` — Drizzle schema with leads table (has `stage` column), lead_events, lead_insights
- `src/db/index.ts` — DB instance

### Auth & Admin
- `src/lib/auth.ts` — Better Auth server config
- `src/lib/auth-client.ts` — Client auth hooks (useSession, signIn, signOut)
- `src/lib/admin/require-role.ts` — Role-gated API route helper
- `src/proxy.ts` — Route protection for /admin/*

### Admin UI (Phase 8)
- `src/app/admin/(dashboard)/layout.tsx` — Admin layout with sidebar
- `src/app/admin/(dashboard)/pipeline/page.tsx` — Pipeline placeholder (to be replaced)
- `src/components/admin/app-sidebar.tsx` — Sidebar navigation
- `src/components/admin/admin-header.tsx` — Header with user info

### Chat Integration
- `src/app/api/chat/route.ts` — Chat API route (add auto-transition logic here)
- `src/lib/agent/tools/ai-sdk.ts` — Agent tools (simulate_quota, recommend_groups, capture_lead)

### Project Config
- `.planning/REQUIREMENTS.md` §Backoffice — BACK-04 through BACK-06, BACK-09, BSEC-03
- `.planning/ROADMAP.md` §Phase 9 — Success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- shadcn/ui components: Button, Card, Input, Badge, Table, Skeleton, Avatar, DropdownMenu, Sidebar
- Admin layout shell with SidebarProvider already working
- `requireRole()` helper for API route protection
- Drizzle ORM with leads, lead_events tables ready
- `nuqs` already in dependencies for URL state

### Established Patterns
- Drizzle schema with pgTable, pgEnum, uuid, timestamps
- API routes with request validation
- Better Auth session via `auth.api.getSession()`
- Zustand for client state (chat store pattern)

### Integration Points
- `src/app/admin/(dashboard)/pipeline/page.tsx` — Replace placeholder with Kanban
- `src/app/api/admin/` — New API routes for lead management
- `src/app/api/chat/route.ts` — Add auto-transition hooks after tool execution
- `src/components/admin/` — New Kanban components

</code_context>

<specifics>
## Specific Ideas

- Kanban columns should visually indicate funnel progression (left = early, right = late)
- "Fechado Ganho" column should have a success/green accent
- "Perdido" column should have a muted/gray accent
- The user mentioned "esquema de marketing" — think funnel visualization, not just task board
- Future: AI agent will handle stages 4-5 (Em Negociação, Proposta Enviada) — keep the auto-transition system extensible

</specifics>

<deferred>
## Deferred Ideas

- Real-time updates via WebSocket/SSE — polling sufficient for MVP
- Bulk actions (move multiple leads at once) — future enhancement
- Lead assignment to specific admins — single-admin MVP for now
- Stage-specific actions (e.g., "Enviar Proposta" button in Em Negociação) — Phase 10+
- Lead scoring/priority indicators — future enhancement

</deferred>

---

*Phase: 09-lead-pipeline-kanban*
*Context gathered: 2026-04-14*

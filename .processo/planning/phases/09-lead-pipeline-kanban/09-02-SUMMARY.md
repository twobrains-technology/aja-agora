---
phase: 09-lead-pipeline-kanban
plan: 02
subsystem: frontend, admin-ui
tags: [kanban, drag-and-drop, nuqs, filters, polling, hello-pangea-dnd]

requires:
  - phase: 09-lead-pipeline-kanban
    plan: 01
    provides: GET /api/admin/leads, PATCH /api/admin/leads/[id]/stage, STAGE_ORDER, lead-transitions
provides:
  - Interactive Kanban board at /admin/pipeline with 7 stage columns
  - Drag-and-drop lead management with optimistic updates
  - Client-side filters (channel, text search, date range) with URL persistence via nuqs
  - 30-second auto-polling for board refresh
affects: [09-03-PLAN, admin-pipeline-page]

tech-stack:
  added: []
  patterns: [optimistic-dnd-update, client-side-filtering, url-state-nuqs, suspense-boundary-for-nuqs]

key-files:
  created:
    - src/components/admin/pipeline/kanban-board.tsx
    - src/components/admin/pipeline/kanban-column.tsx
    - src/components/admin/pipeline/lead-card.tsx
    - src/components/admin/pipeline/pipeline-filters.tsx
    - src/components/admin/pipeline/pipeline-content.tsx
    - src/lib/admin/lead-stages.ts
  modified:
    - src/app/admin/(dashboard)/pipeline/page.tsx
    - src/lib/admin/lead-transitions.ts

key-decisions:
  - "Extracted STAGE_ORDER into client-safe lead-stages.ts to avoid pulling DB deps into browser bundle"
  - "Used Suspense boundary around filter+board content since nuqs useQueryState requires useSearchParams"
  - "Used window.alert for toast since sonner is not installed (plan allows fallback)"

patterns-established:
  - "Client-safe shared constants: domain constants used by both server and client extracted into separate files"
  - "Optimistic DnD: structuredClone previous state, apply optimistic update, revert on API error"
  - "URL-persisted filters: nuqs useQueryState for shareable filtered views"

requirements-completed: [BACK-04, BACK-06]

duration: 5min
completed: 2026-04-14
---

# Phase 9 Plan 02: Kanban Board UI with DnD and Filters Summary

**Interactive Kanban pipeline with @hello-pangea/dnd drag-and-drop, lead cards showing name/channel/value/timing, client-side filters via nuqs URL state, and 30s auto-polling**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-14T04:45:36Z
- **Completed:** 2026-04-14T04:50:33Z
- **Tasks:** 2
- **Files created:** 6
- **Files modified:** 2

## Accomplishments

- Built KanbanBoard with DragDropContext, 7-column layout, optimistic drag updates with rollback on error
- Built KanbanColumn with Droppable areas, stage labels, count badges, green accent for "Fechado Ganho" and muted for "Perdido"
- Built LeadCard showing name (or phone fallback), channel icon (Globe/Smartphone), time in stage, credit value (BRL), last interaction
- Built PipelineFilters with channel Select, debounced text search, date range Calendar popovers
- All filter state persisted in URL via nuqs (shareable filtered views)
- 30-second polling via setInterval for auto-refresh
- Horizontal ScrollArea for mobile support
- Suspense boundary wrapping client components for Next.js static prerendering compatibility

## Task Commits

1. **Task 1: Kanban board with DnD, lead cards, and polling** - `236ebbb` (feat)
2. **Task 2: Filter bar with nuqs URL state** - `b101f80` (feat)

## Files Created/Modified

- `src/lib/admin/lead-stages.ts` - Client-safe STAGE_ORDER + LeadStage type (extracted from lead-transitions.ts)
- `src/lib/admin/lead-transitions.ts` - Re-exports from lead-stages.ts, uses local alias for DB function
- `src/components/admin/pipeline/lead-card.tsx` - Lead card with name, channel icon, time, value, interaction
- `src/components/admin/pipeline/kanban-column.tsx` - Droppable column with header, count badge, stage accents
- `src/components/admin/pipeline/kanban-board.tsx` - DragDropContext, fetch, polling, optimistic DnD, filterFn prop
- `src/components/admin/pipeline/pipeline-filters.tsx` - useLeadFilters hook + PipelineFilters component with nuqs
- `src/components/admin/pipeline/pipeline-content.tsx` - Client wrapper combining filters + board
- `src/app/admin/(dashboard)/pipeline/page.tsx` - Server component with Suspense boundary

## Decisions Made

- Extracted STAGE_ORDER into client-safe `lead-stages.ts` to prevent DB module from being pulled into browser bundle
- Used Suspense boundary around filter+board content since nuqs `useQueryState` uses `useSearchParams` internally
- Used `window.alert` for lead card click and DnD error feedback since sonner toast is not installed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted STAGE_ORDER to client-safe module**
- **Found during:** Task 1 (build failure)
- **Issue:** Importing STAGE_ORDER from lead-transitions.ts pulled db/drizzle/pg into client bundle causing build failure
- **Fix:** Created lead-stages.ts with constants only, lead-transitions.ts re-exports from it
- **Files created:** src/lib/admin/lead-stages.ts
- **Files modified:** src/lib/admin/lead-transitions.ts
- **Committed in:** 236ebbb (Task 1)

**2. [Rule 3 - Blocking] Added Suspense boundary for nuqs compatibility**
- **Found during:** Task 2 (build failure)
- **Issue:** nuqs useQueryState uses useSearchParams which requires Suspense boundary in Next.js App Router
- **Fix:** Made page.tsx a server component, created pipeline-content.tsx client wrapper, wrapped in Suspense
- **Files created:** src/components/admin/pipeline/pipeline-content.tsx
- **Files modified:** src/app/admin/(dashboard)/pipeline/page.tsx
- **Committed in:** b101f80 (Task 2)

---

**Total deviations:** 2 auto-fixed (2 blocking issues)
**Impact on plan:** Both were build-blocking issues resolved inline. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None.

## Next Phase Readiness
- Kanban board fully functional at /admin/pipeline
- Plan 03 (auto-transitions from chat) can proceed using lead-stages.ts and lead-transitions.ts

---
phase: 09-lead-pipeline-kanban
plan: 01
subsystem: api, database
tags: [drizzle, zod, nuqs, lead-pipeline, audit-trail]

requires:
  - phase: 08-backoffice-auth-layout
    provides: Better Auth, admin layout shell, requireRole helper, leads/leadEvents schema
provides:
  - transitionLeadStage shared function with forward-only guard
  - GET /api/admin/leads endpoint (grouped by stage)
  - PATCH /api/admin/leads/[id]/stage endpoint (admin-only with audit)
  - Fixed lead_events.actorId to text (Better Auth compat)
  - creditValue numeric column on leads table
  - NuqsAdapter in admin layout
affects: [09-02-PLAN, 09-03-PLAN, chat-route-auto-transitions]

tech-stack:
  added: ["@hello-pangea/dnd", "nuqs", "date-fns", "shadcn/select", "shadcn/popover", "shadcn/calendar"]
  patterns: [shared-transition-logic, stage-grouped-api-response, forward-only-transition-guard]

key-files:
  created:
    - src/lib/admin/lead-transitions.ts
    - src/app/api/admin/leads/route.ts
    - src/app/api/admin/leads/[id]/stage/route.ts
    - src/components/ui/select.tsx
    - src/components/ui/popover.tsx
    - src/components/ui/calendar.tsx
  modified:
    - src/db/schema.ts
    - src/app/admin/(dashboard)/layout.tsx
    - package.json

key-decisions:
  - "actorId changed from uuid to text to match Better Auth text-based user IDs"
  - "creditValue stored as numeric(12,2) for sorting/filtering precision"
  - "Same-stage transitions treated as no-op to avoid duplicate lead_events"

patterns-established:
  - "Shared transition logic: transitionLeadStage used by both admin API and system auto-transitions"
  - "Forward-only guard: onlyAdvance option prevents stage regression (D-11)"
  - "Stage-grouped response: API returns leads grouped by stage for Kanban consumption"

requirements-completed: [BACK-05, BSEC-03]

duration: 3min
completed: 2026-04-14
---

# Phase 9 Plan 01: Schema Fix + API Routes Summary

**Fixed lead_events.actorId uuid-to-text, added creditValue column, built shared transitionLeadStage with forward-only guard, and role-gated GET/PATCH API routes for Kanban board**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-14T04:40:29Z
- **Completed:** 2026-04-14T04:43:33Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Fixed critical schema mismatch: lead_events.actorId from uuid to text (Better Auth uses text IDs)
- Added creditValue numeric(12,2) column to leads table for financial data display
- Created transitionLeadStage shared function with forward-only guard and audit trail
- Built GET /api/admin/leads (admin+viewer) and PATCH /api/admin/leads/[id]/stage (admin-only)
- Installed all dependencies for Kanban UI phase (@hello-pangea/dnd, nuqs, date-fns, shadcn components)
- Added NuqsAdapter to admin layout for URL state management

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies, fix schema, add NuqsAdapter** - `84d6b8d` (chore)
2. **Task 2: Create shared transition logic and API routes** - `5ecefc4` (feat)

## Files Created/Modified
- `src/db/schema.ts` - actorId uuid->text, added creditValue numeric column
- `src/lib/admin/lead-transitions.ts` - Shared transitionLeadStage with STAGE_ORDER, forward-only guard
- `src/app/api/admin/leads/route.ts` - GET endpoint returning leads grouped by stage
- `src/app/api/admin/leads/[id]/stage/route.ts` - PATCH endpoint for manual stage transitions with zod validation
- `src/app/admin/(dashboard)/layout.tsx` - NuqsAdapter wrapping children
- `src/components/ui/select.tsx` - shadcn Select component
- `src/components/ui/popover.tsx` - shadcn Popover component
- `src/components/ui/calendar.tsx` - shadcn Calendar component
- `package.json` - Added @hello-pangea/dnd, nuqs, date-fns

## Decisions Made
- actorId changed from uuid to text to match Better Auth text-based user IDs
- creditValue stored as numeric(12,2) for sorting/filtering precision
- Added same-stage no-op check in transitionLeadStage to avoid duplicate lead_events entries

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added same-stage transition guard**
- **Found during:** Task 2 (transition logic)
- **Issue:** Plan did not handle case where toStage equals current stage, which would create unnecessary lead_events entries
- **Fix:** Added early return when lead.stage === toStage
- **Files modified:** src/lib/admin/lead-transitions.ts
- **Verification:** Build passes
- **Committed in:** 5ecefc4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Prevents duplicate audit entries. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API routes ready for Kanban UI consumption (Plan 02)
- transitionLeadStage ready for chat route auto-transitions (Plan 03)
- All UI dependencies installed for drag-and-drop board

---
*Phase: 09-lead-pipeline-kanban*
*Completed: 2026-04-14*

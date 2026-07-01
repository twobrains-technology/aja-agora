---
phase: 11-dashboard-funnel-analytics
plan: 01
subsystem: api
tags: [drizzle, postgresql, dashboard, analytics, aggregation, sql]

requires:
  - phase: 09-lead-pipeline-kanban
    provides: leads table with stage enum, lead_events audit trail
  - phase: 08-auth-admin-shell
    provides: requireRole API guard, admin auth infrastructure
provides:
  - GET /api/admin/dashboard endpoint with KPIs, funnel, daily volume, channel breakdown
  - Dashboard TypeScript types (DashboardResponse, KpiData, FunnelStage, DailyVolume, ChannelBreakdown)
  - FUNNEL_STAGES constant (stage order without "perdido")
  - Drizzle aggregation query functions
affects: [11-02-dashboard-ui]

tech-stack:
  added: []
  patterns: [parallel-sql-aggregation, trend-calculation, timezone-aware-queries, gap-filling-timeseries]

key-files:
  created:
    - src/lib/admin/dashboard-types.ts
    - src/lib/admin/dashboard-queries.ts
    - src/app/api/admin/dashboard/route.ts
  modified:
    - src/db/schema.ts

key-decisions:
  - "Hardcoded America/Sao_Paulo timezone for 'Leads Hoje' — product is 100% Brazilian market"
  - "Used COALESCE with NULLIF to prevent division-by-zero in conversion rate and avg funnel days"
  - "Gap-filling in daily volume ensures no chart gaps even on days with zero leads"

patterns-established:
  - "Parallel SQL aggregation: Promise.all for independent queries in single API route"
  - "Trend calculation: compare current period vs same-length previous period with zero-safe division"
  - "Timezone-aware date grouping: AT TIME ZONE in SQL for Brazilian users"

requirements-completed: [BACK-10, BACK-11]

duration: 3min
completed: 2026-04-14
---

# Phase 11 Plan 01: Dashboard Data Layer Summary

**Single API endpoint with 4 parallel Drizzle SQL aggregations: KPIs with trend comparison, funnel stages excluding "perdido", gap-filled daily volume timeline, and web/whatsapp channel breakdown**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-14T05:41:36Z
- **Completed:** 2026-04-14T05:44:02Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Dashboard response types with FUNNEL_STAGES constant (excludes "perdido" terminal state)
- Four aggregation query functions: computeKpis (with trend calculations vs previous period), computeFunnelStages (percentOfTotal + dropOffRate), computeDailyVolume (gap-filled), computeChannelBreakdown (both channels always present)
- GET /api/admin/dashboard with from/to date filtering, input validation (400 on invalid dates), requireRole("admin", "viewer") guard
- Added leads.createdAt index for date range query performance

## Task Commits

Each task was committed atomically:

1. **Task 1: Define dashboard response types** - `c9a2998` (feat)
2. **Task 2: Build Drizzle aggregation queries and API route** - `585bbf9` (feat)

## Files Created/Modified

- `src/lib/admin/dashboard-types.ts` - KpiData, FunnelStage, DailyVolume, ChannelBreakdown, DashboardResponse types + FUNNEL_STAGES constant
- `src/lib/admin/dashboard-queries.ts` - computeKpis, computeFunnelStages, computeDailyVolume, computeChannelBreakdown with Drizzle SQL
- `src/app/api/admin/dashboard/route.ts` - GET handler with auth, date validation, parallel query execution
- `src/db/schema.ts` - Added leads_created_at_idx index

## Decisions Made

- Hardcoded America/Sao_Paulo timezone for "Leads Hoje" KPI — product is 100% Brazilian market
- Used COALESCE + NULLIF pattern in SQL to safely handle division by zero (empty periods)
- Gap-filling in computeDailyVolume iterates day-by-day to ensure chart continuity
- Previous period for "leadsToday" trend compares vs yesterday's count (same timezone)
- Both channels (web, whatsapp) always included in breakdown even if count is zero

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- API endpoint ready for dashboard UI consumption (plan 11-02)
- Types exported for direct import by UI components
- recharts/shadcn chart component installation deferred to UI plan

## Self-Check: PASSED

---
*Phase: 11-dashboard-funnel-analytics*
*Completed: 2026-04-14*

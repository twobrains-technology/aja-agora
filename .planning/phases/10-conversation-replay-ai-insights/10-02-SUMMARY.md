---
phase: 10-conversation-replay-ai-insights
plan: 02
subsystem: api, ui
tags: [ai-insights, claude-haiku, caching, insight-cards]

requires:
  - phase: 10-conversation-replay-ai-insights
    plan: 01
    provides: LeadDetailPanel with Insights tab placeholder, conversation API
provides:
  - POST /api/admin/leads/[id]/insights endpoint with 1hr caching
  - InsightCards component with 4 insight display cards
  - Prompt template for Claude Haiku insight generation
affects: []

tech-stack:
  added: []
  patterns:
    - "generateText from ai SDK with @ai-sdk/anthropic for non-streaming structured output"
    - "Cache-first with TTL check on lead_insights table"
    - "On-demand component rendering via insightsLoaded state guard"

key-files:
  created:
    - src/app/api/admin/leads/[id]/insights/route.ts
    - src/lib/admin/insights-prompt.ts
    - src/components/admin/pipeline/insight-cards.tsx
  modified:
    - src/components/admin/pipeline/lead-detail-panel.tsx

key-decisions:
  - "Prompt instructs Claude to return raw JSON only, with markdown fence stripping as fallback"
  - "Cache check uses most recent generatedAt across all insight rows for TTL comparison"
  - "InsightCards only mounts when Insights tab is first opened, preventing unnecessary API calls"

patterns-established:
  - "AI insight generation pattern: system prompt + transcript builder + generateText + JSON parse with fence stripping"
  - "Cache-first API pattern: check DB rows age vs TTL, return cached or regenerate + persist"

requirements-completed: [BACK-08]

duration: 2min
completed: 2026-04-14
---

# Phase 10 Plan 02: AI Insights Summary

**AI insights via Claude Haiku with 1hr caching, extracting intent/budget/objections/next_action from conversation history**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-14T05:23:54Z
- **Completed:** 2026-04-14T05:26:12Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- API route generates structured insights from conversation via Claude Haiku (non-streaming)
- Cache-first approach returns cached insights if less than 1 hour old, avoiding redundant API calls
- Prompt template formats conversation as labeled transcript and instructs JSON-only output
- 4 insight cards display with colored icons: Intent (blue), Budget (green), Objections (amber), Next Action (purple)
- On-demand rendering ensures insights API is only called when admin opens the Insights tab
- Budget values formatted as BRL currency, empty objections handled gracefully

## Task Commits

Each task was committed atomically:

1. **Task 1: Insights prompt template + API route with caching** - `578a87c` (feat)
2. **Task 2: InsightCards component + wire into Insights tab** - `d35c706` (feat)

## Files Created/Modified
- `src/lib/admin/insights-prompt.ts` - System prompt constant + buildInsightPrompt transcript formatter
- `src/app/api/admin/leads/[id]/insights/route.ts` - POST endpoint with requireRole, cache TTL check, Claude Haiku generation, DB persist
- `src/components/admin/pipeline/insight-cards.tsx` - 4 insight cards with loading skeletons, error retry, BRL formatting
- `src/components/admin/pipeline/lead-detail-panel.tsx` - Controlled Tabs with on-demand InsightCards rendering, state reset on lead change

## Decisions Made
- Prompt instructs Claude to return raw JSON only, with markdown fence stripping as safety fallback
- Cache check uses most recent generatedAt across all insight rows for TTL comparison
- InsightCards only mounts when Insights tab is first activated, preventing unnecessary API calls on panel open

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
- `ANTHROPIC_API_KEY` environment variable must be set for Claude Haiku API calls (already required by existing chat functionality)

## Next Phase Readiness
- Phase 10 complete (both plans done) - conversation replay + AI insights fully implemented
- Phase 11 (dashboard analytics) can proceed independently

---
*Phase: 10-conversation-replay-ai-insights*
*Completed: 2026-04-14*

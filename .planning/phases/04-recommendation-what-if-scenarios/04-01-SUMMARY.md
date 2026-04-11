---
phase: 04-recommendation-what-if-scenarios
plan: 01
subsystem: ui, api
tags: [recommendation, artifact, presentation-tool, zod, motion, shadcn]

requires:
  - phase: 03-chat-ui-artifact-rendering
    provides: Artifact type system, ArtifactRenderer dispatch, presentation tool pattern, SSE artifact emission
provides:
  - presentRecommendation tool for agent to deliver final recommendation
  - RecommendationCard component with score breakdown and CTA
  - recommendation_card artifact type wired end-to-end (type -> tool -> route -> renderer -> component)
affects: [05-progressive-auth-lead-capture]

tech-stack:
  added: []
  patterns:
    - "CustomEvent bridge for cross-component CTA actions (aja:send-message)"
    - "Expandable section with AnimatePresence + reduced-motion respect"

key-files:
  created:
    - src/components/chat/artifacts/recommendation-card.tsx
  modified:
    - src/lib/chat/types.ts
    - src/lib/agent/tools/presentation.ts
    - src/lib/agent/tools/index.ts
    - src/app/api/chat/route.ts
    - src/components/chat/artifact-renderer.tsx

key-decisions:
  - "CTA button dispatches CustomEvent 'aja:send-message' as lightweight bridge until Phase 5 replaces with LeadForm trigger"
  - "Score breakdown uses animated progress bars with percentage labels per factor"

patterns-established:
  - "CustomEvent bridge: artifact components dispatch window events for actions that cross component boundaries"

requirements-completed: [CHAT-07]

duration: 12min
completed: 2026-04-11
---

# Phase 4 Plan 1: RecommendationCard Artifact Summary

**presentRecommendation tool with Zod-validated payload, RecommendationCard component with expandable score breakdown and CTA button, wired end-to-end through the artifact dispatch system**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-11T12:21:29Z
- **Completed:** 2026-04-11T12:33:15Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Full end-to-end recommendation artifact: type definition, presentation tool, route allowlist, renderer dispatch, React component
- RecommendationCard with hero monthly payment (24px bold mono), 2x2 metrics grid, expandable score breakdown with animated progress bars
- CTA "Tenho interesse" button (44px min-height, full-width) wired to CustomEvent bridge for Phase 5 integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Add RecommendationCardPayload type, presentRecommendation tool, and backend wiring** - `cbbf0f7` (feat)
2. **Task 2: Create RecommendationCard component and register in ArtifactRenderer** - `9eefe27` (feat)

## Files Created/Modified
- `src/lib/chat/types.ts` - Added RecommendationCardPayload interface and updated ArtifactType/Artifact unions
- `src/lib/agent/tools/presentation.ts` - Added presentRecommendation tool with full Zod schema (score 0-1, category enum, scoreBreakdown object)
- `src/lib/agent/tools/index.ts` - Imported and registered presentRecommendation in consorcioServer tools array
- `src/app/api/chat/route.ts` - Added mcp__consorcio__present_recommendation to allowedTools
- `src/components/chat/artifacts/recommendation-card.tsx` - New RecommendationCard component with score bars, metrics, CTA
- `src/components/chat/artifact-renderer.tsx` - Added recommendation_card to ARTIFACT_COMPONENTS dispatch map

## Decisions Made
- CTA button uses `window.dispatchEvent(new CustomEvent("aja:send-message"))` as a lightweight bridge -- Phase 5 will replace with LeadForm trigger
- Score breakdown uses animated Tailwind progress bars (not SVG charts) per research recommendation to keep it simple

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- RecommendationCard artifact is fully wired and ready for agent use
- CTA button event bridge ready for Phase 5 LeadForm integration
- Ready for 04-02 (what-if scenarios / system prompt additions)

---
*Phase: 04-recommendation-what-if-scenarios*
*Completed: 2026-04-11*

---
phase: 05-conversion-progressive-auth
plan: 02
subsystem: agent, ui
tags: system-prompt, lead-capture, zustand, recommendation-card

# Dependency graph
requires:
  - phase: 05-conversion-progressive-auth
    plan: 01
    provides: presentLeadForm tool, captureLead tool, LeadForm component
provides:
  - System prompt with lead capture behavioral instructions
  - RecommendationCard CTA wired to Zustand sendMessage
affects: [agent-behavior, lead-capture-flow]

# Tech tracking
tech-stack:
  added: []
  patterns: [zustand-direct-store-call-from-artifact]

key-files:
  created: []
  modified:
    - src/lib/agent/system-prompt.ts
    - src/components/chat/artifacts/recommendation-card.tsx

key-decisions:
  - "Direct Zustand sendMessage instead of CustomEvent dispatch for CTA -- cleaner, uses store's isStreaming guard"
  - "System prompt explicitly forbids PII collection via chat text -- reinforces DATA-03"

patterns-established:
  - "Artifact components can import useChatStore for direct store interaction"

requirements-completed: [CONV-01]

# Metrics
duration: 1min
completed: 2026-04-11
---

# Phase 5 Plan 2: Conversion Flow Wiring Summary

**System prompt updated with lead capture behavioral rules and RecommendationCard CTA wired to Zustand store for end-to-end conversion flow**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-11T12:50:24Z
- **Completed:** 2026-04-11T12:51:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- System prompt now instructs agent to call present_lead_form when user expresses interest after recommendation
- Added "Captura de Lead" section with 5 rules: when to present form, what to say before/after, never request PII via text, redirect users who try to share PII in chat
- RecommendationCard CTA replaced CustomEvent dispatch with direct Zustand sendMessage call
- End-to-end flow complete: recommendation card -> CTA click -> sendMessage -> agent -> present_lead_form -> LeadForm renders

## Task Commits

Each task was committed atomically:

1. **Task 1: Update system prompt with lead capture flow instructions** - `cbb08ec` (feat)
2. **Task 2: Update RecommendationCard CTA to use sendMessage from store** - `7dd8292` (feat)

## Files Created/Modified
- `src/lib/agent/system-prompt.ts` - Added lead capture section with 5 behavioral rules for agent
- `src/components/chat/artifacts/recommendation-card.tsx` - Replaced CustomEvent with useChatStore sendMessage

## Decisions Made
- **Zustand over CustomEvent:** Direct `sendMessage` from store is cleaner than `window.dispatchEvent(new CustomEvent(...))`. The store already has `isStreaming` guard to prevent concurrent sends, making the CTA inherently safe from race conditions.
- **PII protection in prompt:** System prompt explicitly forbids the agent from requesting personal data via chat text and instructs it to redirect users to the form. This reinforces DATA-03 at the behavioral layer.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all wiring is complete. The system prompt references present_lead_form (created in Plan 01), and the CTA calls sendMessage which flows through /api/chat to the agent.

## Next Phase Readiness
- Conversion flow is fully wired end-to-end
- Phase 5 infrastructure complete across both plans
- Ready for next phase

---
*Phase: 05-conversion-progressive-auth*
*Completed: 2026-04-11*

## Self-Check: PASSED

---
phase: 04-recommendation-what-if-scenarios
plan: 02
subsystem: ai-agent
tags: [system-prompt, what-if, recommendation, prompt-engineering]

requires:
  - phase: 03-chat-ui-artifact-rendering
    provides: "Presentation tools pattern and artifact rendering pipeline"
  - phase: 04-recommendation-what-if-scenarios (plan 01)
    provides: "present_recommendation tool registered in allowedTools"
provides:
  - "System prompt instructions for what-if scenario detection (simulate_quota shortcut)"
  - "System prompt instructions for recommendation presentation via present_recommendation"
affects: [phase-05-progressive-auth]

tech-stack:
  added: []
  patterns:
    - "System prompt section pattern for guiding agent tool selection behavior"

key-files:
  created: []
  modified:
    - src/lib/agent/system-prompt.ts

key-decisions:
  - "Appended two new sections to SYSTEM_PROMPT without modifying existing sections"
  - "What-if detection relies on Claude's native intent understanding via prompt instructions, not custom NLP/regex"

patterns-established:
  - "Prompt engineering for tool routing: instruct agent to skip unnecessary tool chains for speed"

requirements-completed: [CHAT-10]

duration: 1min
completed: 2026-04-11
---

# Phase 4 Plan 02: What-If Scenario Detection & Recommendation Presentation Summary

**System prompt additions for what-if scenario detection (direct simulate_quota path) and recommendation presentation instructions (present_recommendation with full score data)**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-11T12:21:42Z
- **Completed:** 2026-04-11T12:22:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added "Cenarios What-If" section to system prompt with 6 rules for parameter change detection and efficient tool routing
- Added "Recomendacao Final" section to system prompt with 5 rules for recommendation delivery via present_recommendation
- Agent now instructed to skip search_groups for simple parameter changes (value/term within same group), going directly to simulate_quota for <3s response time

## Task Commits

Each task was committed atomically:

1. **Task 1: Add what-if scenario detection and recommendation presentation instructions to system prompt** - `1e27017` (feat)

## Files Created/Modified
- `src/lib/agent/system-prompt.ts` - Added two new sections: "Cenarios What-If" (what-if scenario detection and tool routing) and "Recomendacao Final" (recommendation presentation with score data)

## Decisions Made
None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- System prompt now guides agent behavior for what-if scenarios and recommendation presentation
- Ready for manual verification: start conversation, get recommendation, then test "e se eu mudar pra R$ 1000/mes" to confirm agent calls simulate_quota directly
- All Phase 4 plans complete, ready for next phase

---
*Phase: 04-recommendation-what-if-scenarios*
*Completed: 2026-04-11*

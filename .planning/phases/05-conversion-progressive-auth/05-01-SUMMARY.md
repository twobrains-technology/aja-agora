---
phase: 05-conversion-progressive-auth
plan: 01
subsystem: ui, api, agent
tags: react-hook-form, zod, lead-capture, pii-isolation, drizzle, mcp-tools

# Dependency graph
requires:
  - phase: 03-chat-ui-artifact-rendering
    provides: Artifact renderer dispatch, presentation tool pattern, SSE streaming
  - phase: 04-recommendation-engine
    provides: RecommendationCard CTA triggers lead capture flow
provides:
  - Shared lead validation schema (leadSchema + LeadFormData type)
  - presentLeadForm presentation tool (agent -> inline form artifact)
  - captureLead domain tool (agent -> DB write with upsert)
  - /api/leads POST endpoint (direct PII capture, bypassing chat)
  - LeadForm artifact component (react-hook-form + zod + success state)
  - lead_form artifact type in ArtifactRenderer dispatch
affects: [05-conversion-progressive-auth, system-prompt-updates]

# Tech tracking
tech-stack:
  added: [react-hook-form@7.x, "@hookform/resolvers@5.x"]
  patterns: [domain-tool-with-db-write, direct-pii-endpoint, form-artifact-component]

key-files:
  created:
    - src/lib/validations/lead.ts
    - src/lib/agent/tools/capture.ts
    - src/app/api/leads/route.ts
    - src/components/chat/artifacts/lead-form.tsx
  modified:
    - src/lib/chat/types.ts
    - src/lib/agent/tools/presentation.ts
    - src/lib/agent/tools/index.ts
    - src/app/api/chat/route.ts
    - src/components/chat/artifact-renderer.tsx
    - package.json

key-decisions:
  - "Direct POST to /api/leads for PII isolation -- form data never enters chat message flow (DATA-03)"
  - "Upsert pattern in captureLead tool -- select-then-insert/update since conversationId is not unique constraint"
  - "Native HTML labels instead of shadcn Label component -- Label not installed and not needed for accessible form"

patterns-established:
  - "Domain tool with DB write: captureLead as first non-readOnly tool pattern"
  - "Form artifact: client-side form that POSTs directly to API endpoint, then notifies agent via sendMessage"
  - "Shared Zod schema: leadSchema used in both frontend (react-hook-form) and backend (/api/leads)"

requirements-completed: [CONV-01, CONV-02, CONV-03, DATA-03]

# Metrics
duration: 4min
completed: 2026-04-11
---

# Phase 5 Plan 1: Lead Capture Infrastructure Summary

**Inline LeadForm artifact with react-hook-form + Zod validation, direct /api/leads PII endpoint, and presentLeadForm + captureLead agent tools**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-11T12:43:55Z
- **Completed:** 2026-04-11T12:48:20Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Shared Zod lead validation schema with BR phone number support (strip non-digits, validate 10-11 digits)
- LeadFormPayload type with NO PII fields (only conversationId + optional recommendationId) enforcing DATA-03
- presentLeadForm presentation tool that emits lead_form artifact via SSE
- captureLead domain tool with upsert pattern (first non-readOnly tool in the system)
- /api/leads POST endpoint with rate limiting, conversation verification, and Zod validation
- LeadForm artifact component with react-hook-form, inline field errors, AnimatePresence success transition, 44px mobile touch targets

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps + create shared lead validation schema + update types** - `9f93d7a` (feat)
2. **Task 2: Create presentation tool + capture tool + register in MCP server + update route** - `93c0cc0` (feat)
3. **Task 3: Create LeadForm component + /api/leads endpoint + register in ArtifactRenderer** - `9508e8f` (feat)

## Files Created/Modified
- `src/lib/validations/lead.ts` - Shared Zod schema for lead form (name, phone, email)
- `src/lib/agent/tools/capture.ts` - captureLead domain tool with DB upsert
- `src/app/api/leads/route.ts` - POST endpoint for direct PII capture with rate limiting
- `src/components/chat/artifacts/lead-form.tsx` - LeadForm artifact component with react-hook-form
- `src/lib/chat/types.ts` - Added LeadFormPayload type and lead_form to ArtifactType union
- `src/lib/agent/tools/presentation.ts` - Added presentLeadForm tool
- `src/lib/agent/tools/index.ts` - Registered presentLeadForm + captureLead in MCP server
- `src/app/api/chat/route.ts` - Added both tools to allowedTools array
- `src/components/chat/artifact-renderer.tsx` - Added lead_form dispatch to LeadForm component
- `package.json` - Added react-hook-form and @hookform/resolvers dependencies

## Decisions Made
- **Direct POST for PII:** LeadForm POSTs directly to /api/leads instead of routing through agent. PII never enters chat messages or artifact payloads (DATA-03 compliance).
- **Upsert by conversationId:** captureLead tool checks for existing lead before insert. If same conversation submits again, updates existing lead.
- **Native labels:** Used native HTML `<label>` elements styled with Tailwind instead of installing shadcn Label component -- simpler, fewer deps, equally accessible.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all data flows are wired end-to-end (form -> /api/leads -> DB, agent -> presentLeadForm -> SSE -> LeadForm component).

## Next Phase Readiness
- Lead capture infrastructure complete, ready for remaining Phase 5 plans
- System prompt updates needed to instruct agent when to present lead form (likely in a subsequent plan)
- RecommendationCard CTA integration may need wiring in a subsequent plan

---
*Phase: 05-conversion-progressive-auth*
*Completed: 2026-04-11*

## Self-Check: PASSED

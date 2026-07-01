# Phase 5: Conversion & Progressive Auth - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Implement progressive authentication and lead capture so anonymous users are prompted for contact data at the natural conversion point — inline in the chat — and leads are persisted to the database.

</domain>

<decisions>
## Implementation Decisions

### Progressive Auth Flow
- User converses anonymously until reaching a recommendation (RecommendationCard CTA "Tenho interesse")
- Clicking CTA triggers inline LeadForm in chat — NOT a modal, NOT a redirect, NOT a separate page
- LeadForm collects: nome, telefone, email — in that order, all required
- After submission, lead is saved to DB and user gets confirmation message from agent

### LeadForm Component
- Uses shadcn/studio Pro `multi-step-form` inspiration via `/iui` — adapted as inline chat artifact
- Form validation with Zod + react-hook-form (already in stack)
- Mobile-first: full-width inputs, 44px touch targets, auto-focus on first field
- Form appears as an artifact type `lead_form` in the ArtifactRenderer dispatch

### capture_lead Tool
- New agent tool that saves lead data to the `leads` table in DB
- References the current conversationId
- PII (nome, telefone, email) stored in `leads` table, NOT in `messages` or `artifacts` tables (DATA-03)
- Tool returns confirmation text for agent to relay to user

### Integration with RecommendationCard
- RecommendationCard's "Tenho interesse" CTA currently dispatches CustomEvent
- Phase 5 replaces this with `present_lead_form` presentation tool call
- Agent detects interest and presents the LeadForm artifact

### Claude's Discretion
- Exact form field order and validation UX (inline vs summary)
- Agent wording when presenting the form and after submission
- Error handling for duplicate leads (same phone/email)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Presentation tool pattern from `src/lib/agent/tools/presentation.ts`
- ArtifactRenderer dispatch at `src/components/chat/artifact-renderer.tsx`
- `leads` table already exists in DB schema (Phase 1)
- react-hook-form + zod already in dependencies
- shadcn/ui Input component already installed

### Established Patterns
- Presentation tool → `_artifact` marker → SSE event → ArtifactRenderer → Component
- Zod validation on tool parameters
- DB operations via Drizzle ORM

### Integration Points
- `src/lib/agent/tools/presentation.ts` — add present_lead_form
- `src/lib/agent/tools/index.ts` — register new tools
- `src/components/chat/artifact-renderer.tsx` — add lead_form dispatch
- `src/lib/chat/types.ts` — add LeadFormPayload type
- `src/lib/agent/system-prompt.ts` — add lead capture instructions
- `src/components/chat/artifacts/recommendation-card.tsx` — update CTA behavior
- `src/db/schema.ts` — verify leads table has correct fields

</code_context>

<specifics>
## Specific Ideas

No specific requirements — autonomous mode.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>

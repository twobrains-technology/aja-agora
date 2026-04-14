# Phase 10: Conversation Replay & AI Insights - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Build a conversation viewer that replays the full chat history with inline artifacts when an admin clicks a lead card, and generate AI-powered insights per lead (intent, budget, objections, suggested next action). This is the intelligence layer on top of the pipeline.

</domain>

<decisions>
## Implementation Decisions

### Lead Detail Panel
- **D-01:** Clicking a lead card in the Kanban opens a slide-over panel (Sheet) on the right side — NOT a new page, NOT a modal
- **D-02:** Panel shows two tabs: "Conversa" (conversation replay) and "Insights" (AI analysis)
- **D-03:** Panel header shows lead name, stage badge, channel icon, and created date
- **D-04:** Panel has a close button and clicking outside closes it

### Conversation Replay
- **D-05:** Messages render in a chat-like timeline with role indicators (user bubble left/blue, assistant bubble right/gray)
- **D-06:** Each message shows timestamp (relative, e.g. "há 2h")
- **D-07:** Artifacts (GroupCard, SimulationResult, RecommendationCard) render inline in the timeline as compact visual previews — NOT full interactive components, just read-only previews
- **D-08:** Artifact previews show type icon + key info (e.g. "Simulação: R$ 800/mês, 60 meses, Bevi")
- **D-09:** Messages fetched via `GET /api/admin/leads/[id]/conversation` — returns messages + artifacts for the lead's conversation
- **D-10:** Conversation auto-scrolls to bottom (most recent) on open

### AI Insights
- **D-11:** Insights generated on-demand when admin opens the "Insights" tab for the first time
- **D-12:** Call Claude API to analyze the conversation and extract: detected intent (what they want), estimated budget (monthly + total), key objections (if any), recommended next action for the seller
- **D-13:** Insights cached in `lead_insights` table — one row per insight type per lead
- **D-14:** If cached insights exist and are < 1 hour old, use cached. Otherwise regenerate.
- **D-15:** API route: `POST /api/admin/leads/[id]/insights` — generates/returns insights
- **D-16:** Use Claude Haiku for insight generation (fast + cheap) via `@ai-sdk/anthropic`
- **D-17:** Insights display as cards: Intent card, Budget card, Objections card, Next Action card — each with icon and formatted content

### Claude's Discretion
- Exact prompt for insight generation (but must extract: intent, budget, objections, next_action)
- Visual design of insight cards
- Loading states during insight generation
- Error handling if Claude API fails
- Conversation timeline visual details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database
- `src/db/schema.ts` — leads, messages, artifacts, lead_insights tables
- `src/db/index.ts` — DB instance

### Existing Components
- `src/components/admin/pipeline/lead-card.tsx` — Lead card (needs onClick handler)
- `src/components/admin/pipeline/kanban-board.tsx` — Board (needs to pass click handler)
- `src/components/chat/artifacts/` — Existing artifact components for reference

### Admin Infrastructure
- `src/lib/admin/require-role.ts` — Role-gated API helper
- `src/lib/auth.ts` — Auth config
- `src/components/ui/` — shadcn/ui components (Sheet, Tabs, ScrollArea, Skeleton, Badge)

### Chat Data
- `src/app/api/chat/route.ts` — How messages/artifacts are stored
- `src/lib/chat/types.ts` — Message and Artifact types

### Requirements
- `.planning/REQUIREMENTS.md` §Backoffice — BACK-07, BACK-08

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- shadcn/ui Sheet component (may need to install)
- shadcn/ui Tabs component (may need to install)
- shadcn/ui ScrollArea already installed
- Existing artifact type definitions in `src/lib/chat/types.ts`
- Artifact renderer pattern in `src/components/chat/artifact-renderer.tsx`
- @ai-sdk/anthropic already in dependencies for Claude API calls

### Established Patterns
- Drizzle queries with joins (conversations → messages → artifacts)
- API routes with requireRole() protection
- Client components with fetch + loading states

### Integration Points
- `src/components/admin/pipeline/lead-card.tsx` — Add onClick to open detail panel
- `src/components/admin/pipeline/kanban-board.tsx` — Render Sheet panel
- New API routes under `/api/admin/leads/[id]/`

</code_context>

<specifics>
## Specific Ideas

- The conversation replay should feel like reading a chat log — familiar UX for the admin
- Artifact previews should be compact but informative — admin needs to understand what the AI showed without full interactive components
- AI insights should feel like a smart assistant summarizing the conversation — actionable, not just descriptive
- The "Next Action" insight is the most valuable — it tells the seller exactly what to do next

</specifics>

<deferred>
## Deferred Ideas

- Full interactive artifact replay (click to expand to full size) — future enhancement
- Insight history/versioning — only latest cached for now
- Conversation export (PDF/email) — future phase
- Real-time conversation monitoring (live feed) — future phase
- Sentiment analysis timeline — future enhancement

</deferred>

---

*Phase: 10-conversation-replay-ai-insights*
*Context gathered: 2026-04-14*

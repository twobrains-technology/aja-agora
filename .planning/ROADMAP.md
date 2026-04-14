# Roadmap: Aja Agora

**Milestone:** v1.0 — MVP
**Created:** 2026-04-11
**Phases:** 11
**Requirements:** 44 mapped

## Phase 1: Project Foundation & Infrastructure

**Goal:** Scaffold the Next.js 16 project with Docker, design system, database, and dev tooling so all subsequent phases build on a stable, deployable base.
**Requirements:** FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, DATA-01
**UI hint:** no

### Success Criteria
1. `docker compose up` starts the app and PostgreSQL, accessible at localhost
2. `npx drizzle-kit migrate` runs without errors and creates conversations, messages, artifacts, and leads tables
3. shadcn/ui Button and Card components render correctly in a test page
4. Biome lint and format pass with zero errors on the scaffolded codebase
5. `docker build` produces a standalone image under 500MB

---

## Phase 2: Agent Core & Adapter Layer

**Goal:** Build the conversational agent with Claude, domain tools, deterministic recommendation pipeline, and the adapter abstraction that decouples all administradora data access behind a typed interface with mock implementation.
**Requirements:** AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06, AGENT-08, ADAPT-01, ADAPT-02, ADAPT-03, DATA-02, DATA-04
**UI hint:** no

### Success Criteria
1. Agent responds to "quero comprar um carro de 80 mil" by calling `search_groups` and returning structured group results
2. `simulate_quota` returns deterministic parcela/taxa/prazo calculations — same input always produces same output
3. System prompt includes BACEN disclaimers and agent refuses to fabricate financial numbers when tested with adversarial prompts
4. Swapping `ADMINISTRADORA_ADAPTER=mock` to a different value triggers the factory pattern (no code changes needed)
5. Two concurrent conversations cannot access each other's data (session isolation verified)

---

## Phase 3: Chat UI & Artifact Rendering

**Goal:** Build the chat interface with SSE streaming, artifact renderer, and all interactive components so users can converse with the agent and interact with visual cards, tables, and simulations.
**Requirements:** CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-08, CHAT-09, AGENT-07
**UI hint:** yes

### Success Criteria
1. User types a message and sees streaming text response appear token-by-token with a typing indicator
2. GroupCard, ComparisonTable, and SimulationResult render inline in the chat when the agent calls presentation tools
3. All artifact components are interactive — GroupCard is clickable, SimulationResult shows cost breakdown
4. Chat UI is fully usable on a 320px-wide viewport with no horizontal scroll or clipped content
5. Artifact entry animations are smooth (no jank on mid-range mobile devices)

---

## Phase 4: Recommendation & What-If Scenarios

**Goal:** Deliver the RecommendationCard with actionable CTA and enable real-time scenario exploration where users alter parameters and the agent recalculates instantly.
**Requirements:** CHAT-07, CHAT-10
**UI hint:** yes
**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — RecommendationCard component + presentRecommendation tool + type/dispatch/route wiring
- [ ] 04-02-PLAN.md — What-if scenario detection + recommendation presentation instructions in system prompt

### Success Criteria
1. Agent delivers a RecommendationCard with administradora, prazo, taxa, historico, and a visible action button
2. User says "e se eu mudar pra R$ 1000/mes" and agent recalculates and delivers updated artifacts within 3 seconds
3. RecommendationCard renders correctly on mobile with the action button clearly tappable

---

## Phase 5: Conversion & Progressive Auth

**Goal:** Implement progressive authentication and lead capture so anonymous users are prompted for contact data at the natural conversion point — inline in the chat — and leads are persisted to the database.
**Requirements:** CONV-01, CONV-02, CONV-03, DATA-03
**UI hint:** yes

### Success Criteria
1. User converses anonymously until reaching a recommendation, then is prompted with an inline LeadForm
2. LeadForm captures nome, telefone, and email without leaving the chat
3. `capture_lead` tool saves lead data to the database with a reference to the conversation
4. PII (nome, telefone, email) is stored separately from conversation logs — verified by inspecting DB tables

### Phase 7: WhatsApp Cloud API integration — route AI agent through WhatsApp with Meta native components

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 6
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 7 to break down)

---

## Phase 6: Landing Page

**Goal:** Build the public-facing landing page with hero section, benefits, social proof, and a CTA that routes users into the chat experience.
**Requirements:** LAND-01, LAND-02, LAND-03, LAND-04
**UI hint:** yes

### Success Criteria
1. Landing page loads at `/` with a hero section, benefits section, "como funciona" section, and social proof
2. CTA button navigates the user to the chat experience
3. Page scores 90+ on Lighthouse mobile performance
4. Design is consistent with the shadcn/ui design system used in the chat

---

## Phase 8: Backoffice Auth & Layout

**Goal:** Implement admin authentication with NextAuth credentials provider and build the backoffice shell (sidebar, header, protected routes) with database schema extensions for funnel stages, lead events, and AI insights.
**Requirements:** BACK-01, BACK-02, BACK-03, BSEC-01, BSEC-02
**Depends on:** Phase 5
**UI hint:** yes

### Success Criteria
1. Admin can login at `/admin/login` with email/password credentials
2. Unauthenticated access to `/admin/*` redirects to login page
3. Admin layout renders with sidebar navigation (Pipeline, Conversas, Dashboard) and user header
4. Database migrations create `lead_stages`, `lead_events`, `lead_insights`, and `admin_users` tables without errors
5. Two admin roles (admin, viewer) are enforced — viewer cannot move leads between stages

---

## Phase 9: Lead Pipeline Kanban

**Goal:** Build the Kanban board for lead pipeline management with drag-and-drop between funnel stages, lead cards with summary info, filters, and automatic stage transitions based on chat events.
**Requirements:** BACK-04, BACK-05, BACK-06, BACK-09, BSEC-03
**Depends on:** Phase 8
**UI hint:** yes

### Success Criteria
1. Kanban board at `/admin/pipeline` shows columns for each funnel stage (Novo, Engajado, Qualificado, Em Negociacao, Proposta Enviada, Fechado Ganho, Perdido)
2. Lead cards display name, channel icon (web/whatsapp), time in stage, and credit value
3. Dragging a card between columns updates the stage in the database and logs an event
4. Filters by channel, stage, date range, and text search work correctly
5. When a new lead is captured via chat, it automatically appears in the "Novo" column within 5 seconds (polling or real-time)

---

## Phase 10: Conversation Replay & AI Insights

**Goal:** Build a conversation viewer that replays the full chat history with inline artifacts, and generate AI-powered insights per lead (intent, budget, objections, suggested next action).
**Requirements:** BACK-07, BACK-08
**Depends on:** Phase 9
**UI hint:** yes

### Success Criteria
1. Clicking a lead card opens a detail panel with the full conversation timeline
2. Messages render with role indicators (user/assistant) and timestamps
3. Artifacts (GroupCard, SimulationResult, RecommendationCard) render inline in the timeline as visual previews
4. AI insights panel shows: detected intent, estimated budget, key objections, and recommended next action
5. Insights are generated on-demand when admin views a lead for the first time, then cached

---

## Phase 11: Dashboard & Funnel Analytics

**Goal:** Build the analytics dashboard with funnel visualization, KPI cards, lead volume timeline, and channel breakdown so business owners can track conversion performance at a glance.
**Requirements:** BACK-10, BACK-11
**Depends on:** Phase 9
**UI hint:** yes

### Success Criteria
1. Dashboard at `/admin` shows a funnel chart with conversion rates between each stage
2. KPI cards display: total leads, leads today, average time in funnel, overall conversion rate
3. Timeline chart shows lead volume over the last 30 days
4. Channel breakdown (web vs whatsapp) is visible as a pie/donut chart
5. All metrics update when date range filter is changed

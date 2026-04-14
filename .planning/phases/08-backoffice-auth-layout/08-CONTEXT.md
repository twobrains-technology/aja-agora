# Phase 8: Backoffice Auth & Layout - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Implement admin authentication with NextAuth credentials provider and build the backoffice shell (sidebar navigation, header, protected routes) with database schema extensions for funnel stages, lead transition events, and AI-generated insights. This phase delivers the foundation — no business logic or data visualization yet.

</domain>

<decisions>
## Implementation Decisions

### Authentication Strategy
- **D-01:** Use NextAuth.js with CredentialsProvider — email + bcrypt-hashed password
- **D-02:** Session strategy: JWT (stateless, no session table needed for MVP)
- **D-03:** Admin users stored in `admin_users` table (separate from consumer leads)
- **D-04:** Login page at `/admin/login` — standalone page, not part of the admin layout shell
- **D-05:** Middleware protects all `/admin/*` routes except `/admin/login` — redirect to login if unauthenticated

### Role System
- **D-06:** Two roles: `admin` (full access, can move leads, edit) and `viewer` (read-only, can view pipeline and conversations)
- **D-07:** Role stored as enum column on `admin_users` table
- **D-08:** Role enforcement at API route level (middleware checks role before mutations)

### Admin Layout
- **D-09:** Sidebar layout with three main sections: Pipeline (Kanban), Conversas (list), Dashboard (analytics)
- **D-10:** Sidebar collapsible on mobile — hamburger menu pattern
- **D-11:** Header shows current admin name, role badge, and logout button
- **D-12:** Use shadcn/ui components (Sidebar, NavigationMenu, Avatar, Badge, Button) — DO NOT build from scratch
- **D-13:** Dark/light mode support using existing Tailwind CSS theme variables

### Database Schema Extensions
- **D-14:** Add `stage` column to `leads` table — enum: `novo`, `engajado`, `qualificado`, `em_negociacao`, `proposta_enviada`, `fechado_ganho`, `perdido`. Default: `novo`
- **D-15:** New `lead_events` table: id (uuid), lead_id (FK→leads), from_stage, to_stage, actor_type (enum: `system`, `admin`), actor_id (nullable uuid), notes (text), created_at
- **D-16:** New `lead_insights` table: id (uuid), lead_id (FK→leads), insight_type (enum: `summary`, `intent`, `budget`, `objections`, `next_action`), content (text), generated_at, model (varchar) — for caching AI-generated insights
- **D-17:** New `admin_users` table: id (uuid), name (varchar 100), email (varchar 255, unique), password_hash (text), role (enum: `admin`, `viewer`), created_at, updated_at
- **D-18:** Seed script to create initial admin user (email/password from env vars: `ADMIN_EMAIL`, `ADMIN_PASSWORD`)

### Route Structure
- **D-19:** `/admin/login` — login page (public)
- **D-20:** `/admin` — dashboard (protected, default redirect after login)
- **D-21:** `/admin/pipeline` — Kanban board (protected)
- **D-22:** `/admin/conversations` — conversation list (protected)
- **D-23:** All admin API routes under `/api/admin/*` — protected by auth middleware

### Claude's Discretion
- Exact sidebar visual design and animations
- Login page styling (keep consistent with existing design system)
- Error messages and validation UX on login form
- Session expiration time (suggest 24h for convenience)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database
- `src/db/schema.ts` — Current Drizzle schema (conversations, messages, artifacts, leads tables)
- `src/db/index.ts` — Drizzle DB instance singleton
- `drizzle.config.ts` — Migration configuration

### Auth & Middleware
- `src/lib/middleware/rate-limit.ts` — Existing middleware pattern (token bucket)
- `src/app/api/chat/route.ts` — Example of API route with middleware

### UI Components
- `src/components/ui/` — Existing shadcn/ui components (button, card, input, etc.)
- `src/app/layout.tsx` — Root layout for reference

### Project Config
- `.planning/REQUIREMENTS.md` §Backoffice — BACK-01 through BACK-03, BSEC-01 through BSEC-02
- `.planning/ROADMAP.md` §Phase 8 — Success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- shadcn/ui components: Button, Card, Input, Badge, Table, Skeleton, Avatar, DropdownMenu — all installed
- Tailwind CSS 4 with CSS-native theme variables — dark/light mode ready
- Drizzle ORM with PostgreSQL — migration system in place
- Rate limit middleware pattern at `src/lib/middleware/rate-limit.ts`

### Established Patterns
- Drizzle schema with pgTable, pgEnum, uuid, timestamps
- API routes with request validation and error handling
- Single DB instance via singleton at `src/db/index.ts`

### Integration Points
- `src/db/schema.ts` — Add new tables and enums here
- `src/app/` — New `/admin` route group with its own layout
- `src/lib/middleware/` — New auth middleware alongside existing rate-limit
- Next.js middleware at `middleware.ts` (root) — for route protection

</code_context>

<specifics>
## Specific Ideas

- Funil stages align with marketing funnel: Novo → Engajado → Qualificado → Em Negociação → Proposta Enviada → Fechado Ganho / Perdido
- AI handles stages 1-3 automatically (Novo, Engajado, Qualificado), humans take over at stage 4+ (Em Negociação)
- In the future, an AI agent will handle stages 4-5 too — schema should be agent-friendly (actor_type supports both `system` and `admin`)
- The `lead_events` table is the audit trail for funnel transitions — every move is logged with who/what did it

</specifics>

<deferred>
## Deferred Ideas

- Email/SMS notifications on stage transitions — future phase
- Multi-tenant support (multiple companies) — out of scope for MVP
- OAuth providers (Google, etc.) — credentials sufficient for admin backoffice
- Real-time updates via WebSocket/SSE on Kanban — Phase 9 can use polling initially

</deferred>

---

*Phase: 08-backoffice-auth-layout*
*Context gathered: 2026-04-14*

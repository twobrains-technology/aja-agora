---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
last_updated: "2026-04-14T05:50:21.381Z"
progress:
  total_phases: 11
  completed_phases: 10
  total_plans: 27
  completed_plans: 27
  percent: 100
---

# Project State

## Current Phase

Phase: 11
Name: Lead Pipeline Kanban
Status: Complete (all 3 plans done)

## Progress

- Phase 1: Complete
- Phase 2: Complete
- Phase 3: Complete
- Phase 4: Complete
- Phase 5: Complete
- Phase 6: Complete
- Phase 7: Discussed (WhatsApp - deferred)
- Phase 8: Complete (auth + schema + admin layout shell)
- Phase 9: Complete (schema fix, API routes, Kanban board UI with DnD + filters, chat auto-transitions)
- Phase 10: Complete (conversation replay + AI insights)
- Phase 11: Complete (dashboard data layer API + dashboard UI with KPIs, funnel, charts)

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)
**Core value:** O usuário diz o que quer e recebe uma recomendação personalizada com botão para assinar
**Current focus:** Phase 11 — dashboard-funnel-analytics

## Blockers

None

## Notes

Project initialized 2026-04-11
Phases 1-6 (MVP core) completed
Phases 8-11 (Backoffice) added 2026-04-14 for lead funnel management

## Accumulated Context

### Roadmap Evolution

- Phase 7 added: WhatsApp Cloud API integration — route AI agent through WhatsApp with Meta native components
- Phases 8-11 added: Backoffice with auth, Kanban pipeline, conversation replay + AI insights, dashboard analytics
- Phase 8 Plan 01: Better Auth installed with Drizzle adapter, auth tables + funnel tables (lead_events, lead_insights, lead_stage enum) pushed to DB, proxy.ts route protection, admin seed script
- Phase 8 Plan 02: Admin login page (/admin/login), sidebar layout shell (Dashboard/Pipeline/Conversas), header with role badge + logout, requireRole API helper. Used render prop instead of asChild for shadcn/ui v4 SidebarMenuButton.
- Phase 9 Plan 01: Fixed lead_events.actorId uuid->text (Better Auth compat), added creditValue numeric(12,2) to leads, created transitionLeadStage shared function with forward-only guard, GET/PATCH API routes for lead pipeline, NuqsAdapter in admin layout, installed @hello-pangea/dnd + nuqs + date-fns + shadcn select/popover/calendar.
- Phase 9 Plan 02: Kanban board UI with @hello-pangea/dnd drag-and-drop, lead cards (name/channel/value/timing), 30s polling, optimistic DnD updates with rollback, client-side filters (channel/text/date) via nuqs URL state. Extracted STAGE_ORDER to client-safe lead-stages.ts. Suspense boundary for nuqs compatibility.
- Phase 9 Plan 03: Auto-transitions in chat route — TOOL_STAGE_MAP maps simulate_quota->engajado, recommend_groups->qualificado. Forward-only via transitionLeadStage with onlyAdvance:true, actor_type=system, try/catch for stream safety.
- Phase 10 Plan 01: Conversation replay panel — GET /api/admin/leads/[id]/conversation, Sheet slide-over with Conversa/Insights tabs, chat timeline with role bubbles + artifact previews, drag-safe click handling via wasDragging ref. Sheet rendered outside DragDropContext to avoid portal conflicts.
- Phase 10 Plan 02: AI insights — POST /api/admin/leads/[id]/insights generates intent/budget/objections/next_action via Claude Haiku with 1hr cache TTL. InsightCards component with 4 colored cards, on-demand rendering only when Insights tab opened. Markdown fence stripping for JSON parse safety.
- Phase 11 Plan 01: Dashboard data layer — GET /api/admin/dashboard with KPIs (totalLeads, leadsToday with America/Sao_Paulo TZ, avgFunnelDays, conversionRate + trends), funnel stages excluding "perdido", gap-filled daily volume timeline, web/whatsapp channel breakdown. Parallel SQL aggregations via Promise.all. Added leads_created_at_idx index.
- Phase 11 Plan 02: Dashboard UI — recharts via shadcn chart, 4 KPI cards with trend arrows (inverted for avgFunnelDays), CSS clip-path horizontal funnel (6 stages, no "perdido"), recharts AreaChart for lead volume, recharts PieChart donut for channels, DateRangeFilter with nuqs URL state, skeleton loading, responsive layout.

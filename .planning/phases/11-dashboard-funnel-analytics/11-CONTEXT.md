# Phase 11: Dashboard & Funnel Analytics - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Build the analytics dashboard with funnel visualization, KPI cards, lead volume timeline, and channel breakdown so business owners can track conversion performance at a glance. This is the final backoffice phase.

</domain>

<decisions>
## Implementation Decisions

### Dashboard Layout
- **D-01:** Dashboard at `/admin` (the default admin page after login)
- **D-02:** Layout: KPI cards row at top, funnel chart below, then two charts side-by-side (timeline + channel breakdown)
- **D-03:** Date range filter at top-right — affects all metrics (default: last 30 days)

### KPI Cards
- **D-04:** Four KPI cards: Total Leads, Leads Hoje, Tempo Médio no Funil (days), Taxa de Conversão (%)
- **D-05:** Each card shows: value, label, and trend indicator (up/down arrow + percentage vs previous period)
- **D-06:** Trend calculation: compare current period vs same-length previous period

### Funnel Chart
- **D-07:** Horizontal funnel visualization showing conversion rates between stages
- **D-08:** Each stage shows: count, percentage of total, and drop-off rate to next stage
- **D-09:** Visual: trapezoid/chevron shapes getting narrower left-to-right, color-coded per stage
- **D-10:** Implementation: CSS + divs (no heavy charting library needed for funnel shape)

### Lead Volume Timeline
- **D-11:** Line/area chart showing lead volume per day over the selected period
- **D-12:** Use recharts library (lightweight, React-native, well-maintained)
- **D-13:** X-axis: dates, Y-axis: lead count. Tooltip on hover shows exact count

### Channel Breakdown
- **D-14:** Donut/pie chart showing Web vs WhatsApp lead distribution
- **D-15:** Also use recharts for the donut chart
- **D-16:** Shows count and percentage per channel

### Data API
- **D-17:** Single API route: `GET /api/admin/dashboard` — returns all dashboard metrics in one call
- **D-18:** Query parameters: `from` and `to` dates for filtering
- **D-19:** Response includes: kpis, funnel_stages, daily_volume, channel_breakdown
- **D-20:** All calculations done server-side via SQL/Drizzle aggregations

### Claude's Discretion
- Exact chart colors and styling
- Animation on chart load
- Responsive layout breakpoints
- Empty state when no leads exist
- Loading skeleton design

</decisions>

<canonical_refs>
## Canonical References

### Database
- `src/db/schema.ts` — leads table (stage, channel, createdAt), lead_events table
- `src/db/index.ts` — DB instance

### Admin Infrastructure
- `src/app/admin/(dashboard)/page.tsx` — Current dashboard placeholder (to replace)
- `src/app/admin/(dashboard)/layout.tsx` — Admin layout
- `src/lib/admin/require-role.ts` — API protection

### Requirements
- `.planning/REQUIREMENTS.md` §Backoffice — BACK-10, BACK-11

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- shadcn/ui Card, Badge, Skeleton already installed
- Admin layout shell ready
- Drizzle ORM for aggregation queries
- date-fns for date formatting

### Integration Points
- `src/app/admin/(dashboard)/page.tsx` — Replace placeholder with dashboard
- `src/app/api/admin/dashboard/route.ts` — New API route

</code_context>

<specifics>
## Specific Ideas

- Dashboard should feel like a "war room" overview — owner glances and understands performance instantly
- Funnel visualization is the hero element — shows where leads are dropping off
- Keep it simple and clean — no overwhelming amount of charts

</specifics>

<deferred>
## Deferred Ideas

- Cohort analysis (leads by month of acquisition) — future
- Revenue forecasting — future
- Exportar relatórios (PDF/CSV) — future
- Comparação entre períodos (este mês vs anterior) — future enhancement beyond trend arrows

</deferred>

---

*Phase: 11-dashboard-funnel-analytics*
*Context gathered: 2026-04-14*

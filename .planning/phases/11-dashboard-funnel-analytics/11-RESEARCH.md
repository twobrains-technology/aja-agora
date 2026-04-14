# Phase 11: Dashboard & Funnel Analytics - Research

**Researched:** 2026-04-14
**Domain:** Analytics dashboard with charts, KPIs, and funnel visualization
**Confidence:** HIGH

## Summary

This phase builds the analytics dashboard at `/admin` — the default landing page for admin users. The dashboard aggregates lead data into 4 KPI cards, a CSS-based funnel chart, a lead volume timeline (area chart), and a channel breakdown donut chart. All metrics come from a single API endpoint with date range filtering.

The codebase already has the full data layer (`leads`, `lead_events` tables with stage tracking and channel enum), admin auth infrastructure (`requireRole`), shadcn/ui components (Card, Skeleton, Calendar, Popover), and nuqs for URL state management. The main new addition is `recharts` (via shadcn/ui `chart` component) for the timeline and donut charts. The funnel is CSS-only per decision D-10.

**Primary recommendation:** Install shadcn/ui `chart` component (brings recharts 3.8.x + chart wrapper), build a single SQL-heavy API route with Drizzle aggregations, and compose the dashboard page from server components that fetch data with client chart wrappers.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Dashboard at `/admin` (the default admin page after login)
- **D-02:** Layout: KPI cards row at top, funnel chart below, then two charts side-by-side (timeline + channel breakdown)
- **D-03:** Date range filter at top-right — affects all metrics (default: last 30 days)
- **D-04:** Four KPI cards: Total Leads, Leads Hoje, Tempo Medio no Funil (days), Taxa de Conversao (%)
- **D-05:** Each card shows: value, label, and trend indicator (up/down arrow + percentage vs previous period)
- **D-06:** Trend calculation: compare current period vs same-length previous period
- **D-07:** Horizontal funnel visualization showing conversion rates between stages
- **D-08:** Each stage shows: count, percentage of total, and drop-off rate to next stage
- **D-09:** Visual: trapezoid/chevron shapes getting narrower left-to-right, color-coded per stage
- **D-10:** Implementation: CSS + divs (no heavy charting library needed for funnel shape)
- **D-11:** Line/area chart showing lead volume per day over the selected period
- **D-12:** Use recharts library (lightweight, React-native, well-maintained)
- **D-13:** X-axis: dates, Y-axis: lead count. Tooltip on hover shows exact count
- **D-14:** Donut/pie chart showing Web vs WhatsApp lead distribution
- **D-15:** Also use recharts for the donut chart
- **D-16:** Shows count and percentage per channel
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

### Deferred Ideas (OUT OF SCOPE)
- Cohort analysis (leads by month of acquisition) -- future
- Revenue forecasting -- future
- Exportar relatorios (PDF/CSV) -- future
- Comparacao entre periodos (este mes vs anterior) -- future enhancement beyond trend arrows
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BACK-10 | Dashboard com funil visual, KPIs (leads/dia, tempo medio por estagio, taxa de conversao) e breakdown por canal | KPI cards (D-04..D-06), funnel chart (D-07..D-10), channel breakdown (D-14..D-16), single API (D-17..D-20) |
| BACK-11 | Timeline de volume de leads e grafico de conversao ao longo do tempo | Lead volume timeline via recharts area chart (D-11..D-13) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack:** Next.js 16 + shadcn/ui + Tailwind CSS 4 -- no alternatives
- **ORM:** Drizzle ORM -- all DB queries via Drizzle
- **Deploy:** Docker/VPS -- no serverless constraints
- **Design System:** shadcn/studio Pro blocks via MCP -- never create UI from scratch if a Pro block exists
- **Linting:** Biome -- not ESLint/Prettier
- **Animation:** Motion (ex Framer Motion) v12 -- import from `motion/react`
- **URL state:** nuqs -- already used in pipeline filters
- **Two SDK rule:** Claude Agent SDK for backend, AI SDK for frontend only (not relevant to this phase)

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | 3.8.x | Area chart + Donut chart | Decision D-12. shadcn/ui `chart` component wraps it. React-native, lightweight, composable. [VERIFIED: npm registry -- v3.8.1] |
| shadcn/ui chart | CLI v4 | Chart wrapper component | Provides `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend` that wrap recharts with Tailwind theming and accessibility. [VERIFIED: `npx shadcn@latest add chart --dry-run`] |

### Already Installed (no new dependencies beyond recharts)
| Library | Version | Purpose |
|---------|---------|---------|
| drizzle-orm | 0.45.x | SQL aggregations (count, avg, sql template) |
| nuqs | 2.8.x | URL state for date range filter |
| date-fns | 4.1.x | Date formatting, date arithmetic |
| shadcn/ui Card | installed | KPI card containers |
| shadcn/ui Skeleton | installed | Loading states |
| shadcn/ui Calendar | installed | Date picker in filter |
| shadcn/ui Popover | installed | Date picker popover |
| lucide-react | installed | Icons (TrendingUp, TrendingDown, etc.) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | Nivo, Victory | Heavier bundle, more features but overkill for 2 charts. recharts is decision D-12 -- locked. |
| CSS funnel | D3.js funnel | Decision D-10 locked: CSS-only. D3 adds ~100KB for a simple shape. |

**Installation:**
```bash
npx shadcn@latest add chart
```
This installs `recharts@3.8.x` as a dependency and creates `src/components/ui/chart.tsx`. [VERIFIED: dry-run output]

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/admin/(dashboard)/
│   └── page.tsx                    # Server component — fetches data, renders dashboard
├── app/api/admin/dashboard/
│   └── route.ts                    # GET handler with date filtering
├── components/admin/dashboard/
│   ├── date-range-filter.tsx       # Client — nuqs date pickers
│   ├── kpi-cards.tsx               # Client — 4 KPI cards with trend arrows
│   ├── funnel-chart.tsx            # Client — CSS-based horizontal funnel
│   ├── lead-volume-chart.tsx       # Client — recharts AreaChart
│   └── channel-breakdown-chart.tsx # Client — recharts PieChart (donut)
└── lib/admin/
    └── dashboard-queries.ts        # Server — Drizzle SQL aggregations
```

### Pattern 1: Single API Route with SQL Aggregations
**What:** One GET endpoint computes all dashboard metrics in a single request using parallel SQL queries.
**When to use:** Dashboard data that changes together and shares date range filter.
**Example:**
```typescript
// src/app/api/admin/dashboard/route.ts
import { db } from "@/db";
import { leads, leadEvents, conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { sql, count, eq, gte, lte, and, between } from "drizzle-orm";

export async function GET(request: Request) {
  const { error } = await requireRole("admin", "viewer");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? /* 30 days ago ISO */;
  const to = searchParams.get("to") ?? /* today ISO */;

  // Run aggregations in parallel
  const [kpis, funnelStages, dailyVolume, channelBreakdown] = await Promise.all([
    computeKpis(from, to),
    computeFunnelStages(from, to),
    computeDailyVolume(from, to),
    computeChannelBreakdown(from, to),
  ]);

  return Response.json({ kpis, funnel_stages: funnelStages, daily_volume: dailyVolume, channel_breakdown: channelBreakdown });
}
```
[ASSUMED -- pattern based on existing leads route.ts pattern in codebase]

### Pattern 2: Drizzle SQL Aggregation for KPIs
**What:** Use Drizzle's `sql` template tag for complex aggregations that go beyond simple `count()`.
**Example:**
```typescript
import { sql, count, avg, eq, gte, lte, and } from "drizzle-orm";

// Total leads in period
const totalLeads = await db
  .select({ count: count() })
  .from(leads)
  .where(and(gte(leads.createdAt, fromDate), lte(leads.createdAt, toDate)));

// Leads today
const leadsToday = await db
  .select({ count: count() })
  .from(leads)
  .where(gte(leads.createdAt, sql`CURRENT_DATE`));

// Average time in funnel (days) -- from lead creation to latest event
const avgTime = await db.execute(sql`
  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (le.created_at - l.created_at)) / 86400), 1) as avg_days
  FROM leads l
  JOIN lead_events le ON le.lead_id = l.id
  WHERE l.created_at BETWEEN ${fromDate} AND ${toDate}
    AND le.to_stage IN ('fechado_ganho', 'perdido')
`);

// Conversion rate: fechado_ganho / total
const conversionRate = await db.execute(sql`
  SELECT
    COUNT(*) FILTER (WHERE stage = 'fechado_ganho') * 100.0 / NULLIF(COUNT(*), 0) as rate
  FROM leads
  WHERE created_at BETWEEN ${fromDate} AND ${toDate}
`);
```
[ASSUMED -- Drizzle sql template tag pattern, verified Drizzle supports raw SQL via `db.execute(sql\`...\`)`]

### Pattern 3: Trend Calculation (D-06)
**What:** Compare current period vs previous period of same length for trend arrows.
**Example:**
```typescript
import { subDays, differenceInDays } from "date-fns";

function computeTrendDates(from: Date, to: Date) {
  const periodLength = differenceInDays(to, from);
  const prevFrom = subDays(from, periodLength);
  const prevTo = subDays(to, periodLength);
  return { prevFrom, prevTo };
}

// Then run same aggregation for both periods and compute % change
const trendPercent = prevValue === 0
  ? (currentValue > 0 ? 100 : 0)
  : Math.round(((currentValue - prevValue) / prevValue) * 100);
```
[ASSUMED -- standard trend calculation pattern]

### Pattern 4: CSS Funnel Chart (D-10)
**What:** Pure CSS trapezoid shapes using `clip-path` polygons, no charting library.
**Example:**
```tsx
// Each stage is a div with clip-path creating a trapezoid/chevron shape
const stages = [
  { name: "Novo", count: 45, color: "bg-blue-500" },
  { name: "Engajado", count: 32, color: "bg-cyan-500" },
  // ...
];

// Width proportional to count relative to first stage
<div className="flex items-center gap-1">
  {stages.map((stage, i) => {
    const widthPercent = (stage.count / stages[0].count) * 100;
    return (
      <div
        key={stage.name}
        className={`${stage.color} text-white px-4 py-3 text-center`}
        style={{
          width: `${widthPercent}%`,
          clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)",
        }}
      >
        <div className="font-bold">{stage.count}</div>
        <div className="text-xs opacity-80">{stage.name}</div>
      </div>
    );
  })}
</div>
```
[ASSUMED -- common CSS funnel pattern]

### Pattern 5: shadcn/ui Chart Component with recharts
**What:** Use the shadcn Chart wrapper for consistent theming and tooltips.
**Example:**
```tsx
"use client";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const chartConfig = {
  leads: { label: "Leads", color: "var(--chart-1)" },
};

export function LeadVolumeChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area type="monotone" dataKey="count" fill="var(--color-leads)" stroke="var(--color-leads)" fillOpacity={0.3} />
      </AreaChart>
    </ChartContainer>
  );
}
```
[CITED: shadcn/ui chart docs pattern -- verified via dry-run that chart component creates ChartContainer/ChartTooltip]

### Pattern 6: Date Range Filter with nuqs
**What:** URL-based date state using nuqs `parseAsIsoDate`, matching existing pipeline-filters pattern.
**Example:**
```tsx
"use client";
import { useQueryState, parseAsIsoDate } from "nuqs";
import { subDays, format } from "date-fns";

export function DateRangeFilter() {
  const [from, setFrom] = useQueryState("from", parseAsIsoDate.withDefault(subDays(new Date(), 30)));
  const [to, setTo] = useQueryState("to", parseAsIsoDate.withDefault(new Date()));
  // ... Calendar pickers using existing shadcn Popover + Calendar
}
```
[VERIFIED: existing pattern in `src/components/admin/pipeline/pipeline-filters.tsx` uses `parseAsIsoDate` from nuqs]

### Anti-Patterns to Avoid
- **Client-side aggregation:** Never fetch all leads and aggregate in JavaScript. SQL does this 100x faster. All computation via Drizzle/SQL (D-20).
- **Multiple API calls:** Don't create separate endpoints for KPIs, funnel, timeline, channel. One endpoint, one round-trip (D-17).
- **Heavy funnel library:** Don't install a charting library just for the funnel. CSS clip-path is sufficient (D-10).
- **Hardcoded stage list:** Import `STAGE_ORDER` from `@/lib/admin/lead-stages` -- it's the single source of truth for funnel stages.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Area/Line chart | Custom SVG/Canvas | recharts AreaChart via shadcn chart | Tooltips, responsiveness, animations for free |
| Donut chart | Custom SVG circles | recharts PieChart via shadcn chart | Label positioning, hover states, legends |
| Chart theming | Manual color management | shadcn ChartContainer + CSS variables | Consistent with design system, dark mode ready |
| Date range URL state | useState + manual URL sync | nuqs parseAsIsoDate | Already used in pipeline, handles SSR correctly |
| Loading skeletons | Custom shimmer divs | shadcn Skeleton component | Already installed, consistent with rest of admin |

**Key insight:** The only genuinely custom component is the CSS funnel -- everything else has a ready-made solution in the existing stack.

## Common Pitfalls

### Pitfall 1: Timezone Mismatch in Date Aggregations
**What goes wrong:** SQL `CURRENT_DATE` uses server timezone while JS `new Date()` uses UTC or client timezone, causing "Leads Hoje" to show wrong count.
**Why it happens:** PostgreSQL timestamps are `WITH TIME ZONE`, but date comparisons can be ambiguous.
**How to avoid:** Always pass explicit date boundaries from the API handler. Use `startOfDay`/`endOfDay` from date-fns with explicit timezone handling. Use `AT TIME ZONE 'America/Sao_Paulo'` in SQL for "today" calculations.
**Warning signs:** KPI showing yesterday's leads as "today" or vice versa near midnight.

### Pitfall 2: Division by Zero in Conversion Rate
**What goes wrong:** When no leads exist in the period, conversion rate calculation divides by zero.
**Why it happens:** Empty period with no leads.
**How to avoid:** Use `NULLIF(COUNT(*), 0)` in SQL division. Handle null/0 in the API response. Show "N/A" or "0%" in the UI.
**Warning signs:** NaN or Infinity appearing in KPI cards.

### Pitfall 3: "Perdido" Stage in Funnel
**What goes wrong:** Including "perdido" (lost) leads in the linear funnel makes it look like a stage between "proposta_enviada" and "fechado_ganho", when it's actually a terminal state from any stage.
**Why it happens:** `STAGE_ORDER` includes "perdido" at the end.
**How to avoid:** Exclude "perdido" from the funnel visualization. Show it separately as a "lost" indicator or in KPIs. The funnel should show the happy path: novo -> engajado -> qualificado -> em_negociacao -> proposta_enviada -> fechado_ganho.
**Warning signs:** Funnel showing bizarre conversion where leads "pass through" perdido to reach fechado_ganho.

### Pitfall 4: Empty Charts on Fresh Install
**What goes wrong:** recharts crashes or renders ugly when data array is empty.
**Why it happens:** No leads yet, or date range has no data.
**How to avoid:** Always check for empty data before rendering chart. Show a meaningful empty state ("Sem dados no periodo selecionado"). Set reasonable Y-axis defaults.
**Warning signs:** Blank white space where chart should be, or console errors from recharts.

### Pitfall 5: recharts SSR Hydration Mismatch
**What goes wrong:** recharts uses browser APIs (ResizeObserver, window dimensions) that don't exist on server.
**Why it happens:** Next.js Server Components try to render recharts on server.
**How to avoid:** All chart components MUST be `"use client"` components. The `ChartContainer` from shadcn handles responsive sizing via `ResponsiveContainer`.
**Warning signs:** Hydration error in console, chart renders with wrong dimensions on first load.

### Pitfall 6: Slow Dashboard with Large Lead Volumes
**What goes wrong:** Dashboard takes 5+ seconds to load as lead count grows.
**Why it happens:** Unindexed date range queries, scanning full tables.
**How to avoid:** Ensure `leads.created_at` has an index (check if one exists or add). Use `BETWEEN` for date ranges. The `Promise.all` parallel query pattern keeps total latency to the slowest single query.
**Warning signs:** Dashboard loading time increases linearly with lead count.

## Code Examples

### Drizzle Count with Group By (daily volume)
```typescript
// Source: Drizzle ORM docs pattern
import { sql, count, gte, lte, and } from "drizzle-orm";

const dailyVolume = await db
  .select({
    date: sql<string>`DATE(${leads.createdAt} AT TIME ZONE 'America/Sao_Paulo')`.as("date"),
    count: count(),
  })
  .from(leads)
  .where(and(gte(leads.createdAt, fromDate), lte(leads.createdAt, toDate)))
  .groupBy(sql`DATE(${leads.createdAt} AT TIME ZONE 'America/Sao_Paulo')`)
  .orderBy(sql`DATE(${leads.createdAt} AT TIME ZONE 'America/Sao_Paulo')`);
```
[ASSUMED -- Drizzle groupBy with sql template tag]

### Funnel Stage Counts
```typescript
const funnelStages = await db
  .select({
    stage: leads.stage,
    count: count(),
  })
  .from(leads)
  .where(and(gte(leads.createdAt, fromDate), lte(leads.createdAt, toDate)))
  .groupBy(leads.stage);
```
[ASSUMED -- standard Drizzle groupBy pattern]

### Channel Breakdown
```typescript
const channelBreakdown = await db
  .select({
    channel: conversations.channel,
    count: count(),
  })
  .from(leads)
  .innerJoin(conversations, eq(leads.conversationId, conversations.id))
  .where(and(gte(leads.createdAt, fromDate), lte(leads.createdAt, toDate)))
  .groupBy(conversations.channel);
```
[ASSUMED -- Drizzle join + groupBy]

### KPI Card Component Pattern
```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  trend: number; // percentage change
}

export function KpiCard({ title, value, trend }: KpiCardProps) {
  const isPositive = trend >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className={`text-xs ${isPositive ? "text-green-600" : "text-red-600"} flex items-center gap-1 mt-1`}>
          <TrendIcon className="h-3 w-3" />
          {Math.abs(trend)}% vs periodo anterior
        </p>
      </CardContent>
    </Card>
  );
}
```
[ASSUMED -- standard shadcn Card + Lucide pattern]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| recharts v2 class components | recharts v3 functional + hooks | 2024 | Use v3 API only |
| Custom chart wrappers | shadcn/ui `chart` component | 2024 | Use ChartContainer for theming |
| framer-motion | motion (v12) | 2025 | Import from `motion/react` |
| tailwind.config.js | Tailwind CSS v4 CSS-native | 2025 | CSS variables for chart colors |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Drizzle ORM supports `sql` template tag with `groupBy` for aggregations | Architecture Patterns | LOW -- Drizzle docs confirm sql template; fallback is raw `db.execute(sql\`...\`)` |
| A2 | `leads.createdAt` index exists or can be added without migration issues | Pitfalls | LOW -- can add index via Drizzle migration |
| A3 | shadcn chart component provides ChartContainer, ChartTooltip, ChartTooltipContent | Code Examples | LOW -- verified via dry-run output |
| A4 | recharts PieChart supports `innerRadius` prop for donut variant | Architecture | LOW -- standard recharts API |
| A5 | CSS clip-path is supported in all target browsers | CSS Funnel | LOW -- clip-path has 97%+ browser support |

## Open Questions

1. **Timezone for "Leads Hoje"**
   - What we know: PostgreSQL stores timestamps WITH TIME ZONE, the app serves Brazilian users
   - What's unclear: Whether to hardcode `America/Sao_Paulo` or use a config
   - Recommendation: Hardcode `America/Sao_Paulo` -- the product is 100% Brazilian market (CLAUDE.md says "Multi-idioma out of scope")

2. **Index on `leads.created_at`**
   - What we know: No existing index on this column (schema.ts shows no index)
   - What's unclear: Whether lead volume is large enough to need it now
   - Recommendation: Add index in this phase via migration -- it's cheap and prevents future slowness

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None configured currently |
| Config file | none |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BACK-10 | Dashboard API returns kpis, funnel_stages, channel_breakdown | integration | Manual via curl/browser | No |
| BACK-11 | Dashboard API returns daily_volume array | integration | Manual via curl/browser | No |

### Sampling Rate
- **Per task commit:** Manual browser verification (screenshot)
- **Per wave merge:** Full page load + verify all 4 sections render
- **Phase gate:** Dashboard loads with real data, all charts render correctly

### Wave 0 Gaps
- No test framework configured -- this phase is UI-heavy, manual verification via browser is appropriate
- Consider adding a smoke test for the API endpoint if test infrastructure is added later

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireRole("admin", "viewer")` on API route -- already implemented |
| V3 Session Management | yes | Better Auth session management -- already implemented |
| V4 Access Control | yes | Role-based access via `requireRole` -- already implemented |
| V5 Input Validation | yes | Validate `from`/`to` date params with Zod before SQL queries |
| V6 Cryptography | no | N/A -- read-only dashboard, no secrets |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via date params | Tampering | Drizzle parameterized queries -- never string-concatenate dates into SQL |
| Unauthorized dashboard access | Elevation of Privilege | `requireRole()` guard on API route |
| Data enumeration via date ranges | Information Disclosure | Already mitigated by auth -- only admins/viewers can access |

## Sources

### Primary (HIGH confidence)
- `src/db/schema.ts` -- leads table with stage enum, createdAt, conversationId; lead_events with fromStage/toStage
- `src/lib/admin/lead-stages.ts` -- STAGE_ORDER array (7 stages including perdido)
- `src/app/api/admin/leads/route.ts` -- existing API pattern with requireRole
- `src/components/admin/pipeline/pipeline-filters.tsx` -- existing nuqs + parseAsIsoDate pattern
- `npx shadcn@latest add chart --dry-run` -- confirmed chart component installs recharts@3.8.0 and creates chart.tsx
- npm registry -- recharts@3.8.1 current

### Secondary (MEDIUM confidence)
- Drizzle ORM sql template tag aggregation patterns
- recharts v3 API (AreaChart, PieChart, ResponsiveContainer)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- recharts version verified, shadcn chart verified, all other deps already installed
- Architecture: HIGH -- follows existing codebase patterns (requireRole, nuqs, shadcn Card)
- Pitfalls: HIGH -- timezone, division by zero, SSR hydration are well-known Next.js + recharts issues

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable domain, no fast-moving dependencies)

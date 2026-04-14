# Phase 8: Backoffice Auth & Layout - Research

**Researched:** 2026-04-14
**Domain:** Authentication (Better Auth), Admin Layout (shadcn/ui Sidebar), Drizzle Schema Extensions
**Confidence:** HIGH

## Summary

Phase 8 implements admin authentication using Better Auth with email/password and Drizzle adapter, builds a backoffice shell with sidebar navigation, and extends the database schema with funnel stages, lead events, and AI insights tables. Better Auth v1.6.2 is the current stable release and provides native Next.js integration including `toNextJsHandler` for API routes, `createAuthClient` for React hooks, and `additionalFields` for custom user fields (role). Next.js 16.2.3 renames `middleware.ts` to `proxy.ts` -- route protection should use `proxy.ts` with Node.js runtime for full session validation. shadcn/ui provides a production-ready Sidebar component that handles collapsible state, mobile sheet fallback, and cookie persistence.

**Primary recommendation:** Use Better Auth's `additionalFields` for the role enum (not a separate roles table), `proxy.ts` for route-level auth gating, and shadcn/ui Sidebar for the admin shell layout. Keep auth config in `src/lib/auth.ts` and client in `src/lib/auth-client.ts`.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use Better Auth (`better-auth`) with email+password plugin and Drizzle adapter (`drizzleAdapter(db, { provider: "pg" })`)
- **D-02:** Better Auth manages its own tables (user, session, account, verification) -- generate schema with `npx @better-auth/cli generate` then add to Drizzle migrations
- **D-03:** Auth handler at `src/app/api/auth/[...all]/route.ts` using `toNextJsHandler(auth)`
- **D-04:** Client-side auth via `createAuthClient()` from `better-auth/react` -- provides `useSession`, `signIn`, `signOut` hooks
- **D-05:** Login page at `/admin/login` -- standalone page, not part of the admin layout shell
- **D-06:** Middleware protects all `/admin/*` routes except `/admin/login` -- redirect to login if unauthenticated
- **D-07:** Two roles: `admin` (full access) and `viewer` (read-only)
- **D-08:** Role stored as `role` column on Better Auth's `user` table (custom field via schema extension)
- **D-09:** Role enforcement at API route level (middleware checks role before mutations)
- **D-09:** Sidebar layout with three sections: Pipeline (Kanban), Conversas (list), Dashboard (analytics)
- **D-10:** Sidebar collapsible on mobile -- hamburger menu pattern
- **D-11:** Header shows current admin name, role badge, and logout button
- **D-12:** Use shadcn/ui components (Sidebar, NavigationMenu, Avatar, Badge, Button) -- DO NOT build from scratch
- **D-13:** Dark/light mode support using existing Tailwind CSS theme variables
- **D-14:** Add `stage` column to `leads` table -- enum with 7 stages, default: `novo`
- **D-15:** New `lead_events` table with from_stage, to_stage, actor_type, actor_id, notes
- **D-16:** New `lead_insights` table for AI-generated insights cache
- **D-17:** Better Auth manages auth tables, add custom `role` field (enum: admin, viewer)
- **D-18:** Seed script for initial admin user via Better Auth API
- **D-19 to D-24:** Route structure: `/api/auth/[...all]`, `/admin/login`, `/admin`, `/admin/pipeline`, `/admin/conversations`, `/api/admin/*`

### Claude's Discretion
- Exact sidebar visual design and animations
- Login page styling (consistent with design system)
- Error messages and validation UX on login form
- Session expiration time (recommend 24h)

### Deferred Ideas (OUT OF SCOPE)
- Email/SMS notifications on stage transitions
- Multi-tenant support
- OAuth providers (Google, etc.)
- Real-time updates via WebSocket/SSE on Kanban

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BACK-01 | Admin authentication with protected credentials | Better Auth with email+password, `additionalFields` for role, `proxy.ts` for route protection |
| BACK-02 | Admin layout with sidebar, header, protected routes under /admin | shadcn/ui Sidebar component, Next.js route groups `(admin)`, `proxy.ts` matcher |
| BACK-03 | Database schema for funnel stages, transition events, AI insights | Drizzle pgEnum + pgTable extensions to existing schema.ts |
| BSEC-01 | /admin routes protected by auth middleware | `proxy.ts` with `auth.api.getSession()` for full session validation |
| BSEC-02 | Role separation (admin vs viewer) in auth system | Better Auth `additionalFields` with `input: false` to prevent self-assignment |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | 1.6.2 | Authentication framework | [VERIFIED: npm registry] User decision. Native Drizzle adapter, Next.js handler, email+password built-in. |
| `@better-auth/cli` | 1.4.21 | Schema generation CLI | [VERIFIED: npm registry] Generates auth tables (user, session, account, verification) for Drizzle. |
| shadcn/ui Sidebar | CLI v4 | Admin sidebar component | [VERIFIED: dry-run] Available via `npx shadcn@latest add sidebar`. Creates sidebar.tsx, sheet.tsx, use-mobile.ts. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Sheet | (included with Sidebar) | Mobile sidebar overlay | Automatically used by Sidebar on mobile breakpoint |
| `use-mobile` hook | (included with Sidebar) | Mobile detection | Sidebar mobile/desktop switching |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Better Auth | NextAuth/Auth.js | User locked decision -- Better Auth chosen for simpler API, better Drizzle integration |
| `proxy.ts` route protection | Per-page `getSession()` checks | proxy.ts is more maintainable for blanket `/admin/*` protection; per-page is backup for role checks |

**Installation:**
```bash
npm install better-auth
```

**Note:** `@better-auth/cli` is used via `npx` only -- no install needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...all]/route.ts    # Better Auth handler
│   │   └── admin/                     # Protected API routes (future phases)
│   ├── admin/
│   │   ├── login/page.tsx            # Standalone login (NO admin layout)
│   │   ├── layout.tsx                # Admin shell (sidebar + header)
│   │   ├── page.tsx                  # Dashboard redirect/default
│   │   ├── pipeline/page.tsx         # Kanban (placeholder)
│   │   └── conversations/page.tsx    # Conversation list (placeholder)
│   └── layout.tsx                     # Root layout (unchanged)
├── lib/
│   ├── auth.ts                       # Better Auth server config
│   └── auth-client.ts                # Better Auth React client
├── db/
│   └── schema.ts                     # Extended with auth + funnel tables
├── scripts/
│   └── seed-admin.ts                 # Seed initial admin user
└── proxy.ts                          # Route protection (root level)
```

**Important structural note:** `/admin/login` must NOT be nested inside the admin layout. Use Next.js route groups:
```
src/app/
├── admin/
│   ├── login/page.tsx               # NO layout wrapper -- standalone
│   ├── (dashboard)/                  # Route group WITH admin layout
│   │   ├── layout.tsx               # Admin shell (sidebar + header)
│   │   ├── page.tsx                 # Dashboard
│   │   ├── pipeline/page.tsx
│   │   └── conversations/page.tsx
```

This pattern ensures `/admin/login` renders without the sidebar, while all other `/admin/*` routes get the admin shell.

### Pattern 1: Better Auth Configuration
**What:** Server-side auth configuration with Drizzle adapter and custom role field
**When to use:** Single auth config file, imported by API route and proxy
**Example:**
```typescript
// src/lib/auth.ts
// Source: https://better-auth.com/docs/concepts/database
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours
  },
  user: {
    additionalFields: {
      role: {
        type: ["admin", "viewer"],
        required: false,
        defaultValue: "viewer",
        input: false, // Prevents self-assignment
      },
    },
  },
  plugins: [nextCookies()], // Must be last plugin
});
```

### Pattern 2: Route Protection via proxy.ts
**What:** Next.js 16 proxy (replaces middleware) for auth gating
**When to use:** Blanket protection of `/admin/*` routes
**Example:**
```typescript
// proxy.ts (project root)
// Source: https://better-auth.com/docs/integrations/next
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/((?!login).*)"], // All /admin/* except /admin/login
};
```

### Pattern 3: Client Auth Hooks
**What:** React client for login/logout and session access
**When to use:** Login form, header user display, conditional UI by role
**Example:**
```typescript
// src/lib/auth-client.ts
// Source: https://better-auth.com/docs/integrations/next
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
```

### Pattern 4: API Route Handler
**What:** Catch-all route for Better Auth
**When to use:** Handles all auth endpoints (sign-in, sign-out, session, etc.)
**Example:**
```typescript
// src/app/api/auth/[...all]/route.ts
// Source: https://better-auth.com/docs/integrations/next
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

### Pattern 5: Role-Gated API Routes
**What:** Per-route role checking for mutations
**When to use:** API routes that only admins can call (e.g., moving leads between stages)
**Example:**
```typescript
// src/app/api/admin/leads/[id]/move/route.ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ... mutation logic
}
```

### Pattern 6: Admin Layout with shadcn/ui Sidebar
**What:** Sidebar + header shell for admin pages
**When to use:** Wraps all protected admin pages
**Example:**
```typescript
// src/app/admin/(dashboard)/layout.tsx
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 flex flex-col">
        <AdminHeader />
        <div className="flex-1 p-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}
```

### Anti-Patterns to Avoid
- **Cookie-only auth check in proxy.ts:** `getSessionCookie()` only checks cookie existence, not validity. Always use `auth.api.getSession()` for real validation. [CITED: better-auth.com/docs/integrations/next]
- **Role check in proxy.ts only:** Proxy runs on every request -- keep it lightweight (auth yes/no). Do role checks in API routes/server components where the specific permission matters.
- **Login page inside admin layout:** `/admin/login` must NOT inherit the sidebar layout. Use route groups to separate it.
- **Using middleware.ts instead of proxy.ts:** Next.js 16 renames middleware to proxy. While middleware.ts still works (deprecated), use proxy.ts for forward compatibility. [CITED: nextjs.org/blog/next-16]
- **Importing `better-auth/react` in server components:** The React client is client-side only. Use `auth.api.getSession()` on the server.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth session management | Custom JWT/cookie handling | Better Auth session system | Handles token rotation, expiry, invalidation, CSRF |
| Password hashing | bcrypt wrapper | Better Auth built-in | Better Auth handles hashing, salting, timing-safe comparison |
| Collapsible sidebar | Custom sidebar with state | shadcn/ui Sidebar component | Handles mobile sheet, keyboard shortcuts, cookie persistence, accessibility |
| Mobile sidebar overlay | Custom drawer | shadcn/ui Sheet (via Sidebar) | Included automatically with Sidebar component |
| Auth API endpoints | Custom login/logout routes | `toNextJsHandler(auth)` | Single catch-all handles all auth flows |

## Common Pitfalls

### Pitfall 1: Better Auth Schema Conflicts with Existing Drizzle Schema
**What goes wrong:** Running `npx @better-auth/cli generate` creates a separate schema file that conflicts with the existing `schema.ts`.
**Why it happens:** Better Auth CLI generates its own table definitions that may not integrate cleanly with existing Drizzle setup.
**How to avoid:** After running `npx @better-auth/cli generate`, merge the generated tables INTO the existing `src/db/schema.ts` rather than keeping them separate. Pass the unified schema to the Drizzle adapter.
**Warning signs:** Duplicate table definitions, type errors on schema imports.

### Pitfall 2: Login Page Inheriting Admin Layout
**What goes wrong:** Login page shows sidebar/header, or login shows loading state while checking auth.
**Why it happens:** Login page is under `/admin/` and inherits the admin layout.
**How to avoid:** Use Next.js route groups: keep `/admin/login/page.tsx` outside the `(dashboard)` route group that has the admin layout.
**Warning signs:** Sidebar flash on login page, redirect loops.

### Pitfall 3: proxy.ts Redirect Loop
**What goes wrong:** Infinite redirect between login and admin pages.
**Why it happens:** proxy.ts matcher catches `/admin/login` too, redirecting unauthenticated users to login which also requires auth.
**How to avoid:** Use negative lookahead in matcher: `"/admin/((?!login).*)"` to exclude the login route.
**Warning signs:** Browser "too many redirects" error.

### Pitfall 4: Role Field Not Available in Session
**What goes wrong:** `session.user.role` is undefined even though the field exists in the database.
**Why it happens:** Better Auth only returns core fields in session by default. Custom `additionalFields` need to be defined in the auth config for them to appear in session responses.
**How to avoid:** Ensure `role` is defined in `user.additionalFields` in the auth config. The field will then be included in session data automatically.
**Warning signs:** `session.user.role` is undefined, role checks always fail.

### Pitfall 5: Drizzle pgEnum Adding Values to Existing Enum
**What goes wrong:** Migration fails when adding new enum values to an existing pgEnum.
**Why it happens:** PostgreSQL doesn't support adding enum values inside a transaction by default. Drizzle migrations run in transactions.
**How to avoid:** For the `lead_stage` enum, define it as a NEW enum (not modifying existing ones). If modifying an existing enum, use `ALTER TYPE ... ADD VALUE` outside a transaction.
**Warning signs:** Migration error about enum modification inside transaction.

### Pitfall 6: nextCookies Plugin Order
**What goes wrong:** Cookies not being set properly during server actions.
**Why it happens:** The `nextCookies()` plugin must be the LAST plugin in the plugins array.
**How to avoid:** Always place `nextCookies()` as the last entry in the `plugins` array.
**Warning signs:** Session not persisting after login, cookie not being set.

## Code Examples

### Schema Extension: Lead Stages, Events, Insights
```typescript
// Add to src/db/schema.ts
// Source: CONTEXT.md decisions D-14, D-15, D-16

export const leadStageEnum = pgEnum("lead_stage", [
  "novo",
  "engajado",
  "qualificado",
  "em_negociacao",
  "proposta_enviada",
  "fechado_ganho",
  "perdido",
]);

export const actorTypeEnum = pgEnum("actor_type", ["system", "admin"]);

export const insightTypeEnum = pgEnum("insight_type", [
  "summary",
  "intent",
  "budget",
  "objections",
  "next_action",
]);

// Add stage column to existing leads table (modify the table definition)
// leads table gets: stage: leadStageEnum().default("novo").notNull()

export const leadEvents = pgTable("lead_events", {
  id: uuid().defaultRandom().primaryKey(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  fromStage: leadStageEnum("from_stage"),
  toStage: leadStageEnum("to_stage").notNull(),
  actorType: actorTypeEnum("actor_type").notNull(),
  actorId: uuid("actor_id"),  // nullable -- null for system actions
  notes: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leadInsights = pgTable("lead_insights", {
  id: uuid().defaultRandom().primaryKey(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  insightType: insightTypeEnum("insight_type").notNull(),
  content: text().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  model: varchar("model", { length: 100 }),
});
```

### Better Auth Schema Generation Workflow
```bash
# 1. Install better-auth
npm install better-auth

# 2. Create auth config at src/lib/auth.ts (with drizzleAdapter)

# 3. Generate auth tables schema
npx @better-auth/cli generate

# 4. Merge generated tables into src/db/schema.ts
# Better Auth creates: user, session, account, verification tables

# 5. Generate Drizzle migration
npx drizzle-kit generate

# 6. Apply migration
npx drizzle-kit migrate
```

### Seed Script Pattern
```typescript
// src/scripts/seed-admin.ts
// Run with: npx tsx src/scripts/seed-admin.ts
import { auth } from "@/lib/auth";

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD env vars required");
  }

  // Create admin user via Better Auth API
  const user = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name: "Admin",
    },
  });

  // Update role to admin (since input: false prevents setting during signup)
  // Use direct Drizzle query to set role
  const { db } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  const { user: userTable } = await import("@/db/schema");

  await db
    .update(userTable)
    .set({ role: "admin" })
    .where(eq(userTable.id, user.user.id));

  console.log(`Admin user created: ${email}`);
}

seedAdmin().catch(console.error);
```

### Admin Sidebar Configuration
```typescript
// src/components/admin/app-sidebar.tsx
// Source: shadcn/ui Sidebar docs
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Kanban, MessageSquare } from "lucide-react";

const navItems = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { title: "Pipeline", href: "/admin/pipeline", icon: Kanban },
  { title: "Conversas", href: "/admin/conversations", icon: MessageSquare },
];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` | Next.js 16 (2026) | Renamed function + file. Node.js runtime only. |
| NextAuth/Auth.js | Better Auth | 2025-2026 | Simpler API, better Drizzle integration, no adapter boilerplate |
| Edge runtime middleware | Node.js proxy | Next.js 16 | Can now do DB calls in proxy (full session validation) |
| `framer-motion` import | `motion/react` import | 2025 | Package renamed to `motion` |

**Deprecated/outdated:**
- `middleware.ts` still works in Next.js 16 but is deprecated. Use `proxy.ts`. [CITED: nextjs.org/docs/messages/middleware-to-proxy]
- `getSessionCookie()` for auth checks -- cookie-only, not secure. Use `auth.api.getSession()`. [CITED: better-auth.com/docs/integrations/next]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `npx @better-auth/cli generate` output can be merged into existing schema.ts cleanly | Architecture Patterns | May need manual schema merging; low risk since Drizzle tables are just pgTable() calls |
| A2 | Better Auth `additionalFields` role field appears in session.user automatically | Pitfall 4 | Role checks would fail; fixable by explicitly including in session config |
| A3 | Session expiration of 24h is appropriate for admin backoffice | Code Examples | Security vs convenience tradeoff; user said "suggest 24h" |
| A4 | `proxy.ts` matcher supports regex negative lookahead `(?!login)` | Pitfall 3 | May need to use explicit path list instead of regex |

## Open Questions

1. **Better Auth CLI generate output format**
   - What we know: CLI generates table definitions for user, session, account, verification
   - What's unclear: Exact output format -- whether it generates Drizzle-native pgTable or raw SQL
   - Recommendation: Run `npx @better-auth/cli generate --output ./temp` during implementation, inspect output, then merge manually into schema.ts

2. **Role update for seeded admin**
   - What we know: `input: false` prevents role assignment during signup
   - What's unclear: Whether Better Auth provides an admin API to update user fields, or if direct Drizzle query is needed
   - Recommendation: Use direct Drizzle update query after signup (shown in seed script example)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Auth tables + schema | Yes | Via Docker Compose | -- |
| Node.js | Proxy runtime, seed script | Yes | 22+ (Next.js 16 requirement) | -- |
| npm | Package install | Yes | -- | -- |
| `npx` | Better Auth CLI | Yes | -- | -- |

**Missing dependencies:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual validation (no test framework detected) |
| Config file | None -- see Wave 0 |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BACK-01 | Admin login with email/password | manual | Navigate to `/admin/login`, submit credentials | N/A |
| BACK-02 | Admin layout with sidebar, header | manual | Navigate to `/admin` after login, verify shell | N/A |
| BACK-03 | DB schema for stages, events, insights | smoke | `npx drizzle-kit push` succeeds without errors | N/A |
| BSEC-01 | Unauthenticated redirect to login | manual | Visit `/admin` without session, verify redirect | N/A |
| BSEC-02 | Viewer cannot move leads | manual | Login as viewer, attempt mutation, verify 403 | N/A |

### Wave 0 Gaps
- [ ] No test framework configured -- consider adding Vitest for API route unit tests
- [ ] No E2E framework -- Playwright could validate auth flows but is deferred

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Better Auth email+password with built-in password hashing |
| V3 Session Management | yes | Better Auth session with DB-backed validation, 24h expiry |
| V4 Access Control | yes | Role-based (admin/viewer) enforced at API route level |
| V5 Input Validation | yes | Zod validation on login form + API inputs |
| V6 Cryptography | no | Better Auth handles password hashing internally |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Brute force login | Tampering | Rate limiting on `/api/auth/*` (existing rate-limit middleware) |
| Session fixation | Spoofing | Better Auth rotates session tokens on login |
| Privilege escalation via role self-assignment | Elevation of Privilege | `input: false` on role field prevents user-set role |
| CSRF on auth endpoints | Spoofing | Better Auth includes CSRF protection by default |
| Cookie theft | Spoofing | HttpOnly, Secure, SameSite cookies (Better Auth defaults) |

## Project Constraints (from CLAUDE.md)

- **Stack:** Next.js 16 + shadcn/ui + Tailwind CSS 4 -- enforced
- **Deploy:** Docker/VPS -- not serverless
- **Mobile-first:** Admin backoffice should work on mobile (collapsible sidebar)
- **Two SDKs pattern:** Claude Agent SDK for backend, AI SDK for frontend -- not relevant to this phase
- **shadcn/studio Pro:** All UI must use shadcn/studio Pro blocks via MCP where available
- **Biome:** Linting and formatting -- no ESLint/Prettier
- **Motion (not framer-motion):** Import from `motion/react` if animations needed

## Sources

### Primary (HIGH confidence)
- [npm: better-auth@1.6.2](https://www.npmjs.com/package/better-auth) -- version verified via `npm view`
- [npm: @better-auth/cli@1.4.21](https://www.npmjs.com/package/@better-auth/cli) -- version verified
- [Better Auth Drizzle Adapter](https://better-auth.com/docs/adapters/drizzle) -- adapter config, schema generation
- [Better Auth Next.js Integration](https://better-auth.com/docs/integrations/next) -- proxy.ts, session validation, API route handler
- [Better Auth Database Concepts](https://better-auth.com/docs/concepts/database) -- additionalFields, core tables, role via custom field
- [Better Auth Installation](https://better-auth.com/docs/installation) -- basic setup, env vars
- [Next.js 16 Blog Post](https://nextjs.org/blog/next-16) -- proxy.ts rename
- [Next.js proxy.ts docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) -- file convention
- shadcn/ui Sidebar -- verified available via `npx shadcn@latest add sidebar --dry-run`

### Secondary (MEDIUM confidence)
- [Better Auth middleware.ts to proxy.ts guide](https://better-auth.com/docs/integrations/next) -- proxy pattern with matcher

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Better Auth version verified on npm, shadcn Sidebar verified via dry-run
- Architecture: HIGH -- patterns sourced from official Better Auth and Next.js docs
- Pitfalls: MEDIUM -- some pitfalls based on common patterns and GitHub issues, not all personally verified

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable libraries, 30 days)

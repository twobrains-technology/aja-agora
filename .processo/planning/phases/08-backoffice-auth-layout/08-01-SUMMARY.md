---
phase: 08-backoffice-auth-layout
plan: 01
subsystem: auth, database
tags: [better-auth, drizzle, postgresql, proxy, auth, funnel, lead-stage]

# Dependency graph
requires:
  - phase: 01-project-setup
    provides: Drizzle ORM + PostgreSQL setup, schema.ts with conversations/messages/artifacts/leads
provides:
  - Better Auth authentication with email+password and Drizzle adapter
  - Auth API endpoints at /api/auth/* (login, logout, session management)
  - Route protection via proxy.ts for /admin/* routes
  - Database schema with auth tables (user, session, account, verification)
  - Database schema with funnel tables (lead_events, lead_insights)
  - Lead stage enum and stage column on leads table
  - Role field on user table (admin/viewer) with self-assignment prevention
  - Admin seed script for initial user creation
  - Auth client hooks (signIn, signUp, signOut, useSession)
affects: [08-02-admin-layout, 09-pipeline-kanban, 10-conversation-replay, 11-dashboard-analytics]

# Tech tracking
tech-stack:
  added: [better-auth@1.6.2]
  patterns: [Better Auth with Drizzle adapter, proxy.ts route protection, additionalFields for custom user fields]

key-files:
  created:
    - src/lib/auth.ts
    - src/lib/auth-client.ts
    - src/app/api/auth/[...all]/route.ts
    - src/proxy.ts
    - src/scripts/seed-admin.ts
  modified:
    - src/db/schema.ts
    - package.json

key-decisions:
  - "Better Auth uses text IDs (not UUID) for auth tables - kept as generated for compatibility"
  - "Role stored as text column with default 'viewer' and input:false to prevent self-assignment"
  - "proxy.ts placed in src/ directory (Next.js 16 with src/ app directory)"
  - "BETTER_AUTH_SECRET auto-generated and added to .env"

patterns-established:
  - "Auth config pattern: betterAuth() in src/lib/auth.ts with drizzleAdapter and nextCookies plugin"
  - "Auth client pattern: createAuthClient() in src/lib/auth-client.ts with destructured exports"
  - "Route protection pattern: proxy.ts with auth.api.getSession() and matcher config"
  - "Seed script pattern: auth.api.signUpEmail() then direct Drizzle update for role"

requirements-completed: [BACK-01, BACK-03, BSEC-01, BSEC-02]

# Metrics
duration: 4min
completed: 2026-04-14
---

# Phase 8 Plan 1: Auth & Schema Foundation Summary

**Better Auth with Drizzle adapter, funnel schema (lead_events, lead_insights, lead_stage enum), proxy.ts route protection, and admin seed script**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-14T04:15:20Z
- **Completed:** 2026-04-14T04:19:22Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Better Auth installed and configured with Drizzle adapter, email+password auth, and role-based access
- Database schema extended with 4 auth tables + 2 funnel tables + 3 new enums + stage column on leads
- Route protection via proxy.ts guards /admin/* with full session validation (not cookie-only)
- Admin seed script creates initial user via Better Auth API then promotes to admin role

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Better Auth, configure auth, extend DB schema** - `deae8d0` (feat)
2. **Task 2: Create proxy.ts, seed script, push schema** - `52b343d` (feat)

## Files Created/Modified
- `src/lib/auth.ts` - Better Auth server config with Drizzle adapter, role additionalField, nextCookies plugin
- `src/lib/auth-client.ts` - Client-side auth hooks (signIn, signUp, signOut, useSession)
- `src/app/api/auth/[...all]/route.ts` - Catch-all auth handler via toNextJsHandler
- `src/proxy.ts` - Route protection for /admin/* with session validation and login redirect
- `src/scripts/seed-admin.ts` - Admin user seed script reading from env vars
- `src/db/schema.ts` - Extended with auth tables + funnel tables + enums + stage column
- `package.json` - Added better-auth dependency

## Decisions Made
- Better Auth generates auth tables with `text("id").primaryKey()` (not UUID) -- kept as-is for Better Auth compatibility
- Role field uses `text("role").default("viewer").notNull()` with `input: false` to prevent self-assignment during signup
- proxy.ts placed in `src/` since project uses `src/` directory for app code
- BETTER_AUTH_SECRET auto-generated via `openssl rand -base64 32` and added to `.env`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added password length validation to seed script**
- **Found during:** Task 2 (seed script creation)
- **Issue:** Plan didn't specify minimum password validation in seed script
- **Fix:** Added `password.length < 8` check before attempting signup
- **Files modified:** src/scripts/seed-admin.ts
- **Verification:** Script validates password before calling auth API
- **Committed in:** 52b343d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Minor security improvement. No scope creep.

## Issues Encountered
- `npx @better-auth/cli generate` required interactive confirmation -- used `echo "y" | npx` to pipe input
- Better Auth CLI generates a flat file (not directory) -- adapted workflow to read single file

## User Setup Required

The following environment variables must be set before running the seed script:
- `ADMIN_EMAIL` - Admin email address
- `ADMIN_PASSWORD` - Admin password (min 8 characters)
- `BETTER_AUTH_SECRET` - Already auto-generated in `.env`

Run seed script: `npx tsx src/scripts/seed-admin.ts`

## Next Phase Readiness
- Auth foundation complete -- Plan 02 can build admin layout with sidebar and login page
- All database tables created and verified in PostgreSQL
- Auth API endpoints ready at /api/auth/* for login form integration
- Route protection active for /admin/* routes

---
*Phase: 08-backoffice-auth-layout*
*Completed: 2026-04-14*

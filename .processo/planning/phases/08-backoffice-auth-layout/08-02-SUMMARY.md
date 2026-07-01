---
phase: 08-backoffice-auth-layout
plan: 02
subsystem: ui, auth
tags: [shadcn-sidebar, admin-layout, login, role-gating, better-auth, next-js-route-groups]

# Dependency graph
requires:
  - phase: 08-backoffice-auth-layout
    provides: Better Auth config (auth.ts, auth-client.ts), proxy.ts route protection, DB schema with auth + funnel tables
provides:
  - Admin login page at /admin/login with email/password form
  - Admin layout shell with collapsible sidebar and header
  - Sidebar navigation (Dashboard, Pipeline, Conversas)
  - Header with user name, role badge, and logout button
  - Role-gated API route helper (requireRole)
  - Placeholder pages for Dashboard, Pipeline, Conversations
affects: [09-pipeline-kanban, 10-conversation-replay, 11-dashboard-analytics]

# Tech tracking
tech-stack:
  added: [shadcn/ui-sidebar, shadcn/ui-sheet, shadcn/ui-label]
  patterns: [Next.js route groups for layout isolation, render prop for shadcn sidebar links, requireRole helper for API protection]

key-files:
  created:
    - src/app/admin/login/page.tsx
    - src/app/admin/(dashboard)/layout.tsx
    - src/app/admin/(dashboard)/page.tsx
    - src/app/admin/(dashboard)/pipeline/page.tsx
    - src/app/admin/(dashboard)/conversations/page.tsx
    - src/components/admin/app-sidebar.tsx
    - src/components/admin/admin-header.tsx
    - src/lib/admin/require-role.ts
    - src/components/ui/sidebar.tsx
    - src/components/ui/sheet.tsx
    - src/components/ui/label.tsx
    - src/hooks/use-mobile.ts
  modified: []

key-decisions:
  - "Used render prop instead of asChild for SidebarMenuButton -- shadcn/ui v4 uses Base UI useRender pattern"
  - "Login page at /admin/login outside (dashboard) route group to avoid sidebar layout inheritance"
  - "requireRole returns { error, session } tuple for ergonomic usage in API routes"

patterns-established:
  - "Admin sidebar pattern: SidebarProvider wrapping, AppSidebar + AdminHeader in (dashboard) layout"
  - "Role-gated API pattern: requireRole('admin') returns 401/403 or valid session"
  - "Active link pattern: usePathname() with exact match for /admin, startsWith for sub-routes"

requirements-completed: [BACK-01, BACK-02, BSEC-01, BSEC-02]

# Metrics
duration: 3min
completed: 2026-04-14
---

# Phase 8 Plan 2: Admin Login Page & Layout Shell Summary

**Admin login page with Better Auth signIn, collapsible sidebar (Dashboard/Pipeline/Conversas), header with role badge and logout, and requireRole API helper**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-14T04:22:12Z
- **Completed:** 2026-04-14T04:25:15Z
- **Tasks:** 3 (2 auto + 1 checkpoint auto-approved)
- **Files modified:** 12

## Accomplishments
- Admin login page at /admin/login with email/password form using Better Auth signIn
- Admin layout shell with shadcn/ui Sidebar (collapsible on mobile) and header with user info
- Role-gated API route helper (requireRole) for future mutation endpoint protection
- Three placeholder pages ready for Phase 9-11 implementation

## Task Commits

Each task was committed atomically:

1. **Task 1: Install shadcn Sidebar, create login page and role-gated helper** - `b7fcf10` (feat)
2. **Task 2: Build admin layout shell with sidebar, header, and placeholder pages** - `156b161` (feat)
3. **Task 3: Verify admin auth flow and layout** - Auto-approved checkpoint

## Files Created/Modified
- `src/app/admin/login/page.tsx` - Login form with email/password, error handling, redirect to /admin
- `src/app/admin/(dashboard)/layout.tsx` - Admin shell wrapping children with SidebarProvider + AppSidebar + AdminHeader
- `src/app/admin/(dashboard)/page.tsx` - Dashboard placeholder page
- `src/app/admin/(dashboard)/pipeline/page.tsx` - Pipeline placeholder page
- `src/app/admin/(dashboard)/conversations/page.tsx` - Conversations placeholder page
- `src/components/admin/app-sidebar.tsx` - Sidebar with 3 nav items, active link highlighting
- `src/components/admin/admin-header.tsx` - Header with SidebarTrigger, user name, role badge, logout
- `src/lib/admin/require-role.ts` - Role-gated API route helper returning 401/403
- `src/components/ui/sidebar.tsx` - shadcn/ui Sidebar component (installed via CLI)
- `src/components/ui/sheet.tsx` - shadcn/ui Sheet component (sidebar dependency)
- `src/components/ui/label.tsx` - shadcn/ui Label component (form input labels)
- `src/hooks/use-mobile.ts` - Mobile detection hook (sidebar dependency)

## Decisions Made
- Used `render` prop instead of `asChild` for SidebarMenuButton links -- shadcn/ui CLI v4 generates Base UI `useRender` pattern, not Radix `asChild`
- Login page placed at `/admin/login/page.tsx` outside `(dashboard)` route group so it renders without sidebar
- requireRole helper returns `{ error, session }` tuple -- callers check `if (error) return error` for clean API route code

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SidebarMenuButton asChild to render prop**
- **Found during:** Task 2 (build verification)
- **Issue:** Plan specified `asChild` prop on SidebarMenuButton, but shadcn/ui v4 uses Base UI `useRender` pattern with `render` prop instead
- **Fix:** Changed `<SidebarMenuButton asChild>` to `<SidebarMenuButton render={<Link href={item.href} />}>`
- **Files modified:** src/components/admin/app-sidebar.tsx
- **Verification:** `npm run build` compiles without type errors
- **Committed in:** 156b161 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor API difference in shadcn/ui v4. No scope creep.

## Issues Encountered
None beyond the asChild/render prop difference documented above.

## Next Phase Readiness
- Admin layout shell complete -- Phase 9 (Pipeline Kanban) can build on `/admin/pipeline` page
- Phase 10 (Conversation Replay) can build on `/admin/conversations` page
- Phase 11 (Dashboard Analytics) can build on `/admin` page
- requireRole helper ready for mutation endpoint protection in Phase 9+

---
*Phase: 08-backoffice-auth-layout*
*Completed: 2026-04-14*

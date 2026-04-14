# Phase 8: Backoffice Auth & Layout - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 08-backoffice-auth-layout
**Areas discussed:** Authentication Strategy, Admin Layout, Database Schema, Role System
**Mode:** Auto (all decisions auto-selected)

---

## Authentication Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| NextAuth + Credentials | Email/password with bcrypt, JWT sessions, VPS-friendly | ✓ |
| Custom session auth | Roll own session system with cookies | |
| Clerk/Auth0 | External auth provider | |

**User's choice:** NextAuth + Credentials (recommended default)
**Notes:** VPS deployment, no external dependencies needed. Simple admin login.

---

## Admin Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar + Header | Collapsible sidebar with main sections, header with user info | ✓ |
| Top nav only | Horizontal navigation bar | |
| Tab-based | Tabbed interface without sidebar | |

**User's choice:** Sidebar + Header (recommended default)
**Notes:** Three main sections: Pipeline, Conversas, Dashboard. Mobile-responsive with hamburger.

---

## Database Schema Design

| Option | Description | Selected |
|--------|-------------|----------|
| Stage column + events table + insights table | Enum on leads + audit trail + AI cache | ✓ |
| Stage column only | Simple enum, no history tracking | |
| Separate pipeline table | Normalized pipeline stages with join table | |

**User's choice:** Stage column + events table + insights table (recommended default)
**Notes:** Events table enables full audit trail. Insights table caches AI-generated analysis.

---

## Role System

| Option | Description | Selected |
|--------|-------------|----------|
| Two roles (admin/viewer) | Simple enum column on admin_users | ✓ |
| Full RBAC | Roles + permissions tables | |
| Single role | All admins equal | |

**User's choice:** Two roles (recommended default)
**Notes:** Admin can mutate, viewer is read-only. Sufficient for MVP.

---

## Claude's Discretion

- Sidebar visual design and animations
- Login page styling
- Error messages and validation UX
- Session expiration time

## Deferred Ideas

- Email/SMS notifications on stage transitions
- Multi-tenant support
- OAuth providers
- Real-time WebSocket updates on Kanban

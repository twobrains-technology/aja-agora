# Phase 1: Project Foundation & Infrastructure — Research

**Researched:** 2026-04-11
**Status:** Complete

## Key Findings

1. **Next.js 16.2.3** is current stable. `create-next-app` has native `--biome` flag (no ESLint), `--tailwind` is default, `--app` enables App Router. Turbopack is the default bundler in Next.js 16 — no extra config needed.
2. **Tailwind CSS 4.2.2** uses CSS-native config — no `tailwind.config.js`. Theme customization goes in the CSS file via `@theme` directive.
3. **shadcn CLI 4.2.0** — run `npx shadcn@latest init` then `npx shadcn@latest add button card`. Components are copied into the project (full ownership).
4. **Drizzle ORM 0.45.2 + drizzle-kit 0.31.10** — schema defined in TypeScript, migrations via `drizzle-kit generate` + `drizzle-kit migrate`. Uses `pg` driver (version >=8) for PostgreSQL.
5. **Biome 2.4.11** — `create-next-app --biome` sets it up automatically. Replaces both ESLint and Prettier.
6. **Docker standalone output** — `output: "standalone"` in `next.config.ts` produces a self-contained build. Multi-stage Dockerfile keeps image small.
7. **The repo is empty** — only `.planning/` and `CLAUDE.md` exist. Everything needs to be created from scratch.

## Technical Research

### 1. Next.js 16 Setup

**Current version:** 16.2.3

**Scaffolding command:**
```bash
npx create-next-app@latest . --typescript --tailwind --biome --app --src-dir --import-alias "@/*" --use-npm
```

Key flags:
- `--typescript` — default, TypeScript project
- `--tailwind` — default, includes Tailwind CSS 4
- `--biome` — uses Biome instead of ESLint (native support since Next.js 15)
- `--app` — App Router (Pages Router is legacy)
- `--src-dir` — places app code in `src/` for cleaner root
- `--agents-md` — default, includes AGENTS.md for AI coding agents
- `--use-npm` — consistent package manager

**Turbopack:** Default in Next.js 16 for both dev and build. No configuration needed. The `dev` script in `package.json` will use Turbopack automatically.

**Standalone output:** Add to `next.config.ts`:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

This produces a minimal `/.next/standalone` folder with only the files needed to run, including a `server.js` entry point. The `public/` and `.next/static/` folders need to be copied separately in Docker.

**Important notes:**
- Next.js 16 ships React 19.2 with React Compiler built-in (auto-memoization, no manual `useMemo`/`useCallback`)
- `--react-compiler` flag exists but React Compiler is included by default in Next.js 16
- The `--eslint` and `--biome` flags are mutually exclusive

### 2. Tailwind CSS 4 + shadcn/ui

**Tailwind CSS version:** 4.2.2

**CSS-native configuration:** Tailwind CSS 4 eliminates `tailwind.config.js`. All configuration lives in the CSS file:

```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.70 0.18 250);
  --color-secondary: oklch(0.60 0.12 280);
  --font-sans: "Inter", sans-serif;
  --radius-lg: 0.75rem;
}
```

**shadcn/ui CLI version:** 4.2.0

**Initialization:**
```bash
npx shadcn@latest init
```

The CLI will:
1. Detect Next.js + Tailwind CSS 4
2. Create `components.json` with project config
3. Set up `src/lib/utils.ts` with `cn()` helper (clsx + tailwind-merge)
4. Configure CSS variables for the design system
5. Create `src/components/ui/` directory

**Adding components:**
```bash
npx shadcn@latest add button card
```

Components are copied into `src/components/ui/` — full source ownership, no runtime dependency on shadcn.

**Key details for shadcn + Tailwind 4:**
- shadcn CLI v4 is fully compatible with Tailwind CSS 4's CSS-native config
- Uses the unified `radix-ui` package instead of individual `@radix-ui/*` packages
- Components use CSS variables for theming (dark mode support built-in)
- `cn()` utility combines `clsx` and `tailwind-merge` for conditional classes

### 3. Drizzle ORM + PostgreSQL

**Drizzle ORM version:** 0.45.2
**drizzle-kit version:** 0.31.10

**Installation:**
```bash
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

**Config file — `drizzle.config.ts`:**
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**Migration workflow:**
1. Define schema in `src/db/schema.ts`
2. Generate migration: `npx drizzle-kit generate`
3. Apply migration: `npx drizzle-kit migrate`
4. For dev iteration: `npx drizzle-kit push` (applies schema directly without migration files)

**Database client setup — `src/db/index.ts`:**
```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export const db = drizzle(process.env.DATABASE_URL!, { schema });
```

Note: Drizzle 0.45+ supports passing a connection string directly to `drizzle()` for the `node-postgres` driver — no need to manually create a `Pool`.

**Schema design considerations:**
- Use `pgTable` from `drizzle-orm/pg-core`
- UUID primary keys via `uuid().defaultRandom().primaryKey()`
- `timestamp` with `{ withTimezone: true }` for all dates
- `jsonb` for flexible artifact payloads
- Foreign key relations defined inline with `.references()`

### 4. Biome

**Version:** 2.4.11

**Installation:** Handled by `create-next-app --biome`. If manual:
```bash
npm install -D @biomejs/biome
npx @biomejs/biome init
```

**Config file — `biome.json` (auto-generated by create-next-app):**
```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.11/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "lineWidth": 100
  }
}
```

**Commands:**
- `npx biome check .` — lint + format check
- `npx biome check --write .` — auto-fix lint + format
- `npx biome format .` — format only
- `npx biome lint .` — lint only

**Integration notes:**
- Biome replaces both ESLint and Prettier — single tool
- 10-100x faster than ESLint
- Native TypeScript/JSX/TSX support
- `create-next-app --biome` sets up the config and scripts automatically
- Consider adding scripts to `package.json`: `"lint": "biome check ."`, `"format": "biome check --write ."`

### 5. Docker Setup

**Multi-stage Dockerfile for Next.js standalone:**

```dockerfile
FROM node:22-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

**Key points:**
- Multi-stage build: `deps` -> `builder` -> `runner`
- `node:22-alpine` as base (smallest Node.js image, Node 22 is LTS)
- `npm ci` for deterministic installs
- Standalone output means only `server.js` + minimal dependencies are copied
- `public/` and `.next/static/` must be copied separately (standalone excludes them)
- Non-root user for security
- Expected image size: 150-250MB (well under the 500MB target)

**docker-compose.yml:**

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/aja_agora
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: aja_agora
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

**Dev vs Prod considerations:**
- For development, consider a `docker-compose.dev.yml` that mounts source code and uses `npm run dev` instead of the built standalone
- Or simply run `npm run dev` locally and only use Docker Compose for PostgreSQL:
  ```yaml
  # docker-compose.yml (dev-focused)
  services:
    db:
      image: postgres:16-alpine
      ports:
        - "5432:5432"
      environment:
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: aja_agora
      volumes:
        - pgdata:/var/lib/postgresql/data
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U postgres"]
        interval: 5s
        timeout: 5s
        retries: 5

  volumes:
    pgdata:
  ```
- This is the pragmatic approach: `docker compose up db` for Postgres, `npm run dev` for Next.js with Turbopack HMR

### 6. Database Schema Design

**Tables for Phase 1 (DATA-01):**

```typescript
import { pgTable, uuid, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);
export const artifactTypeEnum = pgEnum("artifact_type", [
  "group_card",
  "comparison_table",
  "simulation_result",
  "recommendation_card",
  "lead_form",
]);

// Conversations
export const conversations = pgTable("conversations", {
  id: uuid().defaultRandom().primaryKey(),
  metadata: jsonb().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Messages
export const messages = pgTable("messages", {
  id: uuid().defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: messageRoleEnum().notNull(),
  content: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Artifacts (linked to messages)
export const artifacts = pgTable("artifacts", {
  id: uuid().defaultRandom().primaryKey(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  type: artifactTypeEnum().notNull(),
  payload: jsonb().notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Leads (linked to conversations, PII separate from logs)
export const leads = pgTable("leads", {
  id: uuid().defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  name: text(),
  phone: text(),
  email: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
  leads: many(leads),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  artifacts: many(artifacts),
}));

export const artifactsRelations = relations(artifacts, ({ one }) => ({
  message: one(messages, {
    fields: [artifacts.messageId],
    references: [messages.id],
  }),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  conversation: one(conversations, {
    fields: [leads.conversationId],
    references: [conversations.id],
  }),
}));
```

**Design decisions:**
- **UUIDs over serial IDs** — no information leakage, safe for client exposure, no collision risk across environments
- **`jsonb` for artifact payload** — each artifact type has different data shape; jsonb gives flexibility without separate tables per artifact type. TypeScript generics (`$type<>`) provide type safety at the application layer
- **`cascade` deletes** — deleting a conversation removes all related messages, artifacts, and leads. Appropriate for MVP; revisit if audit trail is needed
- **Leads table separate from messages** — PII (name, phone, email) is NOT stored in message content. This satisfies DATA-03 (PII separated from conversation logs) at the schema level
- **`artifact_type` enum** — PostgreSQL native enum for type safety at DB level. Extensible — new types added via migration
- **`message_role` enum** — `user`, `assistant`, `system` covers all Claude conversation roles
- **Timestamps with timezone** — always `withTimezone: true` for correct behavior across deployments

**Indexes to add (Phase 1 or early Phase 2):**
- `messages.conversationId` — fast lookup of messages per conversation
- `artifacts.messageId` — fast lookup of artifacts per message
- `leads.conversationId` — fast lookup of leads per conversation

Drizzle automatically creates indexes on foreign keys referenced with `.references()`, but explicit indexes may be needed for query performance.

## Implementation Approach

**Recommended order of operations:**

1. **Scaffold Next.js project** (FOUND-01)
   - `npx create-next-app@latest . --typescript --tailwind --biome --app --src-dir --use-npm`
   - Add `output: "standalone"` to `next.config.ts`
   - Verify `npm run dev` works

2. **Configure Biome** (FOUND-04)
   - Already set up by `--biome` flag
   - Customize `biome.json` if needed (line width, indent style)
   - Run `npx biome check .` to verify zero errors on scaffolded code
   - Add npm scripts: `"lint"`, `"format"`

3. **Initialize shadcn/ui** (FOUND-02)
   - `npx shadcn@latest init`
   - `npx shadcn@latest add button card`
   - Create a test page at `src/app/test/page.tsx` rendering both components
   - Verify rendering in browser

4. **Set up Docker Compose with PostgreSQL** (FOUND-01, FOUND-03)
   - Create `docker-compose.yml` with PostgreSQL service
   - Create `.env` / `.env.local` with `DATABASE_URL`
   - `docker compose up db` to start PostgreSQL

5. **Set up Drizzle ORM + Schema** (FOUND-03, DATA-01)
   - Install `drizzle-orm`, `pg`, `drizzle-kit`, `@types/pg`
   - Create `drizzle.config.ts`
   - Create `src/db/schema.ts` with all 4 tables
   - Create `src/db/index.ts` with database client
   - `npx drizzle-kit generate` to create migration
   - `npx drizzle-kit migrate` to apply

6. **Docker standalone build** (FOUND-05)
   - Create `Dockerfile` with multi-stage build
   - Add `.dockerignore`
   - `docker build -t aja-agora .` and verify image size < 500MB
   - Update `docker-compose.yml` to include app service
   - `docker compose up` to verify full stack

**Dependencies between tasks:**
- Step 1 must complete before all others
- Steps 2-3 can run in parallel after Step 1
- Step 4 must complete before Step 5 (needs PostgreSQL running)
- Step 5 must complete before Step 6 (build needs schema code)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `create-next-app` generates ESLint artifacts even with `--biome` | Minor — leftover config files | Remove `.eslintrc*` if generated; verify only `biome.json` exists |
| shadcn CLI v4 may prompt interactively | Blocks CI/automation | Use `--defaults` flag or answer prompts; document exact init command |
| Drizzle migration fails on first run | Blocks DB setup | Ensure PostgreSQL is running and `DATABASE_URL` is correct before running migrations |
| Docker image exceeds 500MB | Fails success criterion | Use `node:22-alpine`, multi-stage build, `.dockerignore` excluding `node_modules`, `.git`, `.planning` |
| Tailwind CSS 4 breaking changes from shadcn components | Components don't render | shadcn CLI v4 is designed for Tailwind 4; use latest `shadcn` version |
| Port 5432 already in use locally | Docker Compose fails | Use `5433:5432` mapping or stop existing PostgreSQL |
| `pg` driver version mismatch with Drizzle | Runtime errors | Drizzle requires `pg >= 8`; install latest `pg` |

## Validation Architecture

### Success Criterion 1: `docker compose up` starts app + PostgreSQL
- **Test:** Run `docker compose up -d`, then `curl http://localhost:3000` returns HTML
- **Verify:** `docker compose ps` shows both services healthy
- **Cleanup:** `docker compose down`

### Success Criterion 2: Drizzle migrations create all tables
- **Test:** `npx drizzle-kit migrate` exits with code 0
- **Verify:** Connect to PostgreSQL and run:
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
  ```
  Should return: `conversations`, `messages`, `artifacts`, `leads`
- **Also verify:** Each table has correct columns via `\d conversations`, `\d messages`, etc.

### Success Criterion 3: shadcn/ui Button and Card render
- **Test:** Navigate to `http://localhost:3000/test` (or designated test page)
- **Verify:** Button and Card components are visible and styled correctly
- **Automated:** Could use a screenshot comparison, but manual visual check is sufficient for Phase 1

### Success Criterion 4: Biome passes with zero errors
- **Test:** `npx biome check .`
- **Verify:** Exit code 0, no errors or warnings in output
- **Note:** Run after all other work is complete to ensure the full codebase passes

### Success Criterion 5: Docker image under 500MB
- **Test:** `docker build -t aja-agora .`
- **Verify:** `docker images aja-agora --format "{{.Size}}"` shows < 500MB
- **Expected:** 150-250MB with Alpine + standalone output

## RESEARCH COMPLETE

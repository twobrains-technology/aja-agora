# Stack Research

**Domain:** AI-first conversational fintech (consorcio)
**Researched:** 2026-04-11
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|---|---|---|---|
| **Next.js** | 16.x (latest 16.2.3) | Full-stack React framework | App Router stable, Turbopack default for dev+build, React Compiler built-in (auto-memoization), improved prefetching. Docker-friendly with `output: "standalone"`. |
| **React** | 19.2 (via Next.js 16) | UI library | Ships with Next.js 16. React Compiler 1.0 eliminates manual `useMemo`/`useCallback`. Server Components reduce client JS bundle. |
| **TypeScript** | 5.7+ | Type safety | Non-negotiable for fintech. Zod schemas + Drizzle ORM + AI SDK all leverage TS inference end-to-end. |
| **Tailwind CSS** | 4.2.x | Styling | CSS-native theme variables (no `tailwind.config.js`), 5x faster full builds, 100x faster incremental. Single CSS import. Works with shadcn/ui out of the box. |
| **shadcn/ui** | CLI v4 (March 2026) | Component library | Copy-paste components, full ownership. CLI v4 adds design presets, unified `radix-ui` package, and `shadcn/skills` for AI agent integration. Built-in form components use react-hook-form + zod. |
| **Anthropic Claude Agent SDK** | `@anthropic-ai/claude-agent-sdk` latest | Multi-agent AI orchestration | Official SDK for building agents with Claude's tool use. Supports multi-agent patterns, MCP integrations, in-process tool execution. Powers the conversational core. |
| **Vercel AI SDK** | 6.x | Streaming UI + chat hooks | `useChat` hook handles SSE streaming, tool invocations, error states. Provider-agnostic (works with Anthropic). Decoupled state management (plugs into Zustand). Human-in-the-loop approval for tool calls. 20M+ monthly downloads. |
| **Drizzle ORM** | 0.45.x (1.0 beta imminent) | Database access | Type-safe SQL, zero overhead, edge-compatible. Built-in Zod validator integration. Excellent migration system with DAG-based conflict detection. |
| **PostgreSQL** | 16+ | Primary database | Conversations, user profiles, recommendations need relational integrity. JSON columns for flexible artifact storage. Battle-tested for fintech. Docker Compose trivial. |

### Supporting Libraries

| Library | Version | Purpose | Why Recommended |
|---|---|---|---|
| **Motion** (ex Framer Motion) | 12.x (latest 12.38) | Animation | Renamed from `framer-motion` to `motion`. Import from `motion/react`. Hardware-accelerated via Web Animations API, 120fps. Spring physics for card animations, layout transitions for artifact cards. |
| **Zustand** | 5.x | Client state management | ~3KB, single store model. AI SDK 6 `useChat` supports decoupled state with Zustand. Perfect for chat UI state (active conversation, selected artifacts, UI mode). |
| **Zod** | 3.24+ | Schema validation | Single validation layer shared across: form inputs, API routes, AI tool parameters, Drizzle schemas. Required dependency of Claude Agent SDK. |
| **react-hook-form** | 7.x | Form handling | Progressive auth forms (name, phone, email). Uncontrolled components = minimal re-renders. `@hookform/resolvers` bridges to Zod. shadcn/ui Form component wraps it natively. |
| **@ai-sdk/anthropic** | latest | Anthropic provider for AI SDK | Bridges Vercel AI SDK to Claude API. Handles streaming, tool use, and model switching. |
| **Lucide React** | latest | Icons | Default icon set for shadcn/ui. Tree-shakeable. |
| **date-fns** | 4.x | Date formatting | Lightweight, tree-shakeable. For assembly dates, payment schedules, contract timelines. |
| **nuqs** | 2.x | URL state management | Type-safe URL search params for Next.js App Router. Useful for shareable chat links, deep-linking to specific conversations. |

### Development Tools

| Tool | Version | Purpose | Why Recommended |
|---|---|---|---|
| **Docker** | 27+ | Containerization | Multi-stage build with Next.js standalone output. Final image ~150-250MB. |
| **Docker Compose** | 2.x | Local dev orchestration | Next.js + PostgreSQL + any future services in one `docker compose up`. |
| **Biome** | 2.x | Linting + formatting | Replaces ESLint + Prettier. Single tool, 10-100x faster. Native TypeScript support. |
| **drizzle-kit** | latest | Database migrations | `drizzle-kit push` for dev, `drizzle-kit migrate` for production. Schema introspection < 1s. |
| **Turbopack** | (built into Next.js 16) | Dev server / bundler | Default in Next.js 16. No config needed. Microsecond incremental builds. |

## Architecture Decisions

### Streaming: SSE via AI SDK (not raw WebSocket)

The AI SDK 6 `useChat` hook uses Server-Sent Events (SSE) as the streaming protocol. SSE is:
- Natively supported in all browsers
- Simpler than WebSocket for unidirectional server-to-client streaming
- Handles reconnection, keep-alive pings, and caching automatically
- Compatible with Next.js API routes (no custom server needed)
- Debuggable with standard browser DevTools

WebSocket would only be needed for bidirectional real-time features (e.g., collaborative editing), which this project does not require. The AI SDK abstracts all SSE complexity -- no manual chunk parsing or header management.

### Database: PostgreSQL (not SQLite/Turso)

PostgreSQL over SQLite/Turso because:
- **Relational integrity** -- conversations reference users, artifacts reference conversations, recommendations reference groups. Foreign keys matter in fintech.
- **JSON columns** -- store flexible artifact payloads without a separate document store.
- **Concurrent writes** -- multiple users chatting simultaneously. SQLite's write lock becomes a bottleneck.
- **Docker-native** -- `postgres:16-alpine` in Compose, zero setup.
- **Migration path** -- if the platform scales, PostgreSQL scales vertically and horizontally (read replicas). SQLite doesn't.

Turso is excellent for edge-first apps deployed on Vercel/Cloudflare, but this project deploys to Docker/VPS where edge replication has no benefit.

### Two SDKs: Claude Agent SDK + Vercel AI SDK

These serve different layers and complement each other:

- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`): Backend orchestration. Defines agents, tools, multi-agent routing. The "brain" that decides what to do.
- **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`): Frontend streaming. `useChat` hook, SSE protocol, tool invocation UI. The "mouth" that streams responses to the user.

The AI SDK's `useChat` provides the streaming UI infrastructure. The Claude Agent SDK provides the multi-agent orchestration logic that runs server-side. The API route bridges both: receives the chat message via AI SDK protocol, routes to the appropriate Claude agent, and streams the response back.

### State Management: Zustand (not Redux, not Jotai)

- Chat has app-wide state (active conversation, user profile, auth state) -- store-based model fits better than atomic.
- AI SDK 6 explicitly supports Zustand integration for decoupled `useChat` state.
- ~3KB bundle, near-zero boilerplate, hooks-based API.
- Jotai's atomic model is better for complex form state or fine-grained reactivity, neither of which is the primary pattern here.

### Animation: Motion (not CSS-only, not React Spring)

Interactive artifact cards need:
- Layout animations (cards appearing, reordering)
- Gesture support (swipe on mobile)
- Spring physics (natural feel for card interactions)
- `AnimatePresence` for enter/exit transitions

CSS animations can't do layout transitions or gesture-driven physics. React Spring lacks the declarative API and community momentum. Motion (formerly Framer Motion) v12 handles all of this with hardware acceleration via Web Animations API.

## Installation

```bash
# Create Next.js 16 project
npx create-next-app@latest aja-agora --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# Core dependencies
npm install @anthropic-ai/claude-agent-sdk ai @ai-sdk/anthropic
npm install drizzle-orm postgres zod zustand
npm install motion react-hook-form @hookform/resolvers
npm install nuqs date-fns lucide-react

# shadcn/ui init (CLI v4)
npx shadcn@latest init

# Dev dependencies
npm install -D drizzle-kit @types/node
npm install -D @biomejs/biome

# Add shadcn components as needed
npx shadcn@latest add button card input dialog sheet scroll-area avatar badge separator
npx shadcn@latest add form  # includes react-hook-form + zod integration
```

## Docker Setup

```dockerfile
# Dockerfile
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
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

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://aja:aja@db:5432/aja_agora
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: aja
      POSTGRES_PASSWORD: aja
      POSTGRES_DB: aja_agora
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aja"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

## next.config.ts

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Required for Docker deployment
};

export default nextConfig;
```

## Alternatives Considered

| Alternative | Why Not Chosen |
|---|---|
| **LangChain/LangGraph** | Heavy framework with abstractions that fight Claude's native tool use. Anthropic Agent SDK is lighter, official, and purpose-built. |
| **Vercel deployment** | Project requires Docker/VPS. WebSocket-like streaming, long-running agent processes, and PostgreSQL don't fit serverless constraints well. |
| **SQLite / Turso** | No edge deployment benefit on VPS. PostgreSQL handles concurrent writes and relational integrity better for a multi-user fintech app. |
| **MongoDB** | Conversation data is relational (user -> conversations -> messages -> artifacts). Document store adds complexity without benefit. |
| **Redux Toolkit** | Overkill boilerplate for this app's state needs. Zustand does the same with 90% less code. |
| **Jotai** | Atomic model doesn't match the app's state shape (mostly app-wide stores, not granular atoms). |
| **tRPC** | Adds complexity for internal API calls. Next.js Server Actions + API routes with Zod validation achieve the same type safety without another dependency. |
| **Prisma** | Heavier than Drizzle, generates a client binary, slower cold starts in Docker. Drizzle is pure TypeScript with better edge compatibility. |
| **ESLint + Prettier** | Two tools doing what Biome does alone, 10-100x slower. Biome is the 2026 standard for new projects. |
| **CSS Modules** | No utility-class ergonomics, poor DX with shadcn/ui which requires Tailwind. |
| **Radix UI directly** | shadcn/ui wraps Radix with pre-styled, copy-paste components. Using Radix directly means rebuilding what shadcn already provides. |
| **Socket.IO / WebSocket** | SSE via AI SDK handles all streaming needs. WebSocket adds server complexity (sticky sessions, connection management) with no benefit for unidirectional AI streaming. |
| **React Query / TanStack Query** | Could be added later for non-chat server state (admin dashboards, user profiles), but for MVP the chat is the primary data flow and AI SDK handles it. |
| **Convex / Supabase** | Managed backends add vendor lock-in. Project needs Docker/VPS control. PostgreSQL + Drizzle gives full ownership. |

## What NOT to Use

| Technology | Reason |
|---|---|
| **LangChain** | Unnecessary abstraction over Claude's native capabilities. Adds 500KB+ bundle for features the Anthropic SDK handles natively. |
| **Pages Router** | Legacy Next.js routing. App Router is the only supported path forward in Next.js 16. |
| **`tailwind.config.js`** | Tailwind CSS v4 uses CSS-native configuration. Config file is deprecated. |
| **`getServerSideProps` / `getStaticProps`** | Pages Router patterns. Use Server Components and Server Actions instead. |
| **Styled Components / Emotion** | CSS-in-JS runtime overhead, incompatible with Server Components, fights with Tailwind. |
| **`framer-motion` import** | Package renamed to `motion`. Import from `motion/react`, not `framer-motion`. The old import still works but is deprecated. |
| **Mongoose** | MongoDB ORM. Wrong database choice for this project. |
| **Firebase** | Google lock-in, no Docker self-hosting, wrong model for AI-first chat. |
| **Vercel AI SDK v4 or v5** | v6 is current stable with agent support, MCP, and improved `useChat`. Don't use older versions. |
| **`create-react-app`** | Dead project. Next.js is the React meta-framework. |
| **Axios** | Native `fetch` is sufficient in Next.js 16. AI SDK handles all API communication. |

## Key Version Pins

```json
{
  "next": "^16.2",
  "react": "^19.2",
  "tailwindcss": "^4.2",
  "ai": "^6.0",
  "@ai-sdk/anthropic": "latest",
  "@anthropic-ai/claude-agent-sdk": "latest",
  "drizzle-orm": "^0.45",
  "motion": "^12.0",
  "zustand": "^5.0",
  "zod": "^3.24",
  "react-hook-form": "^7.0",
  "@hookform/resolvers": "^5.0",
  "postgres": "^3.4",
  "nuqs": "^2.0",
  "lucide-react": "latest",
  "date-fns": "^4.0"
}
```

## Sources

- [Next.js 16 Blog Post](https://nextjs.org/blog/next-16)
- [Next.js Releases](https://github.com/vercel/next.js/releases)
- [Next.js Docker Example](https://github.com/vercel/next.js/blob/canary/examples/with-docker/README.md)
- [Next.js Standalone Output Docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Anthropic Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/overview)
- [@anthropic-ai/claude-agent-sdk on npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [AI SDK 6 Announcement](https://vercel.com/blog/ai-sdk-6)
- [AI SDK Stream Protocols](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [@ai-sdk/anthropic Provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)
- [shadcn/ui CLI v4 Changelog](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4)
- [shadcn/ui Docs](https://ui.shadcn.com/)
- [Tailwind CSS v4.0 Release](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind CSS 4.2 InfoQ](https://www.infoq.com/news/2026/04/tailwind-css-4-2-webpack/)
- [Motion (Framer Motion) Docs](https://motion.dev/docs/react)
- [Motion Changelog](https://motion.dev/changelog)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Drizzle ORM Latest Releases](https://orm.drizzle.team/docs/latest-releases)
- [Drizzle + Turso Integration](https://docs.turso.tech/sdk/ts/orm/drizzle)
- [Zustand vs Jotai 2026 Comparison](https://dev.to/jsgurujobs/state-management-in-2026-zustand-vs-jotai-vs-redux-toolkit-vs-signals-2gge)
- [React Hook Form + Zod Guide](https://ui.shadcn.com/docs/forms/react-hook-form)
- [Docker Next.js Guide](https://docs.docker.com/guides/nextjs/containerize/)

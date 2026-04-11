<!-- GSD:project-start source:PROJECT.md -->
## Project

**Aja Agora**

Plataforma B2C de consórcio AI-first onde o usuário conversa com um agente inteligente em vez de preencher formulários, navegar abas de comparação ou decifrar tabelas de simulação. O agente conduz toda a jornada — do sonho à assinatura — entregando artefatos interativos (cards clicáveis) que o usuário interage a cada etapa. Por baixo, agentes especializados orquestram busca de grupos, análise financeira, monitoramento de assembleias e KYC, tudo invisível para o usuário.

**Core Value:** O usuário diz o que quer ("comprar um carro em dois anos gastando R$ 800/mês") e recebe uma recomendação personalizada com botão para assinar — sem formulário, sem corretor, sem redirect.

### Constraints

- **Stack:** Next.js (latest stable) + shadcn/ui + Tailwind CSS — padrão TwoBrains
- **IA:** Anthropic Agent SDK (Claude) — multi-agent com tool use nativo
- **Deploy:** Docker/VPS — não serverless
- **Adapter Pattern:** Toda integração com administradoras passa por camada de abstração — facilita trocar mock por real
- **Mobile-first:** Consórcio é produto de massa, maioria acessa por celular
- **Performance:** Chat precisa responder em < 3s para manter engajamento
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
| **shadcn/studio Pro** | MCP + CLI | Premium UI components | Registries `@ss-components`, `@ss-blocks`, `@ss-themes` configurados em `components.json`. MCP `shadcn-studio-mcp` integrado ao Claude Code. CLI: `npx shadcn@latest add @ss-components/<name>`. |
## Architecture Decisions
### Streaming: SSE via AI SDK (not raw WebSocket)
- Natively supported in all browsers
- Simpler than WebSocket for unidirectional server-to-client streaming
- Handles reconnection, keep-alive pings, and caching automatically
- Compatible with Next.js API routes (no custom server needed)
- Debuggable with standard browser DevTools
### Database: PostgreSQL (not SQLite/Turso)
- **Relational integrity** -- conversations reference users, artifacts reference conversations, recommendations reference groups. Foreign keys matter in fintech.
- **JSON columns** -- store flexible artifact payloads without a separate document store.
- **Concurrent writes** -- multiple users chatting simultaneously. SQLite's write lock becomes a bottleneck.
- **Docker-native** -- `postgres:16-alpine` in Compose, zero setup.
- **Migration path** -- if the platform scales, PostgreSQL scales vertically and horizontally (read replicas). SQLite doesn't.
### Two SDKs: Claude Agent SDK + Vercel AI SDK (DECISÃO DO ARQUITETO — NÃO ALTERAR)
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`): Backend orchestration. Define tools de domínio via `tool()` + `createSdkMcpServer()`, executa o agent loop via `query()` com tool calling automático. O SDK fornece o loop completo — Claude decide quais tools chamar, o SDK executa, e devolve o resultado pro Claude continuar. O "cérebro" da aplicação.
- **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`): Frontend streaming. `useChat` hook, SSE protocol, UI de chat. O "rosto" que o usuário vê.
- **Ponte API Route**: `src/app/api/chat/route.ts` recebe mensagens do frontend (AI SDK), passa para o Agent SDK via `query()`, e faz streaming da resposta de volta como SSE.
- **NÃO usar** AI SDK `streamText()`/`tool()` no backend para orquestração — essa responsabilidade é do Agent SDK.
- **NÃO usar** `@anthropic-ai/sdk` (SDK padrão) diretamente — o Agent SDK abstrai o loop de tool calling.
### State Management: Zustand (not Redux, not Jotai)
- Chat has app-wide state (active conversation, user profile, auth state) -- store-based model fits better than atomic.
- AI SDK 6 explicitly supports Zustand integration for decoupled `useChat` state.
- ~3KB bundle, near-zero boilerplate, hooks-based API.
- Jotai's atomic model is better for complex form state or fine-grained reactivity, neither of which is the primary pattern here.
### Animation: Motion (not CSS-only, not React Spring)
- Layout animations (cards appearing, reordering)
- Gesture support (swipe on mobile)
- Spring physics (natural feel for card interactions)
- `AnimatePresence` for enter/exit transitions
## Installation
# Create Next.js 16 project
# Core dependencies
# shadcn/ui init (CLI v4)
# Dev dependencies
# Add shadcn components as needed
## Docker Setup
# Dockerfile
# docker-compose.yml
## next.config.ts
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

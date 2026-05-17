## Project

**Aja Agora**

Plataforma B2C de consórcio AI-first onde o usuário conversa com um agente inteligente em vez de preencher formulários, navegar abas de comparação ou decifrar tabelas de simulação. O agente conduz toda a jornada — do sonho à assinatura — entregando artefatos interativos (cards clicáveis) que o usuário interage a cada etapa. Por baixo, agentes especializados orquestram busca de grupos, análise financeira, monitoramento de assembleias e KYC, tudo invisível para o usuário.

**Core Value:** O usuário diz o que quer ("comprar um carro em dois anos gastando R$ 800/mês") e recebe uma recomendação personalizada com botão para assinar — sem formulário, sem corretor, sem redirect.

### Constraints

- **Stack:** Next.js (latest stable) + shadcn/ui + Tailwind CSS — padrão TwoBrains
- **IA:** Vercel AI SDK 6 (`ai` + `@ai-sdk/anthropic`) — agente com tool use nativo via Claude
- **Deploy:** Docker/VPS — não serverless
- **Adapter Pattern:** Toda integração com administradoras passa por camada de abstração — facilita trocar mock por real
- **Mobile-first:** Consórcio é produto de massa, maioria acessa por celular
- **Performance:** Chat precisa responder em < 3s para manter engajamento

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
| **Vercel AI SDK** | 6.x (`ai` + `@ai-sdk/anthropic`) | Agente + Streaming UI + chat hooks | SDK único do projeto. `streamText`/`tool` no backend executam o agent loop com tool calling automático via `stepCountIs`. `generateObject` para classificação estruturada. `useChat` no frontend para SSE streaming. Provider-agnostic (atualmente Anthropic Claude). Decoupled state management (plugs into Zustand). 20M+ monthly downloads. |
| **Drizzle ORM** | 0.45.x (1.0 beta imminent) | Database access | Type-safe SQL, zero overhead, edge-compatible. Built-in Zod validator integration. Excellent migration system with DAG-based conflict detection. |
| **PostgreSQL** | 16+ | Primary database | Conversations, user profiles, recommendations need relational integrity. JSON columns for flexible artifact storage. Battle-tested for fintech. Docker Compose trivial. |
### Supporting Libraries
| Library | Version | Purpose | Why Recommended |
|---|---|---|---|
| **Motion** (ex Framer Motion) | 12.x (latest 12.38) | Animation | Renamed from `framer-motion` to `motion`. Import from `motion/react`. Hardware-accelerated via Web Animations API, 120fps. Spring physics for card animations, layout transitions for artifact cards. |
| **Zustand** | 5.x | Client state management | ~3KB, single store model. AI SDK 6 `useChat` supports decoupled state with Zustand. Perfect for chat UI state (active conversation, selected artifacts, UI mode). |
| **Zod** | 3.24+ | Schema validation | Single validation layer shared across: form inputs, API routes, AI tool parameters, Drizzle schemas. Used by Vercel AI SDK `tool({ inputSchema })` and `generateObject({ schema })`. |
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
## Design System: shadcn/studio Pro (OBRIGATÓRIO)

**Todo layout e design visual DEVE usar blocos do shadcn/studio Pro via MCP.**

### Workflow de Design
1. **`/cui` (Create UI)** — Buscar e instalar blocos Pro para construir páginas (hero, features, footer, etc.)
2. **`/iui` (Inspire UI)** — Usar blocos como inspiração e adaptar ao contexto do Aja Agora
3. **`/rui` (Refine UI)** — Refinar componentes individuais (buttons, cards, inputs) com variantes Pro

### Blocos Mapeados por Fase

| Fase | Blocos shadcn/studio Pro |
|------|--------------------------|
| Phase 3: Chat UI | `/rui` para refinar Button, Card, Input. Inspiração de `application-shell` para layout do chat |
| Phase 4: Recommendation | `/rui` para cards premium. `statistics-component` para score breakdown |
| Phase 5: Progressive Auth | `multi-step-form` (3 variações). Inspiração de `login-page`, `register` |
| Phase 6: Landing Page | `hero-section` (15 var.), `features-section` (7 var.), `social-proof` (3 var.), `testimonials` (4 var.), `faq` (2 var.), `cta-section`, `footer`, `navbar` (2 var.), `bento-grid` para "como funciona" |

### Regras
- **NUNCA** criar componentes de UI do zero se existir um bloco Pro equivalente
- **SEMPRE** buscar blocos via MCP (`get-blocks-metadata` → `get-block-meta-content` → instalar) antes de codar
- Customizar conteúdo e cores dos blocos Pro para o contexto do Aja Agora
- Usar temas do shadcn/studio quando disponível (`install-theme`)

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
### Single SDK: Vercel AI SDK 6 (revisado em 2026-04-27)
- **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`) é o SDK único do projeto, tanto no backend (orquestração de agente) quanto no frontend (streaming UI).
- **Backend**: `streamText` executa o agent loop com tool calling automático via `stepCountIs`. Tools de domínio definidas com `tool({ inputSchema, execute })` em `src/lib/agent/tools/ai-sdk.ts`. `generateText` para chamadas one-shot (insights de admin). `generateObject` com schema Zod para classificação estruturada.
- **Frontend**: `useChat` hook lida com SSE streaming, tool invocations, error states. Estado decoupled (Zustand).
- **Ponte API Route**: `src/app/api/chat/route.ts` (chat web) e `src/lib/whatsapp/processor.ts` (WhatsApp) consomem `streamText` direto e fazem streaming/envio sequencial conforme o canal.
- **Histórico**: o Anthropic Agent SDK (`@anthropic-ai/claude-agent-sdk`) foi usado nas Phases 2-5 e descontinuado em 2026-04-27 — código órfão removido, dependência removida do `package.json`. Se for reintroduzido, deve ser via decisão arquitetural explícita.
- **NÃO usar** `@anthropic-ai/sdk` (SDK padrão) diretamente — o Vercel AI SDK abstrai o loop de tool calling.
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
| **LangChain/LangGraph** | Heavy framework with abstractions that fight Claude's native tool use. Vercel AI SDK 6 is lighter and provides tool calling, streaming and structured output natively. |
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
| **LangChain** | Unnecessary abstraction over Claude's native capabilities. Adds 500KB+ bundle for features the Vercel AI SDK handles natively. |
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

## Feature Development Workflow (OBRIGATÓRIO)

**Toda feature, refactor não-trivial ou correção de bug "complexo" segue este fluxo. Sempre sugira esse caminho antes de implementar — não pule etapas. Vale para features novas, lotes de bugfix e qualquer trabalho onde "feito" não é trivial.**

Sequência (não inverter ordem):

1. **Modo plano** — usar `ExitPlanMode` (ou equivalente do harness) antes de tocar em código. Aprovação do plano pelo Kairo é gate de entrada.
2. **PO Lead (planejamento de QA)** — lançar agente com persona de **Product Owner Lead com skill de QA sênior**, modelo `claude-opus-4-7`. Produz um **plano de teste por feature/bug** contendo:
   - Cenários (happy path + edge cases + regressões prováveis)
   - **Critérios de aceite explícitos** (binários, verificáveis — "passa/não passa", nunca "deveria")
   - Dados de teste necessários (fixtures, seeds, contas/personas)
   - Pontos de falha conhecidos do domínio (race conditions, estados intermediários, multi-canal web↔WhatsApp)
   - Output esperado por cenário (estado de DB, payload de API, screenshot de UI)
   - Salvar em `docs/test-plans/<feature-slug>.md` para auditoria e diff em revisão de código.
   Esse plano é a **fonte de verdade do que "feito" significa**. Critério não escrito = critério não validado.
3. **Implementação TDD** — segue a regra global (`~/.claude/CLAUDE.md` → "Regra de TDD para bugs"). Testes primeiro, ver falhar, implementar, ver passar. Commits `test+fix:` ou `test+feat:` por unidade.
4. **QA crítico (validação E2E)** — lançar agente com persona de **QA crítico e chato, primeiro QA do produto**, modelo `claude-opus-4-7`. Recebe o plano do PO Lead como input. Responsabilidade:
   - Executar todos os cenários do plano (E2E via Playwright/Chrome DevTools quando aplicável; unit/integration quando E2E não cabe)
   - **Rigor adversarial:** procurar buracos, não validar superficialmente. Tentar quebrar.
   - Reportar falha por critério de aceite com **evidência** (screenshot, log, snippet, query do DB)
   - Não deixar passar nada — ser explicitamente **chato**. Pedir refazer quando em dúvida.
5. **Loop até verde** — qualquer critério reprovado → corrigir → re-rodar QA crítico → repetir. **Só declarar feature concluída quando todos os critérios de aceite do plano do PO Lead estiverem satisfeitos.** Não negociar critérios pra "fechar".

**Modelos obrigatórios (não substituir por Sonnet/Haiku):**
- PO Lead: `claude-opus-4-7` — planejamento qualitativo profundo, levantar edge cases que escapam de modelos menores
- QA crítico: `claude-opus-4-7` — rigor adversarial > velocidade. Vale gastar token aqui.

**Quando pular:** apenas tarefas triviais que não tocam código de produção (atualizar README, ajustar config local, renomear variável local, hotfix óbvio de 1 linha). Em dúvida, **não pule**.

**Lançamento dos agentes:** via `Agent` tool com `subagent_type: general-purpose`, `model: opus`, e prompt que inclui:
- Persona literal: "Você é o PO Lead com skill de QA sênior..." ou "Você é o QA crítico e chato, primeiro QA do produto..."
- Contexto da feature/bug (referências de arquivo, PRs relacionados)
- Para QA crítico: **caminho do plano** do PO Lead no prompt (`docs/test-plans/<slug>.md`) para ele ler e validar contra
- Saída esperada: PO Lead → markdown do plano; QA crítico → relatório de pass/fail por critério com evidência

## Autonomia — NUNCA perguntar "quer que eu siga?"

Kairo odeia perguntas confirmatórias bobas dentro desse fluxo (e em geral). Quando uma fase termina e a próxima já está prevista no plano aprovado ou no workflow PO Lead → TDD → QA crítico, **execute a próxima diretamente** — não confirme.

Proibido: "quer que eu lance o QA crítico?", "devo seguir pra Fase X?", "posso continuar?". Permitido: pause SÓ se aparecer ambiguidade arquitetural real (use `/grill-with-docs`) ou ação destrutiva (push/deploy/drop). Para tudo no meio, **execute e reporte** ("feito X, lançando Y agora").

# Phase 2: Agent Core & Adapter Layer - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the conversational agent with Claude, domain tools, deterministic recommendation pipeline, and the adapter abstraction that decouples all administradora data access behind a typed interface with mock implementation.

</domain>

<decisions>
## Implementation Decisions

### Agent Architecture & SDK Integration
- Agent runs in API Route handler (`src/app/api/chat/route.ts`) — SSE streaming via Vercel AI SDK's `useChat` on frontend, Agent SDK orchestrates on backend
- System prompt in a single file (`src/lib/agent/system-prompt.ts`) with template literals — sections for role, consórcio domain, BACEN disclaimers, tool instructions
- Conversation state is database-backed — load conversation from PostgreSQL on each request, pass message history to Claude. Stateless server, schema from Phase 1
- Agent SDK handles tool orchestration → returns structured response → AI SDK `streamText` serializes to SSE. Agent decides, AI SDK handles wire format

### Tool Design & Adapter Pattern
- Tool parameters/returns use Zod schemas (`src/lib/agent/tools/schemas.ts`) — single source of truth for params AND validation. Agent SDK uses Zod natively
- One interface with multiple methods — `AdministradoraAdapter` with `searchGroups()`, `simulateQuota()`, `getRates()`, `getGroupDetails()`. Factory returns the full adapter
- Static JSON fixtures for mock data (`src/lib/adapters/mock/data/`) — realistic consórcio data with 3 administradoras, ~10 groups each, real tax rates. Deterministic, version-controlled
- Recommendation scoring uses weighted multi-factor score in pure TypeScript (`src/lib/agent/recommendation.ts`) — factors: monthly fit (40%), historico contemplação (25%), taxa admin (20%), prazo match (15%). Deterministic, unit-testable, NOT in LLM

### Security, Compliance & Session Isolation
- BACEN disclaimers in system prompt + appended to first agent response — double coverage
- Agent MUST use tools for any financial number — system prompt guardrails explicitly say "never invent numbers, always use tool results". Tested with adversarial prompts
- Session isolation via conversation ID scoping — every DB query filters by `conversationId`. API route creates/loads conversation per session cookie
- Simple in-memory rate limiter (`src/lib/middleware/rate-limit.ts`) — token bucket per IP, 10 req/min for chat endpoint

### Claude's Discretion
- Specific tool implementation details (error handling patterns, retry logic)
- Mock data values (realistic but fictional administradora names, rates, group details)
- System prompt wording (as long as BACEN disclaimers and guardrails are included)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema.ts` — conversations, messages, artifacts, leads tables with Drizzle ORM
- `src/db/index.ts` — database client with runtime DATABASE_URL guard
- `src/lib/utils.ts` — cn() utility from shadcn

### Established Patterns
- Drizzle ORM for database access (node-postgres driver)
- Zod for validation (already a dependency via shadcn)
- TypeScript strict mode
- Biome for linting/formatting

### Integration Points
- `src/app/api/chat/route.ts` — new API route for agent
- `src/db/schema.ts` — use existing conversation/message tables
- `package.json` — add @anthropic-ai/claude-agent-sdk, ai, @ai-sdk/anthropic

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond what was decided above — open to standard approaches for implementation details.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

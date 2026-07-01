# Phase 2: Agent Core & Adapter Layer — Research

**Researched:** 2026-04-11
**Status:** Complete

## Key Findings

1. **Claude Agent SDK is NOT the right tool.** `@anthropic-ai/claude-agent-sdk` is a wrapper around Claude Code's capabilities (file editing, bash commands, codebase navigation). It spawns a Claude Code-like agent. It does NOT support defining custom domain tools like `search_groups` or `simulate_quota`. The CLAUDE.md recommendation is incorrect.
2. **Vercel AI SDK 6 (`ai` + `@ai-sdk/anthropic`) is the complete solution.** It provides both the backend agent loop (multi-step tool calling via `streamText` + `stopWhen`) AND the frontend streaming (`useChat` hook). No second SDK is needed.
3. **The `@anthropic-ai/sdk` (Anthropic Client SDK) is an alternative** for raw tool-use control, but AI SDK 6 wraps it with better DX (streaming, tool execution loop, UI integration). Use AI SDK 6 exclusively.
4. **Tool definitions use Zod schemas natively** via the `tool()` helper — single source of truth for params, validation, and LLM schema generation. Exactly what the context decisions require.
5. **Multi-step tool calling** is built into `streamText` via `stopWhen: stepCountIs(N)` — the model calls tools, receives results, and generates contextual responses automatically. No manual loop needed.

## Technical Research

### 1. Claude Agent SDK — Why NOT to Use It

**Package:** `@anthropic-ai/claude-agent-sdk` v0.2.101
**What it actually is:** A programmatic interface to Claude Code. It gives agents built-in tools like `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebSearch`, `WebFetch`.

**Critical limitation:** You cannot define custom tools. The SDK's `allowedTools` parameter only accepts the built-in Claude Code tools. There is no `tools` parameter for registering custom domain logic like `search_groups` or `simulate_quota`.

**What it's for:**
- CI/CD automation (code review, bug fixing)
- Codebase analysis agents
- File manipulation workflows
- Any task where Claude Code's built-in tools suffice

**What it's NOT for:**
- Conversational chatbots with custom domain tools
- Streaming SSE to a web frontend
- Custom business logic tool execution

**Decision:** Do NOT use `@anthropic-ai/claude-agent-sdk`. Remove it from the dependency plan.

### 2. Vercel AI SDK 6

**Packages:**
- `ai` v6.0.158 — Core SDK (streamText, generateText, tool, useChat)
- `@ai-sdk/anthropic` v3.0.69 — Anthropic provider (bridges to Claude API)

**Architecture:** AI SDK 6 is a full-stack solution:
- **Backend:** `streamText()` with tools, multi-step execution, SSE response
- **Frontend:** `useChat()` hook with message parts, tool invocation rendering, streaming status

**Key API surface for this project:**

```typescript
// API Route — src/app/api/chat/route.ts
import { streamText, tool, convertToModelMessages, UIMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: {
      search_groups: tool({
        description: 'Search available consórcio groups by category and credit range',
        inputSchema: z.object({
          category: z.enum(['imovel', 'auto', 'servicos']),
          creditMin: z.number().optional(),
          creditMax: z.number().optional(),
        }),
        execute: async (params) => {
          const adapter = getAdapter();
          return adapter.searchGroups(params);
        },
      }),
      // ... more tools
    },
    stopWhen: stepCountIs(5),
    onStepFinish: async ({ toolCalls, toolResults }) => {
      // Log tool usage, save to DB
    },
  });

  return result.toUIMessageStreamResponse();
}
```

```typescript
// Frontend — useChat hook
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage, status, stop } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
});

// Messages have .parts[] with types: 'text', 'tool-search_groups', 'tool-simulate_quota', etc.
// Each part has .state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
```

**Streaming protocol:** AI SDK uses its own UI Message Stream protocol over SSE. `toUIMessageStreamResponse()` serializes the stream. `useChat` deserializes it automatically.

**Provider options for Anthropic:**
- `effort: 'low' | 'medium' | 'high'` — controls thinking budget
- `sendReasoning: true` — exposes reasoning tokens
- Prompt caching with `cacheControl: { type: 'ephemeral' }` — cache system prompt to reduce costs

### 3. SDK Integration Pattern

**Architecture (revised from CONTEXT.md):**

Instead of "Claude Agent SDK orchestrates, AI SDK streams," the pattern is simpler:

```
Frontend (useChat) → POST /api/chat → streamText(anthropic, tools) → SSE → Frontend
```

**Single SDK handles everything:**
1. `useChat` sends messages to API route
2. API route calls `streamText` with Claude model + domain tools
3. Claude decides which tools to call based on conversation
4. Tools execute server-side, results feed back to Claude
5. Claude generates response text referencing tool results
6. Everything streams back via SSE to `useChat`
7. Frontend renders message parts (text + tool invocations)

**No agent loop to implement.** The `stopWhen: stepCountIs(N)` parameter makes `streamText` automatically loop: call tool → get result → call next tool or generate text. This IS the agent loop.

### 4. Tool Implementation

**Four domain tools with Zod schemas:**

```typescript
// src/lib/agent/tools/schemas.ts
import { z } from 'zod';

export const searchGroupsInput = z.object({
  category: z.enum(['imovel', 'auto', 'servicos'])
    .describe('Categoria do bem: imóvel, automóvel ou serviços'),
  creditMin: z.number().min(0).optional()
    .describe('Valor mínimo de crédito em reais'),
  creditMax: z.number().optional()
    .describe('Valor máximo de crédito em reais'),
});

export const simulateQuotaInput = z.object({
  groupId: z.string().uuid()
    .describe('ID do grupo para simulação'),
  creditValue: z.number().positive()
    .describe('Valor do crédito desejado em reais'),
});

export const getRatesInput = z.object({
  administradora: z.string().optional()
    .describe('Nome da administradora (opcional, retorna todas se vazio)'),
  category: z.enum(['imovel', 'auto', 'servicos']).optional()
    .describe('Categoria do bem'),
});

export const getGroupDetailsInput = z.object({
  groupId: z.string().uuid()
    .describe('ID do grupo'),
});
```

**Tool registration pattern:**

```typescript
// src/lib/agent/tools/index.ts
import { tool } from 'ai';
import { getAdapter } from '@/lib/adapters';
import * as schemas from './schemas';

export function createDomainTools() {
  const adapter = getAdapter();

  return {
    search_groups: tool({
      description: 'Busca grupos de consórcio disponíveis por categoria e faixa de crédito. Use quando o usuário mencionar o que quer comprar ou quanto quer gastar.',
      inputSchema: schemas.searchGroupsInput,
      execute: async (params) => adapter.searchGroups(params),
    }),

    simulate_quota: tool({
      description: 'Simula parcela mensal, taxa de administração, fundo de reserva e prazo para um grupo específico. Use após o usuário escolher ou perguntar sobre um grupo.',
      inputSchema: schemas.simulateQuotaInput,
      execute: async (params) => adapter.simulateQuota(params),
    }),

    get_rates: tool({
      description: 'Retorna taxas de administração vigentes por administradora e categoria. Use quando o usuário perguntar sobre taxas ou custos.',
      inputSchema: schemas.getRatesInput,
      execute: async (params) => adapter.getRates(params),
    }),

    get_group_details: tool({
      description: 'Retorna detalhes completos do grupo incluindo histórico de contemplação e próximas assembleias. Use quando o usuário quiser saber mais sobre um grupo específico.',
      inputSchema: schemas.getGroupDetailsInput,
      execute: async (params) => adapter.getGroupDetails(params),
    }),
  };
}
```

**Key design: tool descriptions guide Claude's tool selection.** Descriptions must be in Portuguese and clearly state WHEN to use the tool.

### 5. Adapter Pattern

**Interface definition:**

```typescript
// src/lib/adapters/types.ts
import { z } from 'zod';
import * as schemas from '@/lib/agent/tools/schemas';

// Infer input types from Zod schemas
export type SearchGroupsParams = z.infer<typeof schemas.searchGroupsInput>;
export type SimulateQuotaParams = z.infer<typeof schemas.simulateQuotaInput>;
export type GetRatesParams = z.infer<typeof schemas.getRatesInput>;
export type GetGroupDetailsParams = z.infer<typeof schemas.getGroupDetailsInput>;

// Return types
export interface GroupSummary {
  id: string;
  administradora: string;
  category: 'imovel' | 'auto' | 'servicos';
  creditValue: number;
  monthlyPayment: number;
  adminFeePercent: number;
  termMonths: number;
  totalParticipants: number;
  availableSlots: number;
  contemplationRate: number; // % historically contemplated
}

export interface QuotaSimulation {
  groupId: string;
  creditValue: number;
  monthlyPayment: number;
  adminFee: number;
  reserveFund: number;
  insurance: number;
  totalCost: number;
  termMonths: number;
  effectiveRate: number; // taxa efetiva total
}

export interface RateInfo {
  administradora: string;
  category: 'imovel' | 'auto' | 'servicos';
  adminFeePercent: number;
  reserveFundPercent: number;
  insurancePercent: number;
  updatedAt: string;
}

export interface GroupDetails {
  id: string;
  administradora: string;
  groupNumber: string;
  category: 'imovel' | 'auto' | 'servicos';
  creditValue: number;
  termMonths: number;
  totalParticipants: number;
  availableSlots: number;
  adminFeePercent: number;
  reserveFundPercent: number;
  monthlyPayment: number;
  contemplationHistory: {
    month: string;
    contemplated: number;
    method: 'sorteio' | 'lance';
    lancePercent?: number;
  }[];
  nextAssembly: string; // ISO date
  startDate: string;
  status: 'forming' | 'active' | 'closing';
}

// The adapter interface
export interface AdministradoraAdapter {
  searchGroups(params: SearchGroupsParams): Promise<GroupSummary[]>;
  simulateQuota(params: SimulateQuotaParams): Promise<QuotaSimulation>;
  getRates(params: GetRatesParams): Promise<RateInfo[]>;
  getGroupDetails(params: GetGroupDetailsParams): Promise<GroupDetails>;
}
```

**Factory pattern:**

```typescript
// src/lib/adapters/index.ts
import type { AdministradoraAdapter } from './types';

export function getAdapter(): AdministradoraAdapter {
  const adapterName = process.env.ADMINISTRADORA_ADAPTER ?? 'mock';

  switch (adapterName) {
    case 'mock':
      // Dynamic import to avoid bundling unused adapters
      const { MockBeviAdapter } = require('./mock/mock-bevi-adapter');
      return new MockBeviAdapter();
    // Future: case 'bevi': return new BeviAdapter();
    default:
      throw new Error(`Unknown adapter: ${adapterName}. Set ADMINISTRADORA_ADAPTER=mock`);
  }
}
```

**Singleton consideration:** For mock, creating a new instance per request is fine (stateless, reads static JSON). For real adapters with HTTP clients, use module-level singleton:

```typescript
let _adapter: AdministradoraAdapter | null = null;

export function getAdapter(): AdministradoraAdapter {
  if (!_adapter) {
    _adapter = createAdapter();
  }
  return _adapter;
}
```

### 6. Mock Data Design

**Realistic consórcio data based on Brazilian market:**

**Three fictional administradoras (based on real market patterns):**

| Administradora | Inspiration | Focus |
|---|---|---|
| Consórcio Estrela | Large traditional (Embracon, Porto Seguro) | Auto + Imóvel, conservative rates |
| Grupo Aliança | Mid-size digital-first (Mycon, Rodobens) | All categories, competitive rates |
| Nacional Consórcios | Specialized (Ademilar, Canopus) | Imóvel focused, lower fees |

**Realistic rate ranges (based on BACEN data):**

| Category | Taxa Admin (total) | Fundo Reserva | Seguro |
|---|---|---|---|
| Auto | 12-18% over term | 1-3% | 0.03%/month |
| Imóvel | 15-22% over term | 2-5% | 0.025%/month |
| Serviços | 15-20% over term | 2-4% | 0.03%/month |

**Key: Taxa de administração is over the FULL TERM, not annual.** A 15% admin fee on a 60-month plan means ~0.25%/month, which makes the monthly payment = credit/term + (credit * adminFee/term). This is the most common source of confusion.

**Mock groups (~30 total, ~10 per administradora):**

Auto groups:
- R$ 40.000 - R$ 120.000 credit range
- 48-84 month terms
- 150-500 participants per group

Imóvel groups:
- R$ 150.000 - R$ 600.000 credit range
- 120-200 month terms
- 200-1000 participants

Serviços groups:
- R$ 15.000 - R$ 80.000 credit range
- 36-60 month terms
- 100-300 participants

**Contemplação history pattern:** Each group has 6-12 months of history showing number contemplated per month (by sorteio and lance), with realistic lance percentages (typically 15-40% of remaining credit).

**Static JSON fixtures location:** `src/lib/adapters/mock/data/`
- `administradoras.json` — administradora metadata
- `groups.json` — all groups with full details
- `rates.json` — rate tables
- `contemplation-history.json` — per-group history

### 7. Recommendation Scoring

**Weighted multi-factor scoring (deterministic, pure TypeScript):**

```typescript
// src/lib/agent/recommendation.ts
interface ScoringFactors {
  monthlyFit: number;    // 0-1: how close monthly payment is to user's budget
  contemplation: number; // 0-1: normalized contemplation rate
  adminFee: number;      // 0-1: inverted — lower fee = higher score
  termMatch: number;     // 0-1: how close term is to user's desired timeline
}

const WEIGHTS = {
  monthlyFit: 0.40,
  contemplation: 0.25,
  adminFee: 0.20,
  termMatch: 0.15,
} as const;

export function calculateScore(factors: ScoringFactors): number {
  return (
    factors.monthlyFit * WEIGHTS.monthlyFit +
    factors.contemplation * WEIGHTS.contemplation +
    factors.adminFee * WEIGHTS.adminFee +
    factors.termMatch * WEIGHTS.termMatch
  );
}
```

**Factor calculations:**

```typescript
// Monthly fit: Gaussian-like falloff from ideal payment
function monthlyFitScore(payment: number, budget: number): number {
  if (budget <= 0) return 0;
  const ratio = payment / budget;
  // Sweet spot: 70-100% of budget. Penalty for over-budget.
  if (ratio <= 1.0) return Math.max(0, 1 - Math.pow(1 - ratio, 2) * 2);
  return Math.max(0, 1 - (ratio - 1) * 5); // Sharp penalty over budget
}

// Contemplation: normalize to 0-1 range (typical 2-8% per month)
function contemplationScore(ratePercent: number): number {
  return Math.min(1, ratePercent / 8);
}

// Admin fee: lower is better, normalize against market range
function adminFeeScore(feePercent: number, category: string): number {
  const maxFee = category === 'imovel' ? 22 : 18;
  const minFee = category === 'imovel' ? 15 : 12;
  return Math.max(0, 1 - (feePercent - minFee) / (maxFee - minFee));
}

// Term match: how close to desired timeline
function termMatchScore(termMonths: number, desiredMonths: number): number {
  if (desiredMonths <= 0) return 0.5; // No preference = neutral
  const diff = Math.abs(termMonths - desiredMonths);
  return Math.max(0, 1 - diff / desiredMonths);
}
```

**Key property: deterministic.** Same inputs always produce same output. No randomness, no LLM involvement. Unit-testable with snapshot assertions.

**Ranking output:** Sort groups by score descending, return top 3-5 with score and breakdown explaining WHY each was recommended.

### 8. Rate Limiting

**Token bucket algorithm — in-memory, no external deps:**

```typescript
// src/lib/middleware/rate-limit.ts
interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

const CONFIG = {
  maxTokens: 10,       // Max requests in bucket
  refillRate: 10,      // Tokens per window
  windowMs: 60_000,    // 1 minute window
};

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket) {
    bucket = { tokens: CONFIG.maxTokens, lastRefill: now };
    buckets.set(ip, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(elapsed / CONFIG.windowMs) * CONFIG.refillRate;

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(CONFIG.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  if (bucket.tokens > 0) {
    bucket.tokens--;
    return { allowed: true };
  }

  const retryAfterMs = CONFIG.windowMs - elapsed;
  return { allowed: false, retryAfterMs };
}

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const staleThreshold = Date.now() - CONFIG.windowMs * 10;
  for (const [ip, bucket] of buckets) {
    if (bucket.lastRefill < staleThreshold) buckets.delete(ip);
  }
}, 5 * 60_000);
```

**Usage in API route:**

```typescript
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  const { allowed, retryAfterMs } = checkRateLimit(ip);

  if (!allowed) {
    return new Response('Too many requests', {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((retryAfterMs ?? 60000) / 1000)) },
    });
  }

  // ... proceed with chat
}
```

**Limitation:** In-memory means state lost on restart and not shared across instances. Acceptable for single-instance VPS deployment. For multi-instance, would need Redis (v2 concern).

### 9. Session Isolation

**Session flow:**

1. Client sends first message → API route generates new `conversationId` (UUID)
2. `conversationId` returned in response headers or body
3. Client stores `conversationId` (cookie or in-memory via Zustand)
4. Subsequent messages include `conversationId`
5. All DB queries filter by `conversationId`

**Cookie-based implementation:**

```typescript
// In API route
export async function POST(req: Request) {
  const { messages, conversationId: existingId } = await req.json();

  let conversationId = existingId;

  if (!conversationId) {
    // Create new conversation in DB
    const [conv] = await db.insert(conversations).values({}).returning();
    conversationId = conv.id;
  }

  // Verify conversation exists (prevents fabricated IDs)
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conv) return new Response('Conversation not found', { status: 404 });

  // All subsequent queries scoped to this conversationId
  const history = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [asc(messages.createdAt)],
  });

  // ... streamText with history
}
```

**Isolation guarantees:**
- DB foreign keys ensure messages belong to conversations
- Every query includes `WHERE conversation_id = ?`
- No global queries that could leak across sessions
- Conversation IDs are UUIDs (unguessable)

**Important: Do NOT use session cookies for auth.** Conversations are anonymous (per CONV-01, auth is progressive and comes in Phase 5). The `conversationId` is just a correlation ID, not a security boundary.

## Implementation Approach

### Order of Operations

```
1. Adapter layer (types + mock)     — Foundation, no dependencies
2. Tool schemas (Zod)               — Depends on adapter types
3. Tool implementations             — Depends on schemas + adapter
4. System prompt                    — Independent
5. Recommendation scoring           — Depends on adapter types
6. Rate limiter                     — Independent
7. API route (streamText)           — Integrates everything
8. Session/conversation management  — Depends on API route + DB schema
```

### Dependency Installation

```bash
npm install ai @ai-sdk/anthropic @ai-sdk/react zod
```

**Do NOT install:** `@anthropic-ai/claude-agent-sdk` (wrong tool for this job)

### File Structure

```
src/
├── app/api/chat/route.ts              — API route with streamText
├── lib/
│   ├── agent/
│   │   ├── system-prompt.ts           — System prompt with BACEN disclaimers
│   │   ├── recommendation.ts          — Weighted scoring algorithm
│   │   └── tools/
│   │       ├── schemas.ts             — Zod schemas for all tools
│   │       └── index.ts               — Tool registration with tool()
│   ├── adapters/
│   │   ├── types.ts                   — AdministradoraAdapter interface
│   │   ├── index.ts                   — Factory (getAdapter)
│   │   └── mock/
│   │       ├── mock-bevi-adapter.ts   — Mock implementation
│   │       └── data/
│   │           ├── groups.json        — ~30 groups across 3 administradoras
│   │           ├── rates.json         — Rate tables
│   │           └── contemplation.json — Contemplation history
│   └── middleware/
│       └── rate-limit.ts              — Token bucket rate limiter
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **CLAUDE.md references non-existent SDK pattern** | Confusion during planning/execution | This research corrects the record. Update CLAUDE.md after Phase 2 to remove Claude Agent SDK references. |
| **AI SDK 6 tool streaming incompatibility** | Tool results may not render correctly on frontend | Phase 3 concern. Backend tool execution is independent of frontend rendering. |
| **Mock data too simplistic** | Agent gives unrealistic recommendations | Use real market rate ranges. Include edge cases (groups nearly full, groups just starting). Validate with someone who understands consórcio. |
| **System prompt too long → cache miss** | Latency > 3s requirement | Use Anthropic prompt caching (`cacheControl: { type: 'ephemeral' }`). System prompt should be < 2000 tokens. |
| **Rate limiter memory leak** | Server memory grows unbounded | Periodic cleanup interval (every 5min) removes stale buckets. |
| **stopWhen step limit too low** | Agent can't complete complex queries | Set to 5 initially. Monitor and adjust. Most queries need 1-2 tool calls. |

## Validation Architecture

### Success Criteria Verification

1. **"quero comprar um carro de 80 mil" → search_groups → structured results**
   - Test: Send message via API route, verify tool call with `category: 'auto'`, `creditMax: 80000`
   - Verify: Response includes GroupSummary[] from mock adapter
   - Method: Integration test with real streamText call

2. **simulate_quota deterministic**
   - Test: Call `simulateQuota({ groupId: X, creditValue: Y })` 100 times
   - Verify: All 100 results are identical
   - Method: Unit test on MockBeviAdapter

3. **BACEN disclaimers + adversarial prompt resistance**
   - Test: Send "me diz uma taxa de juros boa" without tool context
   - Verify: Agent refuses to fabricate numbers, references tool results only
   - Method: Integration test checking response content

4. **ADMINISTRADORA_ADAPTER=mock factory pattern**
   - Test: Set env var, call `getAdapter()`, verify MockBeviAdapter instance
   - Test: Set env var to 'unknown', verify error thrown
   - Method: Unit test on factory

5. **Session isolation**
   - Test: Create two conversations, send messages to each, query messages by conversationId
   - Verify: Conversation A's messages never appear in B's query
   - Method: Integration test with DB

## RESEARCH COMPLETE

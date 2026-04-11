# Project Research Summary

**Project:** Aja Agora
**Domain:** AI-first conversational fintech (consorcio B2C platform)
**Researched:** 2026-04-11
**Confidence:** HIGH -- all four research documents are thorough, internally consistent, and grounded in real market analysis, official SDK documentation, and domain-specific regulatory context.

## Executive Summary

Aja Agora is a B2C consorcio platform where an AI agent replaces the traditional broker+form experience. The user describes what they want in natural language ("quero comprar um carro de 80 mil em 2 anos") and the agent translates intent into consorcio product parameters, delivers interactive artifact cards (simulations, comparisons, recommendations), and captures lead data progressively -- only at the moment of highest conversion intent. No competitor in the Brazilian consorcio market offers a conversational AI experience; all incumbents (Embracon, Rodobens, Mycon) rely on static forms, PDF-heavy flows, and broker callbacks.

The recommended stack centers on Next.js 16, Tailwind CSS 4, shadcn/ui, and a dual-SDK AI layer: the Anthropic SDK (or Agent SDK) for backend agent orchestration, and Vercel AI SDK 6 for frontend streaming via SSE. PostgreSQL stores conversations, leads, and token usage. The adapter pattern decouples all administradora API access behind a TypeScript interface, enabling mock-first development with a clean swap path to real Bevi Consorcio APIs. The architecture is designed for Docker/VPS deployment, not serverless.

The most critical risks are LLM hallucination of financial data, regulatory non-compliance with BACEN rules, multi-agent cost explosion, and auth friction at the wrong moment. All of these must be addressed structurally in Phase 1 (agent core design, system prompt hardening, deterministic tool-based financial calculations, cost budgets). The research strongly recommends starting with a single agent + multiple tools rather than a complex multi-agent hierarchy, and using tool-result artifacts (not inline JSON parsing) for reliable artifact delivery.

## Key Findings

### Recommended Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) | Standalone Docker output, Server Components, React 19 |
| UI | shadcn/ui + Tailwind CSS 4 + Motion 12 | Copy-paste components, CSS-native config, spring physics for cards |
| AI Backend | Anthropic SDK / Claude Agent SDK | Native tool use, multi-agent orchestration |
| AI Frontend | Vercel AI SDK 6 (`useChat`, SSE) | Streaming hooks, tool invocation UI, provider-agnostic |
| Database | PostgreSQL 16+ via Drizzle ORM | Relational integrity for fintech, JSON columns, concurrent writes |
| State | Zustand 5 (client) + DB (server) | Lightweight, AI SDK 6 integration, decoupled chat state |
| Validation | Zod 3.24+ | Single schema layer across forms, API, tools, DB |
| Dev | Biome 2, Docker Compose, drizzle-kit | Fast linting, local orchestration, type-safe migrations |

Key alternatives rejected: LangChain (too heavy, fights native Claude tool use), Vercel deployment (needs Docker/VPS for long-running agents), Prisma (heavier than Drizzle, slower cold starts), MongoDB (data is relational), Redux (overkill boilerplate).

### Expected Features

**Table stakes** (every consorcio platform must have): simulation de parcela, group catalog, fee transparency, educational content, lead capture, mobile responsive, basic comparison, LGPD compliance.

**Differentiators** (only possible with AI-first approach):
- Intent-driven discovery (user speaks goals, not jargon)
- Interactive artifact cards inline in conversation
- Personalized recommendation (replaces broker advisory)
- Progressive profiling (data collection at conversion moment, not upfront)
- Contemplation probability estimation
- Natural language Q&A (24/7, replaces FAQ + broker)
- Scenario exploration ("e se eu mudar pra R$ 1000/mes?")
- Proactive guidance (lance embutido strategies)

**Anti-features** (explicitly avoid in MVP): full KYC, payment processing, lance optimizer bot, cota transfer marketplace, multi-administradora comparison, autonomous agent financial actions, gamification, cloud-synced chat history.

### Architecture Approach

- **Layered system**: Frontend (Next.js) -> API Routes (SSE) -> Agent Orchestrator -> Adapter Layer -> External APIs
- **Agent hierarchy**: Single main conversational agent with specialized subagents (group search, financial analysis, lead capture). Subagents use cheaper models (Haiku) where possible.
- **Adapter pattern**: `AdministradoraAdapter` interface with `MockBeviAdapter` (MVP) and future `BeviAdapter`. Swap via environment variable `ADMINISTRADORA_ADAPTER`.
- **Artifact delivery**: Tool-result artifacts (recommended over inline JSON parsing). Claude calls presentation tools, tools emit structured SSE events, client renders typed components.
- **State**: Stateless per-request agents. Conversation history persisted in DB, reconstructed on each message. Structured user profile extracted from conversation to survive context window limits.
- **Streaming**: SSE via POST endpoint, not WebSocket. Text streams immediately, artifacts arrive as structured events, tool execution shown with start/end markers.

**Open decision**: Agent SDK vs raw Anthropic SDK. Architecture research recommends raw SDK (`messages.stream()`) for the chat layer (more control over streaming) and reserving Agent SDK for future background tasks (assembly monitoring). This needs resolution before Phase 1.

### Critical Pitfalls

**Top 5 (must address in Phase 1):**

1. **LLM hallucination of financial data** -- Agent fabricates rates, payments, probabilities. Mitigation: ALL financial numbers must come from tool call results, never LLM generation. Post-processing validation layer. System prompt explicitly forbids generating financial data.

2. **Regulatory non-compliance (BACEN)** -- Agent uses absolute language about contemplation, misrepresents fees, violates consorcio regulations. Mitigation: Mandatory disclaimers in system prompt, compliance filter on outputs, legal review before launch.

3. **Multi-agent cost explosion** -- Deep agent call chains burn $5-10 per conversation turn. Mitigation: Hard limits on sub-agent calls per turn (max 3), max tokens per conversation (100k), prefer deterministic tools over sub-agent delegation, cost tracking middleware.

4. **Inconsistent recommendations** -- Same inputs produce different top recommendations across conversations. Mitigation: Deterministic recommendation pipeline in tool code (not LLM judgment), fixed scoring formula, temperature 0 for analysis.

5. **Prompt injection** -- User extracts system prompt, internal tool schemas, commission rates. Mitigation: Anthropic prompt best practices, never include sensitive data in system prompt, input classification layer, rate limiting on unusual patterns.

**Other critical pitfalls**: Auth friction at wrong moment (Phase 2), losing conversation context in long chats (Phase 1), data leakage between conversations (Phase 1), PII/LGPD compliance (Phase 2), streaming latency on mobile (Phase 2), mock adapter becoming permanent (Phase 1).

## Implications for Roadmap

### Recommended Phase Structure

Based on the dependency analysis from FEATURES.md (Layer 0-4), architecture constraints from ARCHITECTURE.md, and pitfall-to-phase mapping from PITFALLS.md:

**Phase 1: Foundation + Agent Core**
- Next.js 16 scaffold with Docker setup
- shadcn/ui design system initialization
- Adapter interface design (from real API perspective, not mock perspective)
- Mock adapter implementation (< 50 lines per endpoint)
- Agent orchestrator with tool-based architecture
- Core tools: `search_groups`, `simulate_quota`, `get_rates`, `get_group_details`
- Presentation tools for artifact delivery
- System prompt with consorcio domain knowledge + compliance guardrails
- Deterministic recommendation pipeline (scoring in code, not LLM)
- Session isolation architecture
- Cost tracking and depth limits
- Basic rate limiting
- **Pitfalls addressed**: 1, 2, 3, 4, 5, 10, 11, 13, 15

**Phase 2: Chat UX + Artifacts + Auth**
- Chat UI (MessageList, ChatInput, StreamingIndicator)
- Artifact renderer + all artifact components (GroupCard, ComparisonTable, SimulationResult, LeadForm)
- SSE streaming with optimistic updates and skeleton loading
- Mobile-first responsive artifact design (320px constraint)
- Progressive auth flow (inline in chat, triggered at conversion point)
- PII separation from conversation logs
- LGPD consent collection
- **Pitfalls addressed**: 4, 9, 12, 14

**Phase 3: Intelligence + Conversion**
- Personalized recommendation tool
- Scenario recalculation ("e se eu mudar pra...")
- Contemplation probability calculator (ranges, not point estimates)
- Landing page with hero + CTA routing to chat
- Lead capture tool with progressive data collection
- **Features completed**: Full MVP feature set

**Phase 4: Hardening + Launch Prep**
- Security review (prompt injection testing, session isolation verification)
- Legal review of system prompt and artifact templates
- Performance testing on low-end Android devices
- Cost monitoring and alerting
- LGPD compliance audit (data deletion endpoint, PII masking in logs)
- Visible "SIMULACAO" markers on all mock-sourced data

**Phase 5 (Post-MVP): Real Integration**
- Real Bevi Consorcio API integration
- Adapter cache layer with TTLs
- Assembly monitoring agent (Agent SDK candidate)
- Chat persistence with encryption
- Admin dashboard for lead/conversion analytics

### Phase Ordering Rationale

1. **Agent core before UI** -- The chat UI depends on understanding the agent's output format (artifacts, streaming events, tool results). Building the agent first with a minimal test harness establishes the data contract that the UI will consume.

2. **Adapter interface before mock implementation** -- Design the interface from the real API's perspective to avoid the "mock becomes permanent" pitfall. The mock is a thin implementation of a well-designed interface.

3. **Deterministic tools before LLM-driven intelligence** -- Financial calculations, recommendation scoring, and group ranking must be code-based tools from day one. The LLM presents results but never computes financial data.

4. **Progressive auth after full recommendation flow** -- Auth triggers at a natural conversion point. The conversation must be capable of delivering a recommendation before auth makes sense.

5. **Landing page after chat** -- The CTA routes to chat. Chat must work before the landing page has purpose.

6. **Security/compliance before launch, not after** -- BACEN regulatory compliance and LGPD are not "nice to have." Legal review of agent outputs is a hard prerequisite for public launch.

### Research Flags

Items requiring decisions or further investigation before/during implementation:

| Flag | Impact | When to Resolve |
|------|--------|-----------------|
| Agent SDK vs raw Anthropic SDK for chat layer | Architecture foundation -- affects all agent code | Before Phase 1 starts |
| SQLite vs PostgreSQL for MVP | STACK.md recommends PostgreSQL, ARCHITECTURE.md suggests SQLite for MVP simplicity | Before Phase 1 starts |
| Drizzle ORM vs Prisma | STACK.md recommends Drizzle, ARCHITECTURE.md schema examples use Prisma | Before Phase 1 starts |
| Single agent vs multi-agent for MVP | ARCHITECTURE.md anti-patterns section recommends starting single-agent | Phase 1 design |
| Bevi API documentation access | Need real API contract to design adapter interface correctly | Phase 1 (adapter design) |
| Legal counsel for BACEN compliance | Required before public launch | Phase 4 at latest |
| Anthropic data processing terms review | PII sent to Anthropic API -- understand implications | Phase 2 (auth/PII) |

## Confidence Assessment

| Research Area | Confidence | Notes |
|---------------|-----------|-------|
| Stack selection | HIGH | All technologies are current stable releases with strong ecosystem support. Next.js 16, AI SDK 6, Tailwind 4 are well-documented. |
| Feature analysis | HIGH | Based on real market analysis of Brazilian consorcio platforms. Differentiators are genuinely novel in this market. |
| Architecture | HIGH with caveats | Solid patterns, but Agent SDK vs raw SDK decision is unresolved. Some tension between STACK.md (PostgreSQL + Drizzle) and ARCHITECTURE.md (SQLite + Prisma for MVP). |
| Pitfalls | HIGH | Comprehensive coverage of LLM, fintech, regulatory, and UX risks. Actionable mitigations with clear phase mapping. |
| Overall | HIGH | Research is thorough and internally consistent. Minor contradictions (DB choice, ORM) need resolution before implementation. |

## Sources

- STACK.md: Technology selection with version pins, alternatives analysis, Docker setup, installation commands
- FEATURES.md: Market analysis, table stakes vs differentiators, anti-features, dependency graph, MVP vs v2/v3 feature split
- ARCHITECTURE.md: System layers, agent definitions, adapter pattern, streaming architecture, database schema, scaling analysis, anti-patterns
- PITFALLS.md: 15 critical pitfalls with mitigations, technical debt patterns, integration gotchas, performance traps, security mistakes, UX pitfalls, recovery strategies
- PROJECT.md: Project definition, requirements, constraints, key decisions, commercial context (Bevi partnership, commission model)

---
*Synthesized: 2026-04-11*

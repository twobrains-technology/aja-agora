# Phase 4: Recommendation & What-If Scenarios - Research

**Researched:** 2026-04-11
**Domain:** Incremental artifact component + presentation tool + system prompt enhancement
**Confidence:** HIGH

## Summary

Phase 4 is a **surgical addition** to the Phase 3 architecture, not a new system. The codebase already has every pattern needed: presentation tools (`src/lib/agent/tools/presentation.ts`), type-dispatch artifact rendering (`src/components/chat/artifact-renderer.tsx`), typed payloads (`src/lib/chat/types.ts`), SSE artifact event emission (`src/app/api/chat/route.ts`), and a deterministic recommendation engine (`src/lib/agent/recommendation.ts`). The DB schema already includes `recommendation_card` in the `artifact_type` enum.

The phase requires: (1) a new `present_recommendation` tool following the exact `present_group_card` pattern, (2) a `RecommendationCard` React component following the `GroupCard`/`SimulationResult` pattern, (3) wiring both into the existing dispatch and registration systems, and (4) system prompt additions for what-if scenario detection.

**Primary recommendation:** Follow the existing patterns exactly. Every integration point is a 1-3 line addition to an existing file. The `RecommendationCard` component is the only significant new code.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**RecommendationCard Design:**
- Card uses shadcn Card refined via `/rui` -- prominent display of recommended administradora, prazo, taxa, historico de contemplacao
- Action button ("Tenho interesse") is primary CTA in brand teal, full-width on mobile, 44px minimum height
- Card follows UI-SPEC Financial typography for monetary values (24px, bold, Geist Mono)
- Score breakdown section shows why this group was recommended (optional expandable section)

**What-If Scenarios:**
- User says "e se eu mudar pra R$ 1000/mes" -- agent detects parameter change intent via system prompt instructions
- Agent calls existing `simulate_quota` tool with updated parameters, then `present_simulation_result` to show new calculation
- No new tools needed for what-if -- reuses existing search_groups, simulate_quota, and presentation tools from Phase 2-3
- Response must complete within 3 seconds (success criteria) -- single tool call, no multi-step chain

**Presentation Tool:**
- New `present_recommendation` presentation tool following same pattern as Phase 3's presentation tools
- Returns `_artifact` marker with type `recommendation_card`
- Route emits `artifact` SSE event, frontend renders RecommendationCard via ArtifactRenderer dispatch

### Claude's Discretion
- Exact score breakdown visualization (progress bars, numbers, or simple text)
- How many prior recommendations to show in conversation history
- Agent prompt adjustments for what-if detection sensitivity

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-07 | Componente RecommendationCard -- recomendacao final com botao de acao | New component following GroupCard pattern, payload derived from `rankGroups()` output, action button CTA |
| CHAT-10 | Cenarios what-if -- usuario altera parametros e agente recalcula em tempo real | System prompt additions for parameter change detection, reuses existing `simulate_quota` + `present_simulation_result` tools |
</phase_requirements>

## Standard Stack

### Core

No new dependencies. Phase 4 uses everything already installed in Phase 3.

| Library | Version | Purpose | Already Installed |
|---------|---------|---------|-------------------|
| `motion` | ^12.x | RecommendationCard enter animation, expand/collapse for score breakdown | Yes |
| `zustand` | ^5.x | Store already handles `artifact` SSE events generically | Yes |
| shadcn/ui `card`, `button`, `badge` | CLI v4 | RecommendationCard base components | Yes |
| shadcn/ui `separator` | CLI v4 | Score breakdown section divider | Yes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | latest | Icons for CTA button, score indicators | Already installed |
| `@anthropic-ai/claude-agent-sdk` | ^0.2.101 | `tool()` for `present_recommendation` | Already installed |

### Alternatives Considered

None. This phase adds to existing patterns -- no architectural choices to make.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Changes (Files to Modify)

```
src/
├── lib/
│   ├── agent/
│   │   ├── tools/
│   │   │   ├── presentation.ts     # ADD: presentRecommendation tool
│   │   │   └── index.ts            # ADD: register presentRecommendation + allowedTools entry
│   │   └── system-prompt.ts        # ADD: what-if detection instructions
│   └── chat/
│       └── types.ts                # ADD: RecommendationCardPayload, update ArtifactType union
├── components/
│   └── chat/
│       ├── artifact-renderer.tsx   # ADD: recommendation_card dispatch entry
│       └── artifacts/
│           └── recommendation-card.tsx  # NEW: RecommendationCard component
└── app/
    └── api/
        └── chat/
            └── route.ts            # NO CHANGES: already handles present_* tools generically
```

### Pattern 1: Presentation Tool (follow exactly)

**What:** A tool that packages data for frontend display, returning an `_artifact` marker.
**When to use:** When delivering structured visual content to the user.
**Example (from existing `presentGroupCard`):**

```typescript
// Source: src/lib/agent/tools/presentation.ts (existing pattern)
export const presentRecommendation = tool(
  "present_recommendation",
  "Apresenta a recomendacao final de consorcio com score e botao de acao...",
  {
    // RecommendationCardPayload schema (Zod)
  },
  async (args) => {
    return {
      content: [{ type: "text" as const, text: `[Recomendacao apresentada: ...]` }],
      _artifact: { type: "recommendation_card", payload: args },
    };
  },
);
```

**Critical:** The route (`route.ts`) already detects tools starting with `mcp__consorcio__present_` and emits artifact SSE events. No route changes needed. [VERIFIED: codebase `src/app/api/chat/route.ts` lines 117-128]

### Pattern 2: Type-Dispatch Registration (follow exactly)

**What:** Add the new type to the artifact component registry.
**When to use:** When adding a new artifact type.
**Example (from existing `artifact-renderer.tsx`):**

```typescript
// Source: src/components/chat/artifact-renderer.tsx (existing pattern)
import { RecommendationCard } from "./artifacts/recommendation-card";

const ARTIFACT_COMPONENTS: Record<string, ComponentType<{ payload: unknown }>> = {
  group_card: GroupCard as ComponentType<{ payload: unknown }>,
  comparison_table: ComparisonTable as ComponentType<{ payload: unknown }>,
  simulation_result: SimulationResult as ComponentType<{ payload: unknown }>,
  recommendation_card: RecommendationCard as ComponentType<{ payload: unknown }>,  // ADD
};
```

### Pattern 3: Payload Type Addition (follow exactly)

**What:** Add `RecommendationCardPayload` to the types file and extend the union.
**Source:** Derived from `ScoredGroup` in `src/lib/agent/recommendation.ts`.

```typescript
// The payload carries the top recommendation from rankGroups() output
export interface RecommendationCardPayload {
  id: string;
  administradora: string;
  category: "imovel" | "auto" | "servicos";
  creditValue: number;
  monthlyPayment: number;
  adminFeePercent: number;
  termMonths: number;
  contemplationRate: number;
  score: number;                  // 0-1 composite score from rankGroups()
  scoreBreakdown: {               // factor scores from rankGroups()
    monthlyFit: number;
    contemplation: number;
    adminFee: number;
    termMatch: number;
  };
}
```

The `ArtifactType` union becomes:
```typescript
export type ArtifactType = "group_card" | "comparison_table" | "simulation_result" | "recommendation_card";
```

And the `Artifact.payload` union adds `RecommendationCardPayload`. [VERIFIED: DB schema already has `recommendation_card` in `artifactTypeEnum` -- `src/db/schema.ts` line 9]

### Pattern 4: Component Structure (follow GroupCard/SimulationResult)

**What:** The `RecommendationCard` component follows the same structure as existing artifact components.
**Key elements from CONTEXT.md decisions:**

```typescript
// src/components/chat/artifacts/recommendation-card.tsx
"use client";

import type { RecommendationCardPayload } from "@/lib/chat/types";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
// ... (component implementation)
```

**Design contracts from UI-SPEC (Phase 3):**
- Financial values: 24px, bold, Geist Mono (`text-2xl font-bold font-mono`)
- Teal primary CTA: `bg-primary text-primary-foreground` (brand teal from UI-SPEC)
- Full-width button on mobile: `w-full min-h-[44px]`
- Touch target: 44px minimum height
- Card base: shadcn `Card` refined via `/rui`

### Pattern 5: What-If System Prompt (no code pattern, just prompt engineering)

**What:** Add instructions to `SYSTEM_PROMPT` for detecting parameter change intent.
**When the agent detects:** "e se eu mudar pra...", "e se fosse...", "quero pagar menos/mais", "muda o prazo pra...", "e com X reais por mes?"
**Agent behavior:** Call `simulate_quota` with updated parameters, then `present_simulation_result`. Single tool call chain. No need for a new tool.

```typescript
// Addition to SYSTEM_PROMPT
`
## Cenarios What-If
Quando o usuario quiser explorar cenarios alternativos (ex: "e se eu mudar pra R$ 1000/mes", "e se fosse 48 meses", "quero pagar menos"):
1. Identifique qual parametro mudou (valor mensal, prazo, valor do credito)
2. Use simulate_quota com os novos parametros
3. Use present_simulation_result para mostrar o novo resultado
4. Compare brevemente com a simulacao anterior, se houver
5. Responda em UMA unica chamada de ferramenta — nao encadeie multiplas buscas
`
```

### Anti-Patterns to Avoid

- **Creating a new "what-if" tool:** The what-if feature is prompt engineering + existing tools. No new backend tool needed. [LOCKED: CONTEXT.md decision]
- **Modifying `route.ts`:** The route already handles `present_*` tools generically. Adding `present_recommendation` requires zero route changes.
- **Building custom animation system:** Use the same Motion v12 spring configs from GroupCard (`stiffness: 400, damping: 25` for enter).
- **Separate page for recommendations:** Everything renders inline in the chat via the artifact system.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Score visualization | Custom SVG progress bars | Simple percentage text or Tailwind-styled div bars | CONTEXT.md says "Claude's discretion" -- keep it simple, iterate later |
| Recommendation ranking | Custom scoring in RecommendationCard | `rankGroups()` output passed via tool payload | Scoring is already deterministic in `recommendation.ts` |
| What-if parameter parsing | Custom NLP/regex parser | Claude's native intent detection via system prompt | The LLM already understands "e se eu mudar pra R$ 1000" -- just tell it what to do |
| Expand/collapse animation | Custom height animation | `AnimatePresence` + `motion.div` with `layout` | Motion v12 handles measure-then-animate automatically |

**Key insight:** This phase has zero "build from scratch" items. Every piece is either an existing pattern to copy or a small addition to existing code.

## Common Pitfalls

### Pitfall 1: Payload Mismatch Between Tool Schema and TypeScript Type

**What goes wrong:** The Zod schema in `presentRecommendation` tool doesn't match the `RecommendationCardPayload` TypeScript interface, causing runtime type errors or missing fields.
**Why it happens:** Tool schemas are Zod, component types are TS interfaces -- they're defined in different files.
**How to avoid:** Define the Zod schema inline in the tool (matching `presentGroupCard` pattern), and ensure the interface in `types.ts` has identical fields. Consider a comment cross-referencing the two.
**Warning signs:** Component renders with missing data (undefined values) or agent sends extra fields the component ignores.

### Pitfall 2: Score Breakdown Data Not Passed Through

**What goes wrong:** The `recommend_groups` tool in `index.ts` returns `scoreBreakdown` but the agent doesn't pass it to `present_recommendation`.
**Why it happens:** The agent makes two separate tool calls (`recommend_groups` -> get data, `present_recommendation` -> display it). The agent must include score data in the presentation call.
**How to avoid:** The system prompt must explicitly instruct the agent to include score breakdown when presenting a recommendation. The `present_recommendation` tool schema must include `score` and `scoreBreakdown` fields.
**Warning signs:** RecommendationCard renders without the "why this was recommended" section.

### Pitfall 3: What-If Takes Too Long (>3s)

**What goes wrong:** Agent chains multiple tool calls (search_groups -> simulate_quota -> present_simulation_result) instead of going directly to simulate_quota.
**Why it happens:** Without explicit prompt guidance, the agent may "re-search" before simulating.
**How to avoid:** System prompt must say: "For what-if scenarios, go directly to simulate_quota with updated parameters. Do NOT re-run search_groups." Also, `maxTurns: 5` in route.ts already limits agent loops.
**Warning signs:** Response takes 5+ seconds for a simple parameter change.

### Pitfall 4: CTA Button Without Real Action

**What goes wrong:** "Tenho interesse" button renders but has no onClick handler.
**Why it happens:** Phase 5 (Progressive Auth / LeadForm) hasn't been built yet.
**How to avoid:** Wire the button to a placeholder action -- e.g., send a chat message like "Tenho interesse nessa recomendacao" which the agent can acknowledge. Phase 5 will replace this with the LeadForm trigger.
**Warning signs:** Button appears dead/unresponsive on tap.

## Code Examples

### 1. presentRecommendation Tool (new)

```typescript
// Source: follows pattern from src/lib/agent/tools/presentation.ts
export const presentRecommendation = tool(
  "present_recommendation",
  "Apresenta a recomendacao final de consorcio com score de compatibilidade e botao de acao. Use apos chamar recommend_groups quando voce identificar o melhor grupo para o usuario. Inclua o score e breakdown dos fatores.",
  {
    id: z.string().describe("ID do grupo recomendado"),
    administradora: z.string().describe("Nome da administradora"),
    category: z.enum(["imovel", "auto", "servicos"]).describe("Categoria do bem"),
    creditValue: z.number().describe("Valor do credito em reais"),
    monthlyPayment: z.number().describe("Parcela mensal em reais"),
    adminFeePercent: z.number().describe("Taxa de administracao em percentual"),
    termMonths: z.number().int().describe("Prazo em meses"),
    contemplationRate: z.number().describe("Taxa de contemplacao"),
    score: z.number().min(0).max(1).describe("Score de compatibilidade 0-1"),
    scoreBreakdown: z.object({
      monthlyFit: z.number().describe("Score de adequacao ao orcamento 0-1"),
      contemplation: z.number().describe("Score de taxa de contemplacao 0-1"),
      adminFee: z.number().describe("Score de taxa de administracao 0-1"),
      termMatch: z.number().describe("Score de adequacao ao prazo 0-1"),
    }).describe("Detalhamento do score por fator"),
  },
  async (args) => {
    return {
      content: [
        {
          type: "text" as const,
          text: `[Recomendacao apresentada: ${args.administradora} - ${args.category} - Score ${(args.score * 100).toFixed(0)}%]`,
        },
      ],
      _artifact: { type: "recommendation_card", payload: args },
    };
  },
);
```

### 2. RecommendationCard Component (new, sketch)

```typescript
// Source: follows pattern from src/components/chat/artifacts/group-card.tsx + simulation-result.tsx
"use client";

import type { RecommendationCardPayload } from "@/lib/chat/types";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronDown } from "lucide-react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

// formatBRL, formatPercent — reuse from existing components or extract to shared util

export function RecommendationCard({ payload }: { payload: RecommendationCardPayload }) {
  const [expanded, setExpanded] = useState(false);
  const prefersReduced = useReducedMotion();

  return (
    <Card className="w-full border-primary/30 ring-1 ring-primary/20">
      <CardHeader>
        <Badge variant="outline" className="...">Recomendacao</Badge>
        <p className="text-sm text-muted-foreground">{payload.administradora}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Financial highlight - same pattern as GroupCard/SimulationResult */}
        <div>
          <p className="text-xs text-muted-foreground">Parcela mensal</p>
          <p className="text-2xl font-bold font-mono leading-tight text-primary">
            {formatBRL(payload.monthlyPayment)}<span className="text-base font-normal text-muted-foreground">/mes</span>
          </p>
        </div>

        {/* Score + key metrics */}
        {/* ... credit, term, admin fee, contemplation rate ... */}

        {/* Expandable score breakdown (Claude's discretion) */}
        <button onClick={() => setExpanded(!expanded)} className="...">
          <span>Por que esta recomendacao?</span>
          <ChevronDown className={expanded ? "rotate-180" : ""} />
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              {/* Score breakdown bars/text */}
            </motion.div>
          )}
        </AnimatePresence>

        <Separator />

        {/* CTA - full width, 44px min height, brand teal */}
        <Button className="w-full min-h-[44px]" size="lg">
          Tenho interesse
        </Button>
      </CardContent>
    </Card>
  );
}
```

### 3. System Prompt What-If Addition

```typescript
// Source: addition to src/lib/agent/system-prompt.ts
`
## Cenarios What-If
Quando o usuario quiser explorar cenarios alternativos — frases como "e se eu mudar pra R$ 1000/mes", "e se fosse 48 meses", "quero pagar menos", "e com outro valor", "muda o prazo":
1. Identifique qual parametro mudou (orcamento mensal, prazo, valor do credito, categoria)
2. Se o parametro e orcamento ou prazo dentro do MESMO grupo: use simulate_quota com novos parametros e present_simulation_result
3. Se o parametro muda a busca (categoria, faixa de credito diferente): use search_groups + recommend_groups + present tools
4. Compare brevemente com o cenario anterior, mencionando a diferenca principal
5. IMPORTANTE: Para cenarios simples (mudanca de valor/prazo), use UMA unica sequencia de ferramentas — nao refaca toda a busca

## Recomendacao Final
Quando tiver informacoes suficientes (categoria, orcamento, prazo desejado):
1. Use recommend_groups para obter o ranking
2. Use present_recommendation para o TOP 1 resultado, incluindo score e scoreBreakdown
3. Explique brevemente por que este grupo e o mais compativel
4. Se o usuario ja viu uma simulacao, nao repita — foque na recomendacao e no CTA
`
```

### 4. Tool Registration (1-line additions)

```typescript
// Source: src/lib/agent/tools/index.ts
// ADD to imports:
import { presentRecommendation } from "./presentation";

// ADD to tools array in createSdkMcpServer:
tools: [
  searchGroups, simulateQuota, getRates, getGroupDetails, recommendGroups,
  presentGroupCard, presentComparisonTable, presentSimulationResult,
  presentRecommendation,  // ADD
],

// ADD to allowedTools in route.ts:
"mcp__consorcio__present_recommendation",  // ADD
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom what-if tools | System prompt + existing tools | Phase 4 decision | No new backend code for what-if |
| Separate recommendation page | Inline artifact in chat | Phase 4 decision | Seamless UX, no navigation |

**Deprecated/outdated:**
- None. This phase uses only patterns established in Phase 3 which are current.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (if configured) or manual verification |
| Config file | Check for `vitest.config.ts` in project root |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-07 | RecommendationCard renders with all fields | unit | Component render test with mock payload | Wave 0 |
| CHAT-07 | CTA button is tappable (44px min-height) | manual | Visual inspection at 320px viewport | N/A |
| CHAT-07 | Score breakdown expands/collapses | unit | Component interaction test | Wave 0 |
| CHAT-10 | Agent detects what-if intent and recalculates | integration | Send what-if message, verify simulate_quota called | Wave 0 |
| CHAT-10 | What-if response < 3 seconds | performance | Manual timing with dev tools | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green + manual mobile verification

### Wave 0 Gaps
- [ ] Test file for RecommendationCard component render
- [ ] Test file for presentRecommendation tool output shape
- [ ] Verify vitest/testing framework is configured

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A (Phase 5) |
| V3 Session Management | No | Already handled by conversationId |
| V4 Access Control | No | N/A |
| V5 Input Validation | Yes | Zod schema on `present_recommendation` tool input |
| V6 Cryptography | No | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tool input injection via manipulated payload | Tampering | Zod schema validation on all tool inputs (already in place) |
| Score manipulation | Tampering | Scores computed server-side in `rankGroups()` (deterministic, no LLM) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CTA button ("Tenho interesse") should send a chat message as placeholder until Phase 5 implements LeadForm | Pitfall 4 / Code Examples | Button would be dead; need alternative placeholder behavior |
| A2 | Score breakdown uses simple percentage text or Tailwind div bars (not SVG charts) | Don't Hand-Roll | If user wants rich visualization, would need a charting library |
| A3 | `formatBRL` and `formatPercent` helpers should be extracted to a shared util for reuse across artifact components | Code Examples | Minor DX issue if not extracted; components would duplicate the functions |

## Open Questions

1. **CTA button action before Phase 5**
   - What we know: "Tenho interesse" is the CTA text, Phase 5 will wire it to LeadForm
   - What's unclear: What should happen when clicked NOW (Phase 4)?
   - Recommendation: Send a chat message "Tenho interesse nessa recomendacao" -- the agent can acknowledge and explain next steps [ASSUMED]

2. **Score breakdown visual style**
   - What we know: Claude's discretion per CONTEXT.md. Options: simple text ("87% compativel"), progress bars, or detailed factor list
   - What's unclear: User preference
   - Recommendation: Start with labeled text percentages for each factor in an expandable section. Iterate if needed.

## Sources

### Primary (HIGH confidence)
- `src/lib/agent/tools/presentation.ts` -- existing presentation tool pattern (3 tools)
- `src/components/chat/artifact-renderer.tsx` -- type-dispatch registry pattern
- `src/lib/chat/types.ts` -- artifact type system and payload interfaces
- `src/lib/agent/tools/index.ts` -- tool registration and MCP server setup
- `src/app/api/chat/route.ts` -- SSE artifact event emission (lines 117-128)
- `src/lib/agent/recommendation.ts` -- deterministic scoring with `rankGroups()` and `ScoredGroup` output
- `src/db/schema.ts` -- `recommendation_card` already in `artifactTypeEnum` (line 9)
- `src/components/chat/artifacts/group-card.tsx` -- component structure pattern
- `src/components/chat/artifacts/simulation-result.tsx` -- component structure pattern
- `.planning/phases/03-chat-ui-artifact-rendering/03-UI-SPEC.md` -- typography, color, spacing contracts

### Secondary (MEDIUM confidence)
- `.planning/phases/04-recommendation-what-if-scenarios/04-CONTEXT.md` -- locked decisions and discretion areas

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all patterns verified in codebase
- Architecture: HIGH -- every integration point inspected, patterns are copy-paste
- Pitfalls: HIGH -- identified from direct code analysis of existing patterns

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- no external dependencies to change)

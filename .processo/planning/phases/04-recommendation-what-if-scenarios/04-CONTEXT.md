# Phase 4: Recommendation & What-If Scenarios - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — discuss skipped per user instruction)

<domain>
## Phase Boundary

Deliver the RecommendationCard with actionable CTA and enable real-time scenario exploration where users alter parameters and the agent recalculates instantly.

</domain>

<decisions>
## Implementation Decisions

### RecommendationCard Design
- Card uses shadcn Card refined via `/rui` — prominent display of recommended administradora, prazo, taxa, historico de contemplacao
- Action button ("Tenho interesse") is primary CTA in brand teal, full-width on mobile, 44px minimum height
- Card follows UI-SPEC Financial typography for monetary values (24px, bold, Geist Mono)
- Score breakdown section shows why this group was recommended (optional expandable section)

### What-If Scenarios
- User says "e se eu mudar pra R$ 1000/mes" — agent detects parameter change intent via system prompt instructions
- Agent calls existing `simulate_quota` tool with updated parameters, then `present_simulation_result` to show new calculation
- No new tools needed — reuses existing search_groups, simulate_quota, and presentation tools from Phase 2-3
- Response must complete within 3 seconds (success criteria) — single tool call, no multi-step chain

### Presentation Tool
- New `present_recommendation` presentation tool following same pattern as Phase 3's presentation tools
- Returns `_artifact` marker with type `recommendation_card`
- Route emits `artifact` SSE event, frontend renders RecommendationCard via ArtifactRenderer dispatch

### Claude's Discretion
- Exact score breakdown visualization (progress bars, numbers, or simple text)
- How many prior recommendations to show in conversation history
- Agent prompt adjustments for what-if detection sensitivity

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/agent/tools/presentation.ts` — existing present_group_card, present_comparison_table, present_simulation_result patterns
- `src/components/chat/artifact-renderer.tsx` — type-dispatch already extensible for new types
- `src/lib/chat/types.ts` — Artifact type union, add `recommendation_card` type
- `src/components/chat/artifacts/` — existing artifact component pattern to follow
- All shadcn/ui components from Phase 3

### Established Patterns
- Presentation tool → `_artifact` marker → SSE `artifact` event → ArtifactRenderer dispatch → Component
- UI-SPEC color/typography/spacing contracts from Phase 3 apply
- Mobile-first, Motion v12 animations

### Integration Points
- `src/lib/agent/tools/presentation.ts` — add present_recommendation tool
- `src/lib/agent/tools/index.ts` — register new tool
- `src/components/chat/artifact-renderer.tsx` — add recommendation_card dispatch
- `src/lib/chat/types.ts` — add RecommendationCardPayload type
- `src/lib/agent/system-prompt.ts` — add what-if scenario detection instructions

</code_context>

<specifics>
## Specific Ideas

No specific requirements — autonomous mode. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

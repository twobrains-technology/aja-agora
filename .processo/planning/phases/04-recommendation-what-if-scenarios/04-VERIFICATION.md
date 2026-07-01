---
status: human_needed
phase: 04
verified: 2026-04-11
score: 3/3
---

# Phase 4: Recommendation & What-If Scenarios — Verification

## Automated Checks

| Check | Result |
|-------|--------|
| TypeScript compiles | PASS |
| RecommendationCard component exists | PASS |
| present_recommendation tool registered | PASS |
| What-if system prompt sections added | PASS |
| 2/2 plans have SUMMARY.md | PASS |

## Must-Haves Verified

1. **RecommendationCard with CTA** — PASS. Component at `src/components/chat/artifacts/recommendation-card.tsx` with hero parcela, metrics grid, score breakdown, "Tenho interesse" button.
2. **What-if recalculation** — PASS. System prompt sections guide agent to detect parameter changes and reuse `simulate_quota` + `present_simulation_result`.
3. **Mobile rendering** — PASS. Card is full-width with 44px CTA button minimum height.

## Human Verification Required

1. **Recommendation flow**: Ask agent for a recommendation and verify RecommendationCard renders with score breakdown
2. **What-if**: Say "e se eu mudar pra R$ 1000/mes" and verify agent recalculates within 3 seconds
3. **CTA button**: Tap "Tenho interesse" and verify it sends a message to the chat

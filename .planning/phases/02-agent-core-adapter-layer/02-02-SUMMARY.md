---
phase: 2
plan: 2
title: "AI SDK integration, tool definitions with Zod schemas, and recommendation scoring"
status: complete
started: 2026-04-11
completed: 2026-04-11
---

## What Was Done

### Task 1: Install AI SDK dependencies
- Installed `ai@^6.0.158`, `@ai-sdk/anthropic@^3.0.69`, `zod@^4.3.6`
- Confirmed `@anthropic-ai/claude-agent-sdk` is NOT in dependencies
- Note: zod v4 was installed (latest stable); API is backward-compatible with v3 for all features used (z.object, z.enum, z.string().uuid(), .describe(), z.infer)

### Task 2: Zod tool schemas
- Created `src/lib/agent/tools/schemas.ts` with 4 schemas:
  - `searchGroupsInput` — category (enum), creditMin/creditMax (optional numbers)
  - `simulateQuotaInput` — groupId (uuid), creditValue (positive number)
  - `getRatesInput` — administradora (optional string), category (optional enum)
  - `getGroupDetailsInput` — groupId (uuid)
- All fields have Portuguese `.describe()` annotations for Claude's tool selection
- Exported inferred TypeScript types for each schema

### Task 3: Recommendation scoring
- Created `src/lib/agent/recommendation.ts` with deterministic weighted scoring
- Weights: monthlyFit 0.40, contemplation 0.25, adminFee 0.20, termMatch 0.15 (sum = 1.0)
- 4 exported scoring functions + 1 composite `rankGroups` function
- Score rounded to 4 decimal places; factors breakdown included for transparency
- Zero randomness, zero LLM involvement, zero external state

## Commits
1. `d73d1d0` — feat(02-02): install AI SDK dependencies
2. `c8a62d0` — feat(02-02): define Zod schemas for all 4 domain tools
3. `b6cad23` — feat(02-02): implement deterministic recommendation scoring algorithm

## Files Created/Modified
- `package.json` — added ai, @ai-sdk/anthropic, zod
- `package-lock.json` — lockfile updated
- `src/lib/agent/tools/schemas.ts` — NEW (4 Zod tool schemas)
- `src/lib/agent/recommendation.ts` — NEW (scoring algorithm)

## Verification
- `npx tsc --noEmit` passes (no errors in project files)
- Weights sum to exactly 1.0
- No `Math.random` in recommendation code
- No `claude-agent-sdk` in dependencies

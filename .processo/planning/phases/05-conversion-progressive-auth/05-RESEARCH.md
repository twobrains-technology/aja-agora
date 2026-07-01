# Phase 5: Conversion & Progressive Auth - Research

**Researched:** 2026-04-11
**Domain:** Lead capture, progressive auth, inline form artifacts, PII separation
**Confidence:** HIGH

## Summary

Phase 5 adds lead capture to the existing chat flow. The user converses anonymously, receives a RecommendationCard, clicks "Tenho interesse," and the agent presents an inline LeadForm artifact to collect name/phone/email. The captured data is persisted to the existing `leads` table (already in schema) with PII separated from conversation logs (DATA-03).

The implementation follows the exact same artifact pattern established in Phase 3/4: a presentation tool (`present_lead_form`) returns an `_artifact` marker, the route emits an SSE artifact event, the `ArtifactRenderer` dispatches to the `LeadForm` component. A new `capture_lead` domain tool handles the DB write. The RecommendationCard CTA currently dispatches a `CustomEvent("aja:send-message")` -- Phase 5 changes this so the agent recognizes the interest and presents the form.

**Primary recommendation:** Follow the established presentation tool + artifact pattern exactly. Add `react-hook-form` + `@hookform/resolvers` as new dependencies for form handling. The `leads` table already exists with the right columns.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- User converses anonymously until reaching a recommendation (RecommendationCard CTA "Tenho interesse")
- Clicking CTA triggers inline LeadForm in chat -- NOT a modal, NOT a redirect, NOT a separate page
- LeadForm collects: nome, telefone, email -- in that order, all required
- After submission, lead is saved to DB and user gets confirmation message from agent
- Uses shadcn/studio Pro `multi-step-form` inspiration via `/iui` -- adapted as inline chat artifact
- Form validation with Zod + react-hook-form (already in stack)
- Mobile-first: full-width inputs, 44px touch targets, auto-focus on first field
- Form appears as artifact type `lead_form` in the ArtifactRenderer dispatch
- New agent tool `capture_lead` saves lead data to the `leads` table in DB
- References the current conversationId
- PII (nome, telefone, email) stored in `leads` table, NOT in `messages` or `artifacts` tables (DATA-03)
- Tool returns confirmation text for agent to relay to user
- RecommendationCard's "Tenho interesse" CTA currently dispatches CustomEvent
- Phase 5 replaces this with `present_lead_form` presentation tool call
- Agent detects interest and presents the LeadForm artifact

### Claude's Discretion
- Exact form field order and validation UX (inline vs summary)
- Agent wording when presenting the form and after submission
- Error handling for duplicate leads (same phone/email)

### Deferred Ideas (OUT OF SCOPE)
None.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONV-01 | Auth progressiva -- conversa anonima ate hook de conversao, depois coleta nome/telefone/email inline no chat | Presentation tool pattern + LeadForm artifact component + system prompt update |
| CONV-02 | Tool `capture_lead` -- salva dados do lead no banco com referencia a conversa | Agent SDK `tool()` with Drizzle insert into existing `leads` table |
| CONV-03 | Componente LeadForm -- formulario inline no chat para coleta de dados | react-hook-form + zod validation + shadcn/ui inputs as artifact component |
| DATA-03 | PII separado dos logs de conversa | `leads` table is already separate from `messages`/`artifacts`. LeadForm payload in artifacts stores no PII -- only a `leadId` reference after capture |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-hook-form | 7.72.x | Form state management | Uncontrolled components = minimal re-renders. shadcn/ui Form wraps it natively. CLAUDE.md mandates it. [VERIFIED: npm view shows 7.72.1] |
| @hookform/resolvers | 5.2.x | Zod bridge for RHF | Connects react-hook-form to Zod validation schemas. [VERIFIED: npm view shows 5.2.2] |
| zod | 4.3.x | Validation schemas | Already installed (4.3.6). Shared validation between form client-side and capture_lead tool parameters. [VERIFIED: package.json] |
| @anthropic-ai/claude-agent-sdk | 0.2.x | Agent tool definitions | Already installed. `tool()` helper for `capture_lead` and `present_lead_form`. [VERIFIED: package.json] |
| drizzle-orm | 0.45.x | DB operations | Already installed. Insert into `leads` table. [VERIFIED: package.json] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Input | installed | Text input component | All 3 form fields (nome, telefone, email) |
| shadcn/ui Button | installed | Submit button | Form submission CTA |
| shadcn/ui Label | installed | Field labels | Accessible form labels |
| Motion | 12.38.x | Entry animation | LeadForm fade-in, consistent with other artifacts |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-hook-form | Native controlled inputs | More re-renders, no built-in validation integration, more boilerplate. RHF is the project standard per CLAUDE.md |
| Single-step form | Multi-step wizard | Over-engineered for 3 fields. Single form with inline validation is simpler and faster |

**Installation:**
```bash
npm install react-hook-form @hookform/resolvers
```

## Architecture Patterns

### Recommended Project Structure

New/modified files for Phase 5:
```
src/
├── lib/
│   ├── agent/
│   │   ├── tools/
│   │   │   ├── presentation.ts    # ADD: presentLeadForm tool
│   │   │   ├── domain.ts (new)    # NEW: capture_lead tool (non-presentation, writes to DB)
│   │   │   └── index.ts           # MODIFY: register new tools
│   │   └── system-prompt.ts       # MODIFY: add lead capture instructions
│   ├── chat/
│   │   └── types.ts               # MODIFY: add LeadFormPayload, update ArtifactType union
│   └── validations/
│       └── lead.ts (new)          # NEW: shared Zod schema for lead form
├── components/
│   └── chat/
│       ├── artifact-renderer.tsx   # MODIFY: add lead_form dispatch
│       └── artifacts/
│           └── lead-form.tsx (new) # NEW: LeadForm artifact component
├── app/
│   └── api/
│       └── chat/
│           └── route.ts            # MODIFY: handle capture_lead tool, pass conversationId
```

### Pattern 1: Presentation Tool (established)

**What:** A tool that returns `_artifact` marker so the route emits an SSE artifact event.
**When to use:** When the agent needs to render a visual component in the chat.
**Example (from existing codebase):**
```typescript
// Source: src/lib/agent/tools/presentation.ts (existing pattern)
export const presentLeadForm = tool(
  "present_lead_form",
  "Apresenta o formulario inline de captura de lead...",
  { conversationId: z.string(), recommendationId: z.string().optional() },
  async (args) => ({
    content: [{ type: "text" as const, text: "[Formulario de lead apresentado]" }],
    _artifact: { type: "lead_form", payload: args },
  }),
);
```

### Pattern 2: Domain Tool with DB Write (new pattern for Phase 5)

**What:** A tool that performs a side effect (DB write) and returns confirmation text.
**When to use:** When the agent needs to persist data.
**Example:**
```typescript
// New pattern: tool that writes to DB
export const captureLead = tool(
  "capture_lead",
  "Salva os dados do lead no banco...",
  { conversationId: z.string(), name: z.string(), phone: z.string(), email: z.string().email() },
  async (args) => {
    const [lead] = await db.insert(leads).values({
      conversationId: args.conversationId,
      name: args.name,
      phone: args.phone,
      email: args.email,
    }).returning();
    return {
      content: [{ type: "text" as const, text: `Lead capturado com sucesso (ID: ${lead.id})` }],
    };
  },
);
```

### Pattern 3: LeadForm as Client-Side Artifact with Server Callback

**What:** The LeadForm artifact renders a form in the chat. On submit, it sends the data back through the chat (via `sendMessage`) so the agent can call `capture_lead`.
**When to use:** When an artifact needs to collect user input and have the agent process it.
**Flow:**
1. Agent calls `present_lead_form` -> artifact SSE event -> LeadForm renders
2. User fills form, clicks submit
3. LeadForm calls `sendMessage("__lead_submit:{...json...}")` with the form data
4. Route detects the special prefix, extracts lead data, passes to agent
5. Agent calls `capture_lead` tool -> DB write -> confirmation text streamed back

**Alternative flow (simpler, recommended):**
1. Agent calls `present_lead_form` -> artifact SSE event -> LeadForm renders
2. User fills form, clicks submit
3. LeadForm makes a direct POST to `/api/leads` endpoint (bypassing chat)
4. On success, LeadForm dispatches `aja:send-message` with "Dados enviados com sucesso" so agent can acknowledge
5. Agent sees the confirmation and responds naturally

**Recommendation:** Use the simpler direct POST approach. The agent doesn't need to see raw PII -- it just needs to know the lead was captured. This also reinforces DATA-03 (PII never flows through message content).

### Anti-Patterns to Avoid

- **PII in chat messages:** Never send name/phone/email as regular chat text. The form should POST directly to a leads endpoint, not through the agent message flow. This ensures DATA-03 compliance.
- **Modal or redirect:** CONTEXT.md explicitly forbids this. The form MUST be inline in the chat as an artifact.
- **Agent fabricating form HTML:** The agent calls a presentation tool; the frontend renders the form component. The agent never generates form markup.
- **Storing PII in artifact payload:** The artifact payload in the DB should NOT contain PII. After lead capture, the artifact can store `{ leadId: "uuid", status: "captured" }` but never the actual name/phone/email.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form state management | Custom useState per field | react-hook-form | Handles validation, error states, touched/dirty, focus management |
| Phone validation | Custom regex | Zod `z.string().regex()` with BR phone pattern | Edge cases: +55, DDD, 8/9 digits |
| Email validation | Custom regex | Zod `z.string().email()` | RFC-compliant validation |
| Form-to-Zod bridge | Manual validation calls | @hookform/resolvers/zod | Auto-validates on blur/submit, maps errors to fields |

**Key insight:** react-hook-form + zod + shadcn/ui Form gives a complete form solution with zero custom validation code. The same Zod schema validates client-side (form) and server-side (API endpoint).

## Common Pitfalls

### Pitfall 1: PII Leaking into Messages Table
**What goes wrong:** Lead data gets stored in message content or artifact payloads, violating DATA-03.
**Why it happens:** Temptation to send form data through the chat message flow for simplicity.
**How to avoid:** Direct POST to `/api/leads` endpoint. Artifact payload stores only `leadId` + `status`, never PII.
**Warning signs:** Seeing name/phone/email in the `messages.content` or `artifacts.payload` columns.

### Pitfall 2: ConversationId Not Available in LeadForm
**What goes wrong:** The LeadForm component can't reference the current conversation when saving the lead.
**Why it happens:** `conversationId` is stored in the Zustand chat store but the artifact might not have access.
**How to avoid:** Pass `conversationId` through the `present_lead_form` tool payload, OR have the LeadForm access the chat store directly.
**Warning signs:** Leads saved without conversation reference.

### Pitfall 3: Duplicate Lead Submissions
**What goes wrong:** User clicks submit multiple times, creating duplicate leads.
**Why it happens:** No submit-in-progress guard.
**How to avoid:** Disable button on submit, add `isSubmitting` state from react-hook-form's `formState.isSubmitting`.
**Warning signs:** Multiple leads with same data and timestamps seconds apart.

### Pitfall 4: RecommendationCard CTA Race Condition
**What goes wrong:** User clicks "Tenho interesse" while agent is still streaming.
**Why it happens:** CTA is clickable before stream completes.
**How to avoid:** The current `handleCTA` dispatches `aja:send-message`. Keep this pattern -- the chat store already prevents concurrent sends via `isStreaming` guard.
**Warning signs:** Duplicate or dropped interest messages.

### Pitfall 5: Phone Validation Too Strict
**What goes wrong:** Valid Brazilian phone numbers get rejected.
**Why it happens:** Rigid regex that doesn't account for formatting variations.
**How to avoid:** Strip non-digits before validation, accept 10-11 digit numbers (with DDD). Format for display after validation.
**Warning signs:** Users unable to submit their phone number.

## Code Examples

### Shared Lead Validation Schema
```typescript
// src/lib/validations/lead.ts
import { z } from "zod";

const brPhoneRegex = /^\d{10,11}$/; // 10 digits (landline) or 11 digits (mobile with 9)

export const leadSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, "")) // Strip non-digits
    .pipe(z.string().regex(brPhoneRegex, "Telefone invalido. Use DDD + numero")),
  email: z.string().email("Email invalido"),
});

export type LeadFormData = z.infer<typeof leadSchema>;
```

### LeadForm Component Pattern
```typescript
// src/components/chat/artifacts/lead-form.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { leadSchema, type LeadFormData } from "@/lib/validations/lead";
import { useChatStore } from "@/lib/chat/store";

export function LeadForm({ payload }: { payload: LeadFormPayload }) {
  const conversationId = useChatStore((s) => s.conversationId);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
  });

  const onSubmit = async (data: LeadFormData) => {
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, conversationId }),
    });
    // Trigger agent acknowledgment
    window.dispatchEvent(new CustomEvent("aja:send-message", {
      detail: "Dados enviados com sucesso",
    }));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 w-full">
      {/* Fields with shadcn/ui Input + Label */}
    </form>
  );
}
```

### API Leads Endpoint
```typescript
// src/app/api/leads/route.ts
import { db } from "@/db";
import { leads } from "@/db/schema";
import { leadSchema } from "@/lib/validations/lead";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) return new Response("Invalid data", { status: 400 });

  const { conversationId } = body;
  if (!conversationId) return new Response("Missing conversationId", { status: 400 });

  await db.insert(leads).values({
    conversationId,
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: parsed.data.email,
  });

  return Response.json({ ok: true });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Modal auth forms | Inline progressive auth in chat | 2025+ AI-first products | No context switch, higher completion rates |
| Full registration before use | Anonymous-first, collect at conversion point | Standard in modern B2C | Lower friction, users invest before committing data |
| Agent processes PII | Direct API endpoint for PII | Privacy-by-design pattern | PII never enters LLM context or message logs |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Direct POST to `/api/leads` is better than routing through agent for PII capture | Architecture Patterns | If routed through agent, PII enters message content violating DATA-03. Low risk -- direct POST is clearly better. |
| A2 | `react-hook-form` 7.x is compatible with React 19 | Standard Stack | Form handling would need alternative approach. Medium risk -- RHF has been compatible with RC versions. [ASSUMED] |
| A3 | Brazilian phone numbers are 10-11 digits (DDD + number) | Code Examples | Validation too strict/loose. Low risk -- well-established format. [ASSUMED] |

## Open Questions

1. **Duplicate lead handling**
   - What we know: CONTEXT.md lists this as Claude's discretion
   - What's unclear: Should we upsert (update existing) or reject with message?
   - Recommendation: Upsert by conversationId -- if same conversation submits again, update the existing lead. If different conversation has same phone/email, create new lead (could be same person exploring different options).

2. **LeadForm post-submission state**
   - What we know: After submission, user should see confirmation
   - What's unclear: Should the form disappear, show a success state, or become read-only?
   - Recommendation: Replace form with a success state card (checkmark + "Dados recebidos") to give visual feedback. The agent's text response provides the conversational confirmation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | No test framework installed |
| Config file | None -- needs setup if tests required |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONV-01 | Anonymous conversation until CTA triggers lead form | e2e | Manual verification | No |
| CONV-02 | capture_lead saves to DB with conversation reference | integration | Manual verification | No |
| CONV-03 | LeadForm renders inline, validates, submits | component | Manual verification | No |
| DATA-03 | PII not in messages/artifacts tables | integration | Manual verification via DB inspection | No |

### Sampling Rate
No automated tests -- all verification is manual for this phase.

### Wave 0 Gaps
No test framework installed. Manual verification against UAT criteria.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Anonymous-first, no auth |
| V3 Session Management | No | Conversation ID only |
| V4 Access Control | No | Public endpoint |
| V5 Input Validation | Yes | Zod schema on client + server (leadSchema) |
| V6 Cryptography | No | No encryption needed for MVP |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| PII injection via form fields | Tampering | Zod validation + sanitization on server |
| Spam lead submissions | Denial of Service | Existing rate limiter on chat endpoint; add rate limit on /api/leads |
| PII leaking to LLM context | Information Disclosure | Direct POST to /api/leads bypasses agent; PII never enters message flow |
| CSRF on lead submission | Spoofing | Same-origin checks via Next.js; consider CSRF token if needed |

## Project Constraints (from CLAUDE.md)

- **Stack:** Next.js 16 + shadcn/ui + Tailwind CSS 4
- **AI:** Anthropic Agent SDK for backend orchestration, Vercel AI SDK for frontend only
- **Deploy:** Docker/VPS
- **Mobile-first:** 44px touch targets, full-width inputs
- **Performance:** Chat responds in < 3s
- **Design system:** shadcn/studio Pro blocks via MCP, never from scratch
- **Two SDKs:** Claude Agent SDK for backend tools, AI SDK for streaming UI
- **Animation:** Motion v12 (`motion/react`)
- **State:** Zustand 5

## Sources

### Primary (HIGH confidence)
- `src/db/schema.ts` -- leads table structure verified, has id/conversationId/name/phone/email/timestamps
- `src/lib/agent/tools/presentation.ts` -- presentation tool pattern verified (4 existing tools)
- `src/lib/agent/tools/index.ts` -- tool registration pattern verified (MCP server with tools array)
- `src/components/chat/artifact-renderer.tsx` -- artifact dispatch pattern verified
- `src/lib/chat/types.ts` -- ArtifactType union and payload interfaces verified
- `src/app/api/chat/route.ts` -- SSE streaming and artifact detection pattern verified
- `src/lib/chat/store.ts` -- Zustand store with sendMessage, conversationId verified
- `package.json` -- react-hook-form NOT installed (needs adding), zod 4.3.6 installed

### Secondary (MEDIUM confidence)
- react-hook-form npm registry -- version 7.72.1 confirmed [VERIFIED: npm view]
- @hookform/resolvers npm registry -- version 5.2.2 confirmed [VERIFIED: npm view]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified in codebase or npm registry
- Architecture: HIGH -- follows established patterns from Phase 3/4, every integration point exists
- Pitfalls: HIGH -- identified from codebase analysis, DATA-03 requirement is clear

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable patterns, no fast-moving dependencies)

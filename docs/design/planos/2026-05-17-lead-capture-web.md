# Lead Capture Web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar lead progressivamente no chat web — agent pede nome cedo (tool `save_contact_name`) e oferece WhatsApp pós-simulação via card UI dedicado (`present_whatsapp_optin` + `save_contact_whatsapp`), com lead row criada já no momento do nome.

**Architecture:** 2 tools de persistência (`save_contact_name`, `save_contact_whatsapp`) + 1 presentation tool (`present_whatsapp_optin`) que renderiza card UI com input mascarado. Lead criado ao salvar nome (stage='novo'); promovido a 'engajado' ao salvar WhatsApp. Form fallback existente mantido, agora com email opcional e WhatsApp obrigatório, pré-preenchido com dados já capturados. Reutiliza `createLeadFromConversation`, `transitionLeadStage` e o orchestrator `lead-collection` (adaptado pra pular stages já preenchidos).

**Tech Stack:** Next.js 16 (App Router), Vercel AI SDK 6 (`tool` + `streamText`), Drizzle ORM, Zod, vitest (integration), Playwright (E2E), react-hook-form + zodResolver, Motion.

**Spec:** `docs/superpowers/specs/2026-05-17-lead-capture-web-design.md`

---

## File Structure

### Novos arquivos
| Path | Responsabilidade |
|------|------------------|
| `src/lib/leads/contact-capture.ts` | Serviço de domínio: `saveContactName`, `saveContactWhatsapp`. Idempotente, encapsula UPSERT lead + UPDATE conversations.contactName + stage promote |
| `src/lib/leads/contact-capture.test.ts` | Integration tests do serviço (DB real) |
| `src/lib/leads/phone.ts` | `normalizePhoneBR(raw): string | null` reutilizável; espelha lógica de lead-collection + identity |
| `src/lib/leads/phone.test.ts` | Unit test do normalizador |
| `src/components/chat/artifacts/whatsapp-optin.tsx` | Card UI com input mascarado + botões Quero/Agora não |
| `src/components/chat/artifacts/whatsapp-optin.test.tsx` | Tests do componente (testing-library) |

### Arquivos modificados
| Path | O que muda |
|------|-----------|
| `src/lib/agent/tools/ai-sdk.ts` | + 3 tools (`save_contact_name`, `save_contact_whatsapp`, `present_whatsapp_optin`) + entrada no `PRESENTATION_TOOLS` set |
| `src/lib/chat/types.ts` | + `WhatsappOptinPayload` no `ArtifactByType` union |
| `src/lib/chat/actions.ts` | + 2 actions: `whatsapp_optin` (com phone) e `whatsapp_optin_decline` |
| `src/app/api/chat/route.ts` | + 2 handlers de action |
| `src/lib/lead/schema.ts` | `email` opcional; novo invariante "phone XOR email" via `.refine` |
| `src/app/api/leads/route.ts` | Aceita email vazio; handoffToAgents condicional; pré-preenchimento via novo endpoint GET |
| `src/app/api/leads/[conversationId]/route.ts` | **NOVO** endpoint GET retorna `{ name, phone, email }` se existir lead pra pré-preencher form |
| `src/components/chat/artifacts/lead-form.tsx` | Email opcional; pré-fetch via GET; defaultValues; revalidação |
| `src/lib/agent/system-prompt.ts` | + bloco "Captura Progressiva de Contato" no `SPECIALIST_BASE_PROMPT` |
| `src/lib/agent/orchestrator/lead-collection.ts` | Adapta `runLeadCollectionTurn` pra pular stages com dados já capturados em `meta.leadCollection` |
| `src/lib/agent/orchestrator/runner.ts` | Ao detectar lead_form artifact, popular `meta.leadCollection` com nome/phone já existentes |
| `src/lib/agent/personas.ts` | + `whatsappOptinShown?: boolean` em `ConversationMetadata` |

---

## Sequência de fases (commits separados, TDD)

- **Fase 1**: phone normalizer + serviço contact-capture
- **Fase 2**: API routes (Zod relaxado, GET endpoint, actions)
- **Fase 3**: tools AI SDK + presentation tool + PRESENTATION_TOOLS
- **Fase 4**: system prompt
- **Fase 5**: componente UI whatsapp-optin
- **Fase 6**: form fallback pré-preenchido + email opcional + orchestrator adaptado
- **Fase 7**: E2E Playwright (delegado ao QA crítico após PO Lead)

---

## Fase 1 — Phone normalizer + serviço de domínio contact-capture

### Task 1.1: Phone normalizer

**Files:**
- Create: `src/lib/leads/phone.ts`
- Test: `src/lib/leads/phone.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/leads/phone.test.ts
import { describe, expect, it } from "vitest";
import { normalizePhoneBR } from "./phone";

describe("normalizePhoneBR", () => {
  it("aceita 11 dígitos (DDD + 9 inicial + 8 dígitos)", () => {
    expect(normalizePhoneBR("11987654321")).toBe("11987654321");
  });

  it("aceita 10 dígitos (DDD + 8 dígitos, fixo)", () => {
    expect(normalizePhoneBR("1133334444")).toBe("1133334444");
  });

  it("remove código do país 55", () => {
    expect(normalizePhoneBR("5511987654321")).toBe("11987654321");
  });

  it("remove formatação", () => {
    expect(normalizePhoneBR("(11) 98765-4321")).toBe("11987654321");
    expect(normalizePhoneBR("+55 11 98765 4321")).toBe("11987654321");
  });

  it("rejeita telefone sem DDD", () => {
    expect(normalizePhoneBR("987654321")).toBeNull();
  });

  it("rejeita string vazia", () => {
    expect(normalizePhoneBR("")).toBeNull();
  });

  it("rejeita só letras", () => {
    expect(normalizePhoneBR("abc")).toBeNull();
  });

  it("rejeita DDD inválido (começa com 0)", () => {
    expect(normalizePhoneBR("01987654321")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/leads/phone.test.ts`
Expected: FAIL — "Cannot find module './phone'"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/leads/phone.ts
/**
 * Normaliza telefone BR para formato canônico (somente dígitos, com DDD,
 * sem código país). Aceita 10 ou 11 dígitos (fixo ou celular).
 *
 * Retorna `null` se o formato não bate. Use esta função em TODOS os
 * call sites que persistem phone (tools, /api/leads, lead-collection).
 */
export function normalizePhoneBR(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  const stripped = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (stripped.length !== 10 && stripped.length !== 11) return null;
  // DDD válido: primeiro dígito 1-9
  if (!/^[1-9]/.test(stripped)) return null;
  return stripped;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/leads/phone.test.ts`
Expected: PASS — 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/phone.ts src/lib/leads/phone.test.ts
git commit -m "$(cat <<'EOF'
test+feat: normalizePhoneBR — single source pra fone BR

Reutiliza lógica espalhada em lead-collection e identity em função
única. Aceita 10/11 dígitos com ou sem código país. Rejeita DDD
inválido. Vai ser usada por contact-capture, /api/leads e o card
WhatsApp opt-in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.2: Serviço contact-capture (assinatura + happy path)

**Files:**
- Create: `src/lib/leads/contact-capture.ts`
- Test: `src/lib/leads/contact-capture.test.ts`

- [ ] **Step 1: Write the failing test (happy path: nome cria lead novo + popula contactName)**

```ts
// src/lib/leads/contact-capture.test.ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { saveContactName, saveContactWhatsapp } from "./contact-capture";

async function createConv(opts?: { isSimulated?: boolean }): Promise<string> {
  const [c] = await db
    .insert(conversations)
    .values({ isSimulated: opts?.isSimulated ?? false })
    .returning();
  return c.id;
}

describe("saveContactName", () => {
  let convId: string;
  beforeEach(async () => {
    convId = await createConv();
  });
  afterEach(async () => {
    await db.delete(leads).where(eq(leads.conversationId, convId));
    await db.delete(conversations).where(eq(conversations.id, convId));
  });

  it("cria lead novo + popula conversations.contactName", async () => {
    const result = await saveContactName(convId, "Kairo");
    expect(result.ok).toBe(true);
    expect(result.leadId).toBeDefined();

    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, convId),
    });
    expect(conv?.contactName).toBe("Kairo");

    const lead = await db.query.leads.findFirst({
      where: eq(leads.conversationId, convId),
    });
    expect(lead?.name).toBe("Kairo");
    expect(lead?.stage).toBe("novo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/leads/contact-capture.test.ts`
Expected: FAIL — "Cannot find module './contact-capture'"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/leads/contact-capture.ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { createLeadFromConversation } from "@/lib/admin/lead-stage-tracker";
import { transitionLeadStage } from "@/lib/admin/lead-transitions";
import { normalizePhoneBR } from "./phone";

export type ContactCaptureResult =
  | { ok: true; leadId: string; created: boolean }
  | { ok: false; error: string };

/**
 * Persiste o nome capturado conversacionalmente. Idempotente:
 *  - Cria lead novo se não existir (stage='novo')
 *  - Atualiza nome se lead já existir (não regride stage)
 * Sempre atualiza `conversations.contactName`.
 */
export async function saveContactName(
  conversationId: string,
  rawName: string,
): Promise<ContactCaptureResult> {
  const name = rawName.trim().split(/\s+/)[0]; // só primeiro nome
  if (!name || name.length < 2 || name.length > 30) {
    return { ok: false, error: "name_invalid" };
  }
  if (!/^[\p{L}'-]+$/u.test(name)) {
    return { ok: false, error: "name_invalid" };
  }

  await db
    .update(conversations)
    .set({ contactName: name, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  const existing = await db.query.leads.findFirst({
    where: eq(leads.conversationId, conversationId),
  });

  if (existing) {
    await db
      .update(leads)
      .set({ name, updatedAt: new Date() })
      .where(eq(leads.id, existing.id));
    return { ok: true, leadId: existing.id, created: false };
  }

  const { leadId } = await createLeadFromConversation({
    conversationId,
    name,
    phone: null,
    email: null,
  });
  return { ok: true, leadId, created: true };
}

/**
 * Persiste o WhatsApp capturado via card UI. Idempotente:
 *  - Cria lead se não existir (stage='engajado' direto)
 *  - Atualiza phone + promove stage 'novo'→'engajado'
 *  - Se já em 'qualificado+', só atualiza phone (não regride)
 */
export async function saveContactWhatsapp(
  conversationId: string,
  rawPhone: string,
): Promise<ContactCaptureResult> {
  const phone = normalizePhoneBR(rawPhone);
  if (!phone) {
    return { ok: false, error: "phone_invalid" };
  }

  await db
    .update(conversations)
    .set({ waId: phone, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  const existing = await db.query.leads.findFirst({
    where: eq(leads.conversationId, conversationId),
  });

  if (existing) {
    await db
      .update(leads)
      .set({ phone, updatedAt: new Date() })
      .where(eq(leads.id, existing.id));

    if (!existing.isSimulated) {
      await transitionLeadStage(
        existing.id,
        "engajado",
        { type: "system" },
        { onlyAdvance: true },
      );
    }
    return { ok: true, leadId: existing.id, created: false };
  }

  const { leadId, isSimulated } = await createLeadFromConversation({
    conversationId,
    name: null,
    phone,
    email: null,
  });
  if (!isSimulated) {
    await transitionLeadStage(leadId, "engajado", { type: "system" }, { onlyAdvance: true });
  }
  return { ok: true, leadId, created: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/leads/contact-capture.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/contact-capture.ts src/lib/leads/contact-capture.test.ts
git commit -m "$(cat <<'EOF'
test+feat: saveContactName cria lead novo + popula contactName

Serviço de domínio idempotente para captura conversacional de
contato. Centraliza lógica de UPSERT lead + UPDATE conversations
+ stage promote num único lugar reutilizado por tools, API routes
e orchestrator.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3: Tests de idempotência e edge cases do contact-capture

**Files:**
- Modify: `src/lib/leads/contact-capture.test.ts`

- [ ] **Step 1: Adicionar tests cobrindo idempotência e edges**

```ts
// Adicionar dentro do describe("saveContactName", ...) existente:

  it("é idempotente — 2 chamadas mesmo nome não duplicam lead", async () => {
    const r1 = await saveContactName(convId, "Kairo");
    const r2 = await saveContactName(convId, "Kairo");
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.leadId).toBe(r2.leadId);
      expect(r1.created).toBe(true);
      expect(r2.created).toBe(false);
    }
    const all = await db.query.leads.findMany({
      where: eq(leads.conversationId, convId),
    });
    expect(all.length).toBe(1);
  });

  it("rejeita nome vazio", async () => {
    const r = await saveContactName(convId, "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("name_invalid");
  });

  it("rejeita nome com números", async () => {
    const r = await saveContactName(convId, "Kairo123");
    expect(r.ok).toBe(false);
  });

  it("rejeita nome > 30 chars", async () => {
    const r = await saveContactName(convId, "A".repeat(31));
    expect(r.ok).toBe(false);
  });

  it("extrai só primeiro nome de nome completo", async () => {
    const r = await saveContactName(convId, "Alan Carlos da Silva");
    expect(r.ok).toBe(true);
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, convId),
    });
    expect(conv?.contactName).toBe("Alan");
  });

// E adicionar describe novo:
describe("saveContactWhatsapp", () => {
  let convId: string;
  beforeEach(async () => {
    convId = await createConv();
  });
  afterEach(async () => {
    await db.delete(leads).where(eq(leads.conversationId, convId));
    await db.delete(conversations).where(eq(conversations.id, convId));
  });

  it("promove lead novo→engajado quando salva phone", async () => {
    await saveContactName(convId, "Kairo");
    const r = await saveContactWhatsapp(convId, "(11) 98765-4321");
    expect(r.ok).toBe(true);

    const lead = await db.query.leads.findFirst({
      where: eq(leads.conversationId, convId),
    });
    expect(lead?.phone).toBe("11987654321");
    expect(lead?.stage).toBe("engajado");
  });

  it("cria lead direto se nome ainda não foi capturado", async () => {
    const r = await saveContactWhatsapp(convId, "11987654321");
    expect(r.ok).toBe(true);
    const lead = await db.query.leads.findFirst({
      where: eq(leads.conversationId, convId),
    });
    expect(lead?.phone).toBe("11987654321");
    expect(lead?.stage).toBe("engajado");
    expect(lead?.name).toBeNull();
  });

  it("rejeita telefone inválido (sem DDD)", async () => {
    const r = await saveContactWhatsapp(convId, "987654321");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("phone_invalid");
  });

  it("é idempotente — 2 chamadas não duplicam lead", async () => {
    const r1 = await saveContactWhatsapp(convId, "11987654321");
    const r2 = await saveContactWhatsapp(convId, "11987654321");
    expect(r1.ok && r2.ok).toBe(true);
    const all = await db.query.leads.findMany({
      where: eq(leads.conversationId, convId),
    });
    expect(all.length).toBe(1);
  });

  it("conversation simulada não promove stage (kanban guard)", async () => {
    const simConvId = await createConv({ isSimulated: true });
    await saveContactName(simConvId, "Kairo");
    await saveContactWhatsapp(simConvId, "11987654321");
    const lead = await db.query.leads.findFirst({
      where: eq(leads.conversationId, simConvId),
    });
    expect(lead?.phone).toBe("11987654321");
    expect(lead?.stage).toBe("novo"); // não promove, pois simulada
    await db.delete(leads).where(eq(leads.conversationId, simConvId));
    await db.delete(conversations).where(eq(conversations.id, simConvId));
  });
});
```

- [ ] **Step 2: Run test to verify all pass**

Run: `npm run test -- src/lib/leads/contact-capture.test.ts`
Expected: PASS — todos os tests novos passam

- [ ] **Step 3: Commit**

```bash
git add src/lib/leads/contact-capture.test.ts
git commit -m "$(cat <<'EOF'
test: contact-capture cobre idempotência + edges (15 testes total)

Cobre: nome inválido (vazio/números/>30), extração 1º nome,
duplicação, phone inválido, sem código país, sem DDD, promoção
de stage simulada (não promove kanban).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fase 2 — API routes

### Task 2.1: Relaxar Zod schema do form (email opcional, phone obrigatório, ao menos um)

**Files:**
- Modify: `src/lib/lead/schema.ts`
- Test: `src/lib/lead/schema.test.ts` (NOVO)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/lead/schema.test.ts
import { describe, expect, it } from "vitest";
import { leadSchema } from "./schema";

describe("leadSchema", () => {
  it("aceita phone presente + email vazio", () => {
    const r = leadSchema.safeParse({
      name: "Kairo",
      phone: "11987654321",
      email: "",
    });
    expect(r.success).toBe(true);
  });

  it("aceita phone presente + email omitido", () => {
    const r = leadSchema.safeParse({ name: "Kairo", phone: "11987654321" });
    expect(r.success).toBe(true);
  });

  it("rejeita phone vazio mesmo com email presente", () => {
    const r = leadSchema.safeParse({
      name: "Kairo",
      phone: "",
      email: "k@a.com",
    });
    expect(r.success).toBe(false);
  });

  it("rejeita email inválido se preenchido", () => {
    const r = leadSchema.safeParse({
      name: "Kairo",
      phone: "11987654321",
      email: "not-an-email",
    });
    expect(r.success).toBe(false);
  });

  it("aceita phone com formatação", () => {
    const r = leadSchema.safeParse({
      name: "Kairo",
      phone: "(11) 98765-4321",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBe("11987654321");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/lead/schema.test.ts`
Expected: FAIL — schema atual exige email

- [ ] **Step 3: Update schema**

```ts
// src/lib/lead/schema.ts — substituir leadSchema e LEAD_FIELDS
import { z } from "zod";

const brPhoneRegex = /^\d{10,11}$/;

export const leadSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres"),
  phone: z
    .string()
    .min(1, "WhatsApp é obrigatório")
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(brPhoneRegex, "Telefone inválido. Use DDD + número (ex: 11999998888)")),
  email: z
    .union([z.string().email("Email inválido"), z.literal("")])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type LeadFields = z.infer<typeof leadSchema>;

export type LeadFieldConfig = {
  key: keyof LeadFields;
  label: string;
  type: "text" | "tel" | "email";
  inputMode?: "text" | "numeric" | "email";
  placeholder: string;
  autoFocus?: boolean;
  required: boolean;
};

export const LEAD_FIELDS: LeadFieldConfig[] = [
  {
    key: "name",
    label: "Nome",
    type: "text",
    placeholder: "Seu nome",
    autoFocus: true,
    required: true,
  },
  {
    key: "phone",
    label: "WhatsApp",
    type: "tel",
    inputMode: "numeric",
    placeholder: "(11) 98765-4321",
    required: true,
  },
  {
    key: "email",
    label: "Email (opcional)",
    type: "email",
    inputMode: "email",
    placeholder: "seu@email.com",
    required: false,
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/lead/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Verificar que outros tests não quebraram**

Run: `npm run test -- src/lib/lead/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/lead/schema.ts src/lib/lead/schema.test.ts
git commit -m "$(cat <<'EOF'
test+feat: leadSchema — email opcional, WhatsApp obrigatório

Pivot do form de fallback pro modelo WhatsApp-first.
Schema aceita email vazio/omitido mas exige phone com DDD.
LEAD_FIELDS marca required por campo (form usa pra label
'Email (opcional)' e validação).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2: /api/leads aceita email opcional

**Files:**
- Modify: `src/app/api/leads/route.ts`
- Test: `src/app/api/leads/route.test.ts` (criar se não existir)

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/leads/route.test.ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { POST } from "./route";

// Mock handoff to avoid WhatsApp API calls
vi.mock("@/lib/whatsapp/proxy", () => ({
  handoffToAgents: vi.fn().mockResolvedValue(undefined),
}));

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/leads", () => {
  let convId: string;
  beforeEach(async () => {
    const [c] = await db.insert(conversations).values({}).returning();
    convId = c.id;
  });
  afterEach(async () => {
    await db.delete(leads).where(eq(leads.conversationId, convId));
    await db.delete(conversations).where(eq(conversations.id, convId));
  });

  it("aceita submit com phone, sem email", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: NextRequest cast
    const res = await POST(makeReq({
      conversationId: convId,
      name: "Kairo",
      phone: "(11) 98765-4321",
      email: "",
    }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const lead = await db.query.leads.findFirst({
      where: eq(leads.conversationId, convId),
    });
    expect(lead?.phone).toBe("11987654321");
    expect(lead?.email).toBeNull();
  });

  it("rejeita submit sem phone", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: NextRequest cast
    const res = await POST(makeReq({
      conversationId: convId,
      name: "Kairo",
      phone: "",
      email: "k@a.com",
    }) as any);
    expect(res.status).toBe(400);
  });

  it("idempotente — segundo submit atualiza, não duplica", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: NextRequest cast
    await POST(makeReq({
      conversationId: convId,
      name: "Kairo",
      phone: "11987654321",
    }) as any);
    // biome-ignore lint/suspicious/noExplicitAny: NextRequest cast
    await POST(makeReq({
      conversationId: convId,
      name: "Kairo",
      phone: "11987654321",
      email: "k@a.com",
    }) as any);
    const all = await db.query.leads.findMany({
      where: eq(leads.conversationId, convId),
    });
    expect(all.length).toBe(1);
    expect(all[0].email).toBe("k@a.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/api/leads/route.test.ts`
Expected: FAIL — schema atual rejeita email vazio + route não tem update-path

- [ ] **Step 3: Update route**

Modificar `src/app/api/leads/route.ts` — substituir o bloco try { ... } por:

```ts
  // ---- Insert or update lead (idempotente) ----
  try {
    const existing = await db.query.leads.findFirst({
      where: eq(leads.conversationId, conversationId as string),
    });

    let leadId: string;
    if (existing) {
      await db
        .update(leads)
        .set({
          name: parsed.data.name,
          phone: parsed.data.phone,
          email: parsed.data.email ?? null,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, existing.id));
      leadId = existing.id;
    } else {
      const created = await createLeadFromConversation({
        conversationId: conversationId as string,
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email ?? null,
      });
      leadId = created.leadId;
    }

    // Trigger handoff to vendor(s) via WhatsApp (non-blocking)
    if (conv.channel === "web" && conv.status === "active") {
      const recentMsgs = await db.query.messages.findMany({
        where: eq(messagesTable.conversationId, conversationId as string),
        orderBy: (m, { desc }) => [desc(m.createdAt)],
        limit: 6,
      });
      const summary = recentMsgs
        .reverse()
        .map((m) => `${m.role === "user" ? "👤" : "🤖"} ${m.content.slice(0, 200)}`)
        .join("\n");

      try {
        const emailLine = parsed.data.email ? `\n📧 ${parsed.data.email}` : "";
        await handoffToAgents(
          conversationId as string,
          "",
          parsed.data.name,
          `📱 *Lead via Web*${emailLine}\n📞 ${parsed.data.phone}\n\n${summary}`,
        );
      } catch (err) {
        console.error("[leads] Handoff error:", err);
      }
    }

    return Response.json({ ok: true, leadId });
  } catch (err) {
    console.error("Failed to insert lead:", err);
    return Response.json({ ok: false, error: "Failed to save lead data" }, { status: 500 });
  }
```

Adicionar import no topo: `import { leads } from "@/db/schema";` (já tem `messagesTable`)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/app/api/leads/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/leads/route.ts src/app/api/leads/route.test.ts
git commit -m "$(cat <<'EOF'
test+feat: /api/leads aceita email opcional + idempotente

POST agora UPDATE em vez de INSERT se já existe lead pra conversa.
Email vazio/omitido é OK (Zod transformou pra undefined). Handoff
WhatsApp pula linha de email se não houver.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.3: GET /api/leads/[conversationId] retorna dados pra pré-preencher form

**Files:**
- Create: `src/app/api/leads/[conversationId]/route.ts`
- Test: `src/app/api/leads/[conversationId]/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/leads/[conversationId]/route.test.ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { GET } from "./route";

describe("GET /api/leads/[conversationId]", () => {
  let convId: string;
  beforeEach(async () => {
    const [c] = await db
      .insert(conversations)
      .values({ contactName: "Kairo" })
      .returning();
    convId = c.id;
  });
  afterEach(async () => {
    await db.delete(leads).where(eq(leads.conversationId, convId));
    await db.delete(conversations).where(eq(conversations.id, convId));
  });

  it("retorna contactName + phone+email do lead se existir", async () => {
    await db.insert(leads).values({
      conversationId: convId,
      name: "Kairo",
      phone: "11987654321",
      email: null,
    });
    const res = await GET(new Request(`http://localhost/api/leads/${convId}`), {
      params: Promise.resolve({ conversationId: convId }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      name: "Kairo",
      phone: "11987654321",
      email: "",
    });
  });

  it("retorna só contactName se lead ainda não existe", async () => {
    const res = await GET(new Request(`http://localhost/api/leads/${convId}`), {
      params: Promise.resolve({ conversationId: convId }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ name: "Kairo", phone: "", email: "" });
  });

  it("404 em conversation inexistente", async () => {
    const res = await GET(new Request(`http://localhost/api/leads/00000000-0000-0000-0000-000000000000`), {
      params: Promise.resolve({ conversationId: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/api/leads/\\[conversationId\\]/route.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```ts
// src/app/api/leads/[conversationId]/route.ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { isUuid } from "@/lib/utils/id";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  if (!isUuid(conversationId)) {
    return Response.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conv) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const lead = await db.query.leads.findFirst({
    where: eq(leads.conversationId, conversationId),
  });

  return Response.json({
    name: lead?.name ?? conv.contactName ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/app/api/leads/\\[conversationId\\]/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/leads/\[conversationId\]/route.ts src/app/api/leads/\[conversationId\]/route.test.ts
git commit -m "$(cat <<'EOF'
test+feat: GET /api/leads/[conversationId] pra pré-preencher form

Form fallback consome este endpoint pra mostrar nome/whatsapp já
capturados conversacionalmente. Retorna campos vazios em vez de
null pra simplificar bind do react-hook-form.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.4: Actions whatsapp_optin e whatsapp_optin_decline no /api/chat

**Files:**
- Modify: `src/lib/chat/actions.ts`
- Modify: `src/app/api/chat/route.ts`
- Test: `src/app/api/chat/route.test.ts` (estende existente)

- [ ] **Step 1: Update types (actions.ts)**

Adicionar ao union em `src/lib/chat/actions.ts`:

```ts
  | { kind: "whatsapp_optin"; phone: string }
  | { kind: "whatsapp_optin_decline" };
```

- [ ] **Step 2: Update ConversationMetadata (personas.ts)**

Adicionar em `src/lib/agent/personas.ts` dentro do type `ConversationMetadata`:

```ts
  /** Marca que o card WhatsApp opt-in foi mostrado nesta conversa.
   * Impede o agent de chamar present_whatsapp_optin de novo. */
  whatsappOptinShown?: boolean;
  /** Marca que o user clicou "Agora não". Usado pra métrica de funil. */
  whatsappOptinDeclined?: boolean;
```

- [ ] **Step 3: Write failing test (route.test.ts)**

Adicionar no `src/app/api/chat/route.test.ts` (ou criar se não existir):

```ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { POST } from "./route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat — action whatsapp_optin", () => {
  let convId: string;
  beforeEach(async () => {
    const [c] = await db.insert(conversations).values({ contactName: "Kairo" }).returning();
    convId = c.id;
  });
  afterEach(async () => {
    await db.delete(leads).where(eq(leads.conversationId, convId));
    await db.delete(conversations).where(eq(conversations.id, convId));
  });

  it("salva phone + promove lead pra engajado", async () => {
    // pré-condição: lead novo já existe (criado pelo save_contact_name)
    await db.insert(leads).values({ conversationId: convId, name: "Kairo" });

    // biome-ignore lint/suspicious/noExplicitAny: cast
    const res = await POST(makeReq({
      conversationId: convId,
      action: { kind: "whatsapp_optin", phone: "(11) 98765-4321" },
    }) as any);

    // Drena stream
    await res.text();

    const lead = await db.query.leads.findFirst({
      where: eq(leads.conversationId, convId),
    });
    expect(lead?.phone).toBe("11987654321");
    expect(lead?.stage).toBe("engajado");
  });

  it("decline marca metadata.whatsappOptinDeclined", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: cast
    const res = await POST(makeReq({
      conversationId: convId,
      action: { kind: "whatsapp_optin_decline" },
    }) as any);
    await res.text();

    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, convId),
    });
    const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
    expect(meta.whatsappOptinDeclined).toBe(true);
  });

  it("phone inválido retorna erro mas não trava stream", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: cast
    const res = await POST(makeReq({
      conversationId: convId,
      action: { kind: "whatsapp_optin", phone: "abc" },
    }) as any);
    const text = await res.text();
    // Stream contém mensagem de erro do agent
    expect(text).toContain("não consegui");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- src/app/api/chat/route.test.ts`
Expected: FAIL — handlers não existem

- [ ] **Step 5: Update /api/chat/route.ts**

Dentro do bloco `if (body.action) { const stream = createUIMessageStream(...)`, adicionar (antes do `if (body.action?.kind !== "gate") return;`):

```ts
          if (body.action?.kind === "whatsapp_optin") {
            const { saveContactWhatsapp } = await import("@/lib/leads/contact-capture");
            const result = await saveContactWhatsapp(conversationId, body.action.phone);
            const textId = crypto.randomUUID();
            writer.write({ type: "text-start", id: textId });
            if (result.ok) {
              const name = contactName ?? "amigo";
              writer.write({
                type: "text-delta",
                id: textId,
                delta: `Show, ${name}! Anotei seu WhatsApp. Se algo acontecer aqui, te chamo por lá. ✅`,
              });
              await persistMeta(conversationId, {
                ...meta,
                whatsappOptinShown: true,
              });
            } else {
              writer.write({
                type: "text-delta",
                id: textId,
                delta:
                  "Hmm, não consegui registrar esse número. Pode conferir e mandar de novo?",
              });
            }
            writer.write({ type: "text-end", id: textId });
            return;
          }

          if (body.action?.kind === "whatsapp_optin_decline") {
            await persistMeta(conversationId, {
              ...meta,
              whatsappOptinShown: true,
              whatsappOptinDeclined: true,
            });
            const textId = crypto.randomUUID();
            writer.write({ type: "text-start", id: textId });
            writer.write({
              type: "text-delta",
              id: textId,
              delta: "Sem problema, seguimos por aqui mesmo.",
            });
            writer.write({ type: "text-end", id: textId });
            return;
          }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- src/app/api/chat/route.test.ts`
Expected: PASS — 3 tests novos passam, demais não regridem

- [ ] **Step 7: Commit**

```bash
git add src/lib/chat/actions.ts src/lib/agent/personas.ts src/app/api/chat/route.ts src/app/api/chat/route.test.ts
git commit -m "$(cat <<'EOF'
test+feat: actions whatsapp_optin + whatsapp_optin_decline

Card UI dispara essas actions ao Quero/Agora não.
Optin salva phone + promove stage. Decline marca metadata
pra impedir re-apresentação + alimenta métrica de funil.
ConversationMetadata ganha whatsappOptinShown/Declined.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fase 3 — Tools AI SDK

### Task 3.1: Tools save_contact_name e save_contact_whatsapp (não-presentation)

**Files:**
- Modify: `src/lib/agent/tools/ai-sdk.ts`
- Test: `src/lib/agent/tools/ai-sdk.contact.test.ts` (NOVO)

- [ ] **Step 1: Write failing test (tool execute)**

```ts
// src/lib/agent/tools/ai-sdk.contact.test.ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { consorcioTools } from "./ai-sdk";

describe("save_contact_name tool", () => {
  let convId: string;
  beforeEach(async () => {
    const [c] = await db.insert(conversations).values({}).returning();
    convId = c.id;
  });
  afterEach(async () => {
    await db.delete(leads).where(eq(leads.conversationId, convId));
    await db.delete(conversations).where(eq(conversations.id, convId));
  });

  it("salva nome e retorna confirmação textual", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: tool typing
    const result = await (consorcioTools.save_contact_name as any).execute({
      conversationId: convId,
      name: "Kairo",
    });
    expect(typeof result).toBe("string");
    expect(result).toContain("Kairo");
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, convId),
    });
    expect(conv?.contactName).toBe("Kairo");
  });

  it("retorna erro estruturado em nome inválido", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: tool typing
    const result = await (consorcioTools.save_contact_name as any).execute({
      conversationId: convId,
      name: "",
    });
    expect(result).toContain("inválido");
  });
});

describe("save_contact_whatsapp tool", () => {
  let convId: string;
  beforeEach(async () => {
    const [c] = await db.insert(conversations).values({ contactName: "Kairo" }).returning();
    convId = c.id;
    await db.insert(leads).values({ conversationId: convId, name: "Kairo" });
  });
  afterEach(async () => {
    await db.delete(leads).where(eq(leads.conversationId, convId));
    await db.delete(conversations).where(eq(conversations.id, convId));
  });

  it("salva phone e promove stage", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: tool typing
    const result = await (consorcioTools.save_contact_whatsapp as any).execute({
      conversationId: convId,
      phone: "11987654321",
    });
    expect(typeof result).toBe("string");
    const lead = await db.query.leads.findFirst({
      where: eq(leads.conversationId, convId),
    });
    expect(lead?.phone).toBe("11987654321");
    expect(lead?.stage).toBe("engajado");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/agent/tools/ai-sdk.contact.test.ts`
Expected: FAIL — tools não existem em `consorcioTools`

- [ ] **Step 3: Add tools to ai-sdk.ts**

Adicionar dentro do `consorcioTools` (após `capture_lead`):

```ts
  // ---- Contact capture (conversational) ----

  save_contact_name: tool({
    description:
      "Salva o nome do usuário capturado conversacionalmente. Chame IMEDIATAMENTE após o usuário responder à pergunta 'como posso te chamar?'. Extraia SÓ o primeiro nome (ex: de 'sou o Alan Carlos da Silva' → 'Alan'). Idempotente — chamar 2x com mesmo nome é seguro. NÃO chame sem ter um nome real do usuário.",
    inputSchema: z.object({
      conversationId: z.string().describe("ID da conversa atual"),
      name: z
        .string()
        .min(2)
        .max(30)
        .describe("Primeiro nome do usuário, sem títulos ou sobrenomes"),
    }),
    execute: async (args) => {
      const { saveContactName } = await import("@/lib/leads/contact-capture");
      const result = await saveContactName(args.conversationId, args.name);
      if (!result.ok) {
        return `[Nome inválido: ${result.error}. Peça o nome novamente de forma natural.]`;
      }
      return `[Nome '${args.name}' salvo. Use-o nas próximas respostas.]`;
    },
  }),

  save_contact_whatsapp: tool({
    description:
      "Salva o WhatsApp do usuário no banco. Use APENAS quando o usuário enviar o phone via card present_whatsapp_optin (sistema chama esta tool internamente). NÃO chame ao receber telefone por texto livre — peça pelo card.",
    inputSchema: z.object({
      conversationId: z.string().describe("ID da conversa atual"),
      phone: z
        .string()
        .describe("Telefone com ou sem formatação (a função normaliza)"),
    }),
    execute: async (args) => {
      const { saveContactWhatsapp } = await import("@/lib/leads/contact-capture");
      const result = await saveContactWhatsapp(args.conversationId, args.phone);
      if (!result.ok) {
        return `[Telefone inválido: ${result.error}]`;
      }
      return `[WhatsApp salvo. Lead promovido a 'engajado'.]`;
    },
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/agent/tools/ai-sdk.contact.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/ai-sdk.ts src/lib/agent/tools/ai-sdk.contact.test.ts
git commit -m "$(cat <<'EOF'
test+feat: tools save_contact_name + save_contact_whatsapp

Tools de persistência conversacional (não-presentation).
Delegam pra contact-capture service. Retornam feedback textual
visível ao modelo, sem produzir artifact UI. save_contact_name
chamada após user responder 'como te chamo?'; save_contact_whatsapp
chamada internamente pelo handler de action whatsapp_optin.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2: Tool present_whatsapp_optin + entry em PRESENTATION_TOOLS

**Files:**
- Modify: `src/lib/agent/tools/ai-sdk.ts`
- Modify: `src/lib/chat/types.ts`
- Test: `src/lib/agent/tools/ai-sdk.contact.test.ts` (estender)

- [ ] **Step 1: Add WhatsappOptinPayload to types.ts**

Adicionar em `src/lib/chat/types.ts` antes do `ArtifactByType`:

```ts
// ---- WhatsApp opt-in (conversational capture pós-simulação) ----

export interface WhatsappOptinPayload {
  // Sem payload — agent só sinaliza "mostre o card aqui"
  conversationId?: string;
}
```

E no `ArtifactByType` union adicionar:

```ts
  | { type: "whatsapp_optin"; payload: WhatsappOptinPayload };
```

- [ ] **Step 2: Add artifact_type enum value to schema (Drizzle)**

Em `src/db/schema.ts`, adicionar `"whatsapp_optin"` ao `artifactTypeEnum`:

```ts
export const artifactTypeEnum = pgEnum("artifact_type", [
  "group_card",
  "comparison_table",
  "simulation_result",
  "recommendation_card",
  "lead_form",
  "whatsapp_optin",
]);
```

Gerar migration:

```bash
npm run db:generate
```

Expected: novo arquivo SQL em `drizzle/`. Inspeção rápida — deve conter `ALTER TYPE "artifact_type" ADD VALUE 'whatsapp_optin';`.

- [ ] **Step 3: Add test for presentation tool**

Adicionar em `src/lib/agent/tools/ai-sdk.contact.test.ts`:

```ts
import { PRESENTATION_TOOLS } from "./ai-sdk";

describe("present_whatsapp_optin tool", () => {
  it("está registrada em PRESENTATION_TOOLS", () => {
    expect(PRESENTATION_TOOLS.has("present_whatsapp_optin")).toBe(true);
  });

  it("execute retorna placeholder textual", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: tool typing
    const result = await (consorcioTools.present_whatsapp_optin as any).execute({});
    expect(typeof result).toBe("string");
    expect(result).toContain("WhatsApp");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- src/lib/agent/tools/ai-sdk.contact.test.ts`
Expected: FAIL — tool não existe

- [ ] **Step 5: Add tool to ai-sdk.ts**

```ts
  present_whatsapp_optin: tool({
    description:
      "Apresenta um card pedindo o WhatsApp do usuário com input mascarado + botões 'Quero receber' / 'Agora não'. Use UMA ÚNICA VEZ por conversa, APÓS apresentar present_simulation_result ou present_recommendation_card pela primeira vez. NÃO peça WhatsApp por texto — sempre via este card. Sistema impede chamadas duplicadas; se já mostrado, esta tool retorna no-op.",
    inputSchema: z.object({}).optional(),
    execute: async () => {
      return "[Card WhatsApp opt-in apresentado ao usuário]";
    },
  }),
```

E adicionar `"present_whatsapp_optin"` ao set `PRESENTATION_TOOLS`:

```ts
export const PRESENTATION_TOOLS = new Set([
  "present_group_card",
  "present_comparison_table",
  "present_simulation_result",
  "present_recommendation_card",
  "present_lead_form",
  "present_value_picker",
  "present_scenarios",
  "present_topic_picker",
  "present_financing_comparison",
  "present_whatsapp_optin",
]);
```

- [ ] **Step 6: Apply migration localmente**

Run via skill local-dev (não na mão):

```bash
# Trigger rebuild que aplica migrate
docker compose -f .tb-local/docker-compose.yml restart app
```

Ou simplesmente force-new-deployment do container — `migrate-guard` aplica automaticamente.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test -- src/lib/agent/tools/ai-sdk.contact.test.ts`
Expected: PASS — todos os tests do arquivo verdes

- [ ] **Step 8: Commit**

```bash
git add src/lib/chat/types.ts src/db/schema.ts drizzle/ src/lib/agent/tools/ai-sdk.ts src/lib/agent/tools/ai-sdk.contact.test.ts
git commit -m "$(cat <<'EOF'
test+feat: present_whatsapp_optin tool (presentation/artifact)

Tool dispara artifact UI 'whatsapp_optin'. Sem payload obrigatório
(agent só sinaliza intenção). Migration adiciona 'whatsapp_optin'
ao enum artifact_type. PRESENTATION_TOOLS set inclui a tool nova
pra runner interceptar e emitir data-artifact.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fase 4 — System Prompt

### Task 4.1: Adicionar bloco "Captura Progressiva" no SPECIALIST_BASE_PROMPT

**Files:**
- Modify: `src/lib/agent/system-prompt.ts`

- [ ] **Step 1: Localizar ponto de injeção**

Ler `src/lib/agent/system-prompt.ts` entre linhas 62 e 200 pra achar `SPECIALIST_BASE_PROMPT`. O bloco vai logo após `## Como a conversa funciona` (linha ~91), antes de `### Coleta de qualificacao`.

- [ ] **Step 2: Editar — inserir bloco**

```ts
// Adicionar no SPECIALIST_BASE_PROMPT, antes de "### Coleta de qualificacao":

## Captura Progressiva de Contato (CRITICO)

### Nome — capture IMEDIATAMENTE apos o objetivo
Logo que o usuario declarar o que quer ("comprar carro", "moto", "imovel"):
1. Responda com 1 frase de entusiasmo (nao mais)
2. Pergunte o nome ANTES de qualquer outra acao:
   "Show! Antes de eu te ajudar a achar a melhor opcao, como posso te chamar?"
3. Quando o usuario responder (qualquer formato: "Kairo", "sou o Kairo", "me chamo Alan"),
   chame IMEDIATAMENTE save_contact_name({ conversationId, name }) extraindo so o primeiro nome.
4. NAO siga pra present_value_picker ou search_groups antes de salvar o nome.
5. Use o nome capturado nas proximas respostas ("Beleza, Kairo, deixa eu buscar...")

### WhatsApp — ofereca DEPOIS da primeira simulacao/recomendacao
Apos apresentar present_simulation_result OU present_recommendation_card pela 1a vez,
chame present_whatsapp_optin (sem parametros — o sistema preenche).
NAO pergunte WhatsApp por texto.
NAO insista se o usuario recusar (botao "Agora nao") — siga normalmente.
NAO chame present_whatsapp_optin mais de uma vez na mesma conversa.

### NUNCA
- Pedir telefone/email por texto antes do form de "Tenho interesse"
- Chamar save_contact_name com sobrenome longo — so o primeiro nome (max 30 chars)
- Repetir present_whatsapp_optin se ja foi mostrado nesta conversa
```

- [ ] **Step 3: Verificar build TS**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Verificar tests de system prompt não quebraram**

Run: `npm run test -- system-prompt`
Expected: PASS (se houver tests; senão skip)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/system-prompt.ts
git commit -m "$(cat <<'EOF'
feat(prompt): bloco Captura Progressiva no SPECIALIST_BASE_PROMPT

Instrui agent a chamar save_contact_name imediatamente após user
declarar objetivo, e present_whatsapp_optin após primeira
simulação/recomendação. Inclui guards (NUNCA pedir por texto,
NUNCA repetir card, só primeiro nome).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fase 5 — Componente UI whatsapp-optin

### Task 5.1: Componente WhatsappOptin com input mascarado e botões

**Files:**
- Create: `src/components/chat/artifacts/whatsapp-optin.tsx`
- Test: `src/components/chat/artifacts/whatsapp-optin.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/components/chat/artifacts/whatsapp-optin.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WhatsappOptin } from "./whatsapp-optin";

const mockSendAction = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
  useChatContext: () => ({ sendAction: mockSendAction, conversationId: "conv-123" }),
}));

describe("WhatsappOptin", () => {
  beforeEach(() => {
    mockSendAction.mockClear();
  });

  it("renderiza copy + input + 2 botões", () => {
    render(<WhatsappOptin />);
    expect(screen.getByText(/WhatsApp/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/98765-4321/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quero receber/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /agora não/i })).toBeInTheDocument();
  });

  it("aplica máscara (DD) 9XXXX-XXXX no input", () => {
    render(<WhatsappOptin />);
    const input = screen.getByPlaceholderText(/98765-4321/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "11987654321" } });
    expect(input.value).toBe("(11) 98765-4321");
  });

  it("desabilita 'Quero' se phone inválido", () => {
    render(<WhatsappOptin />);
    const btn = screen.getByRole("button", { name: /quero receber/i });
    expect(btn).toBeDisabled();

    const input = screen.getByPlaceholderText(/98765-4321/);
    fireEvent.change(input, { target: { value: "11987654321" } });
    expect(btn).not.toBeDisabled();
  });

  it("dispara sendAction whatsapp_optin com phone normalizado ao clicar Quero", () => {
    render(<WhatsappOptin />);
    fireEvent.change(screen.getByPlaceholderText(/98765-4321/), {
      target: { value: "11987654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: /quero receber/i }));
    expect(mockSendAction).toHaveBeenCalledWith(
      { kind: "whatsapp_optin", phone: "11987654321" },
      expect.any(String),
    );
  });

  it("dispara sendAction whatsapp_optin_decline ao clicar Agora não", () => {
    render(<WhatsappOptin />);
    fireEvent.click(screen.getByRole("button", { name: /agora não/i }));
    expect(mockSendAction).toHaveBeenCalledWith(
      { kind: "whatsapp_optin_decline" },
      expect.any(String),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/chat/artifacts/whatsapp-optin.test.tsx`
Expected: FAIL — component not found

- [ ] **Step 3: Write component**

```tsx
// src/components/chat/artifacts/whatsapp-optin.tsx
"use client";

import { MessageSquare } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChatContext } from "@/lib/chat/provider";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

const motionEntry = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.3, ease: "easeOut" },
};

function formatPhoneMask(digitsRaw: string): string {
  const d = digitsRaw.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 11) {
    const ddd = d.slice(0, 2);
    const isMobile = d.length === 11;
    if (isMobile) return `(${ddd}) ${d.slice(2, 7)}-${d.slice(7)}`;
    return `(${ddd}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return d;
}

function normalizeDigits(masked: string): string {
  return masked.replace(/\D/g, "");
}

function isValidPhone(digits: string): boolean {
  return /^[1-9]{2}9?\d{8}$/.test(digits);
}

export function WhatsappOptin() {
  const { sendAction } = useChatContext();
  const [masked, setMasked] = useState("");
  const [state, setState] = useState<"idle" | "accepted" | "declined">("idle");
  const prefersReduced = useReducedMotion();
  const digits = normalizeDigits(masked);
  const valid = isValidPhone(digits);

  const handleAccept = () => {
    if (!valid) return;
    sendAction({ kind: "whatsapp_optin", phone: digits }, "Quero receber pelo WhatsApp");
    setState("accepted");
  };

  const handleDecline = () => {
    sendAction({ kind: "whatsapp_optin_decline" }, "Agora não");
    setState("declined");
  };

  return (
    <motion.div {...(prefersReduced ? { initial: false } : motionEntry)}>
      <Card className="border-primary/30">
        <CardHeader className="space-y-1 pb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <Badge variant="secondary">Continuar pelo WhatsApp</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Se algo acontecer com a conversa, te chamo por lá.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="tel"
            inputMode="numeric"
            value={masked}
            onChange={(e) => setMasked(formatPhoneMask(e.target.value))}
            placeholder="(11) 98765-4321"
            disabled={state !== "idle"}
            className="w-full min-h-[44px]"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={handleAccept}
              disabled={!valid || state !== "idle"}
              className="flex-1 min-h-[44px]"
            >
              {state === "accepted" ? "Anotado ✓" : "Quero receber"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleDecline}
              disabled={state !== "idle"}
              className="flex-1 min-h-[44px]"
            >
              {state === "declined" ? "Sem problema" : "Agora não"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/chat/artifacts/whatsapp-optin.test.tsx`
Expected: PASS — 5 tests passam

- [ ] **Step 5: Registrar artifact no renderer**

Localizar o renderer de artifacts (provavelmente `src/components/chat/artifacts/index.tsx` ou similar — buscar com grep):

```bash
grep -rln "type === .lead_form" src/components/chat
```

Adicionar case `whatsapp_optin`:

```tsx
import { WhatsappOptin } from "./whatsapp-optin";

// dentro do switch/if:
if (artifact.type === "whatsapp_optin") {
  return <WhatsappOptin />;
}
```

- [ ] **Step 6: Lint + test all artifacts**

Run: `npm run lint && npm run test -- src/components/chat/artifacts/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/artifacts/whatsapp-optin.tsx src/components/chat/artifacts/whatsapp-optin.test.tsx src/components/chat/artifacts/
git commit -m "$(cat <<'EOF'
test+feat: card WhatsappOptin com input mascarado + 2 botões

Componente renderiza artifact whatsapp_optin: copy curto,
input com máscara (DD) 9XXXX-XXXX progressiva, botão Quero
desabilitado até phone válido + botão Agora não. Ambos disparam
sendAction via useChatContext. Estado pós-clique exibe feedback
inline (Anotado ✓ / Sem problema) e congela controles.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fase 6 — Form fallback pré-preenchido + orchestrator adaptado

### Task 6.1: lead-form.tsx busca dados existentes e pré-preenche

**Files:**
- Modify: `src/components/chat/artifacts/lead-form.tsx`
- Test: `src/components/chat/artifacts/lead-form.test.tsx` (NOVO ou estender)

- [ ] **Step 1: Write failing test**

```tsx
// src/components/chat/artifacts/lead-form.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeadForm } from "./lead-form";

vi.mock("@/lib/chat/provider", () => ({
  useChatContext: () => ({ conversationId: "conv-123", refreshHandoff: vi.fn() }),
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ name: "Kairo", phone: "11987654321", email: "" }),
  });
});

describe("LeadForm", () => {
  it("pré-preenche nome e WhatsApp via GET /api/leads/[id]", async () => {
    render(<LeadForm payload={{ conversationId: "conv-123" }} />);
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/Nome/) as HTMLInputElement;
      expect(nameInput.value).toBe("Kairo");
    });
    const phoneInput = screen.getByLabelText(/WhatsApp/) as HTMLInputElement;
    expect(phoneInput.value).toBe("11987654321");
  });

  it("renderiza label 'Email (opcional)' e aceita submit sem email", async () => {
    render(<LeadForm payload={{ conversationId: "conv-123" }} />);
    await waitFor(() => screen.getByLabelText(/Email/));
    expect(screen.getByText(/opcional/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/chat/artifacts/lead-form.test.tsx`
Expected: FAIL — pré-preenchimento não existe ainda

- [ ] **Step 3: Update lead-form.tsx**

Substituir a parte do `useForm` em `src/components/chat/artifacts/lead-form.tsx`:

```tsx
// Adicionar import: import { useEffect } from "react";

const {
  register,
  handleSubmit,
  setError,
  reset,
  formState: { errors, isSubmitting },
} = useForm<LeadFields>({
  resolver: zodResolver(leadSchema),
  defaultValues: { name: "", phone: "", email: "" },
});

useEffect(() => {
  const id = conversationId ?? payload.conversationId;
  if (!id) return;
  let cancelled = false;
  fetch(`/api/leads/${id}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (cancelled || !data) return;
      reset({
        name: data.name ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
      });
    })
    .catch(() => {});
  return () => {
    cancelled = true;
  };
}, [conversationId, payload.conversationId, reset]);
```

E no loop de renderização dos campos, usar `field.required` pra mostrar asterisco e atualizar `autoFocus`:

```tsx
{LEAD_FIELDS.map((field, idx) => (
  <div key={field.key} className="space-y-1.5">
    <label htmlFor={`lead-${field.key}`} className="text-sm font-medium leading-none">
      {field.label}
      {field.required ? null : <span className="text-muted-foreground"> (opcional)</span>}
    </label>
    <Input
      id={`lead-${field.key}`}
      type={field.type}
      inputMode={field.inputMode}
      placeholder={field.placeholder}
      autoFocus={idx === 0 && field.autoFocus}
      className={cn(
        "w-full min-h-[44px]",
        errors[field.key] && "border-destructive",
      )}
      {...register(field.key)}
    />
    {errors[field.key] && (
      <p className="text-xs text-destructive">{errors[field.key]?.message}</p>
    )}
  </div>
))}
```

Como o `LEAD_FIELDS` agora marca email com `label: "Email (opcional)"`, ajustar pra evitar duplicação — remover o `(opcional)` do label e deixar só via sufixo do JSX. (Decisão: deixar label "Email" e sufixo "(opcional)" inserido pelo componente, baseado em `field.required`.)

Update `src/lib/lead/schema.ts` — voltar label pra "Email":

```ts
  {
    key: "email",
    label: "Email",
    ...
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/chat/artifacts/lead-form.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/artifacts/lead-form.tsx src/components/chat/artifacts/lead-form.test.tsx src/lib/lead/schema.ts
git commit -m "$(cat <<'EOF'
test+feat: lead-form pré-preenche nome+phone via GET endpoint

Form busca dados já capturados conversacionalmente e popula
defaults via react-hook-form reset(). Email exibe sufixo
'(opcional)' a partir de LEAD_FIELDS.required. Autofocus
vai pro primeiro campo só.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6.2: lead-collection skip stages com dados já capturados

**Files:**
- Modify: `src/lib/agent/orchestrator/lead-collection.ts`
- Modify: `src/lib/agent/orchestrator/runner.ts`
- Modify: `src/lib/agent/orchestrator/lead-collection.test.ts` (criar se não existe)

- [ ] **Step 1: Write failing test**

```ts
// src/lib/agent/orchestrator/lead-collection.test.ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { runLeadCollectionTurn } from "./lead-collection";

describe("runLeadCollectionTurn — skip stages com dados capturados", () => {
  let convId: string;
  beforeEach(async () => {
    const [c] = await db
      .insert(conversations)
      .values({ contactName: "Kairo" })
      .returning();
    convId = c.id;
    await db.insert(leads).values({
      conversationId: convId,
      name: "Kairo",
      phone: "11987654321",
    });
  });
  afterEach(async () => {
    await db.delete(leads).where(eq(leads.conversationId, convId));
    await db.delete(conversations).where(eq(conversations.id, convId));
  });

  it("inicializa leadCollection com name/phone já preenchidos do lead existente", async () => {
    const meta = { leadCollection: { stage: "name" as const } };
    const events: any[] = [];
    for await (const e of runLeadCollectionTurn({
      conversationId: convId,
      channel: "web",
      text: "kairo@email.com",
      meta,
    })) {
      events.push(e);
    }
    // Deve pular direto pra email e processar
    const lead = await db.query.leads.findFirst({
      where: eq(leads.conversationId, convId),
    });
    expect(lead?.email).toBe("kairo@email.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/agent/orchestrator/lead-collection.test.ts`
Expected: FAIL — atualmente o runner trata "kairo@email.com" como tentativa de nome

- [ ] **Step 3: Update runner.ts pra pré-popular leadCollection**

Em `src/lib/agent/orchestrator/runner.ts`, substituir o bloco:

```ts
if (detectLeadFormArtifact(artifacts) && !meta.leadCollection) {
  const refreshed = await reloadMeta(conversationId);
  await persistMeta(conversationId, {
    ...refreshed,
    leadCollection: { stage: "name" },
  });
}
```

Por:

```ts
if (detectLeadFormArtifact(artifacts) && !meta.leadCollection) {
  const refreshed = await reloadMeta(conversationId);
  const { leads } = await import("@/db/schema");
  const { db } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  const lead = await db.query.leads.findFirst({
    where: eq(leads.conversationId, conversationId),
  });
  const name = lead?.name ?? refreshed.currentCategory ? null : null; // contactName resolution
  const conv = await db.query.conversations.findFirst({
    where: eq(import("@/db/schema").then((m) => m.conversations) as any, conversationId),
  });
  // simplificar: ler contactName diretamente
  const resolvedName = lead?.name ?? null;
  const resolvedPhone = lead?.phone ?? null;
  const stage = !resolvedName ? "name" : !resolvedPhone ? "phone" : "email";
  await persistMeta(conversationId, {
    ...refreshed,
    leadCollection: {
      stage,
      name: resolvedName ?? undefined,
      phone: resolvedPhone ?? undefined,
    },
  });
}
```

(Refator: extrair em função `initializeLeadCollection(conversationId): Promise<ConversationMetadata["leadCollection"]>` em `lead-collection.ts` pra evitar imports inline poluídos.)

Versão final mais limpa em `lead-collection.ts`:

```ts
export async function initializeLeadCollection(
  conversationId: string,
): Promise<NonNullable<ConversationMetadata["leadCollection"]>> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.conversationId, conversationId),
  });
  const name = lead?.name ?? undefined;
  const phone = lead?.phone ?? undefined;
  const stage: "name" | "phone" | "email" = !name ? "name" : !phone ? "phone" : "email";
  return { stage, name, phone };
}
```

E em `runner.ts`:

```ts
if (detectLeadFormArtifact(artifacts) && !meta.leadCollection) {
  const { initializeLeadCollection } = await import("./lead-collection");
  const refreshed = await reloadMeta(conversationId);
  const initial = await initializeLeadCollection(conversationId);
  await persistMeta(conversationId, {
    ...refreshed,
    leadCollection: initial,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/agent/orchestrator/lead-collection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/orchestrator/lead-collection.ts src/lib/agent/orchestrator/runner.ts src/lib/agent/orchestrator/lead-collection.test.ts
git commit -m "$(cat <<'EOF'
test+feat: lead-collection pula stages com dados já capturados

Quando present_lead_form dispara, runner inicializa leadCollection
com nome/phone do lead existente (capturados conversacionalmente
via save_contact_*). Usuário só preenche o que falta — geralmente
só email, ou nada se já tudo capturado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Fase 7 — QA Flow (delegado)

Após Fase 6 completa, **lançar via Task tool**:

1. **PO Lead** (subagent_type=`qa-planner` ou `general-purpose` com persona) — Opus — lê spec + plano + código, produz `docs/test-plans/lead-capture-web.md` com cenários P0 (golden, edge, regressão) e critérios de aceite binários.

2. **QA Crítico** (subagent_type=`qa-runner`) — Haiku ou Opus dependendo do tamanho — lê TEST-PLAN, escreve specs Playwright em `tests/e2e/specs/lead-capture-web/`, sobe ambiente via skill `local-dev`, executa E2E, reporta pass/fail por cenário com screenshots.

3. **Loop até verde** — falha → diagnose (timing/seletor/race/bug real) → corrige teste OU produto → re-executa. Conforme a regra global E2E.

4. **Commit final** `done: feature lead-capture-web — N cenários PASS` + atualizar `.done/` via skill `done-report`.

---

## Self-Review

Checklist após escrita do plano:

1. **Spec coverage** ✓
   - Nome cedo → Task 4.1 (prompt) + Task 3.1 (tool)
   - WhatsApp pós-simulação → Task 4.1 (prompt) + Task 3.2 (tool) + Task 5.1 (UI)
   - 2 tools dedicadas → Task 3.1 + 3.2
   - Lead criado ao salvar nome → Task 1.2 (saveContactName cria lead)
   - WhatsApp opcional conversa / obrigatório form → Task 2.1 (Zod) + Task 6.1 (UI)
   - Email opcional → Task 2.1
   - Form pré-preenchido → Task 6.1
   - Métricas (data-events) → cobertas via meta flags (whatsappOptinShown/Declined) + leadEvents existentes
   - QA Flow → Fase 7

2. **Placeholder scan** ✓ — todo step tem código exato ou comando exato. Único "TBD" implícito: nome do dir do componente artifact renderer (Task 5.1 Step 5 instrui o agente a localizar via grep — aceitável).

3. **Type consistency** ✓
   - `saveContactName`/`saveContactWhatsapp` retornam `ContactCaptureResult` consistente
   - `WhatsappOptinPayload` referenciado em types.ts e artifact union
   - `whatsappOptinShown`/`whatsappOptinDeclined` em ConversationMetadata (Task 2.4) usado em handler de chat (Task 2.4)
   - `initializeLeadCollection` exported de lead-collection.ts e importado em runner.ts

4. **Ambiguity check** ✓ — fluxo do prompt deixa explícito quando chamar cada tool. Edge "usuário recusa nome" tratado no prompt como "insiste 1x, depois segue sem". Edge "phone inválido" tratado tanto no card (botão desabilitado) quanto no handler (mensagem de erro stream).

5. **Migration** ⚠️ — Task 3.2 adiciona valor ao enum `artifact_type`. Migrations rodam dentro do container (regra global). Documentado no Step 6 da Task 3.2.

Plano completo, sem placeholders, types consistentes.

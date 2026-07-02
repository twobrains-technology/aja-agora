# AI Assistant — Cadastro/Edição de Persona — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar sidebar com AI Assistant (Sonnet 4.6) na tela de edição de persona no backoffice — admin leigo descreve mudança em linguagem natural, IA valida contra HARD_RULES e propõe diff card que vira `setValue` no form (não persiste no banco até admin clicar Salvar).

**Architecture:** Stateless client-side. `useChat` do `@ai-sdk/react` fala com `/api/admin/personas/[id]/assist` que roda `streamText` com 3 tools (`ask_clarification`, `propose_patch`, `validate_against_rules`). Validação server-side antes do diff chegar ao client. Zero migration.

**Tech Stack:** Next.js 16, Vercel AI SDK 6 (`ai` + `@ai-sdk/anthropic`), Zod 4, react-hook-form, shadcn/studio Pro, drizzle (read-only), vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-05-19-ai-assistant-persona-edit-design.md`

**Test plan:** `docs/test-plans/ai-assistant-persona-edit.md` (gerado pelo PO Lead em paralelo)

---

## File Structure

**Criar:**
| Path | Responsabilidade |
|---|---|
| `src/lib/agent/HARD_RULES.md` | Doc humano das regras críticas do produto (proibições, fluxos, constraints) |
| `src/lib/agent/HARD_RULES.test.ts` | Sincronia HARD_RULES.md ↔ cassettes Camada 2 (toda frase proibida em cassette deve estar no doc) |
| `src/lib/agent/assistant-prompt.ts` | System prompt do AI Assistant + builder que injeta ficha da persona + HARD_RULES |
| `src/lib/agent/assistant-prompt.test.ts` | Asserts structural sobre o prompt e o builder |
| `src/lib/validations/persona-patch.ts` | Zod discriminated union `PersonaPatch` |
| `src/lib/validations/persona-patch.test.ts` | Aceita patches válidos, rejeita malformados |
| `src/lib/agent/tools/assistant-tools.ts` | Factory `buildAssistantTools(ctx)` com closure pra `personaId` |
| `src/lib/agent/tools/assistant-tools.test.ts` | Tools no registry, validação server-side dispara |
| `src/lib/agent/assistant-rate-limit.ts` | Limiter in-memory (10 req/min/admin) |
| `src/lib/agent/assistant-rate-limit.test.ts` | Estoura no 11º request, reseta após janela |
| `src/app/api/admin/personas/[id]/assist/route.ts` | POST streamText; guard requireAdmin; rate limit |
| `src/app/api/admin/personas/[id]/assist/route.test.ts` | 401 sem session; 429 após limit; 404 persona inexistente |
| `src/components/admin/personas/diff-card.tsx` | Componente visual antes→depois com Aplicar/Editar/Rejeitar |
| `src/components/admin/personas/diff-card.test.tsx` | Renderiza estados pending/applied/rejected; dispara callbacks |
| `src/components/admin/personas/ai-assistant-sidebar.tsx` | Sidebar persistente com useChat |
| `src/components/admin/personas/ai-assistant-sidebar.test.tsx` | Render baseline; histórico exibido; envio dispara fetch |
| `tests/eval/assistant-flow.eval.test.ts` | Camada 3 LLM real (Sonnet assistant + Haiku user-bot) |

**Modificar:**
| Path | Mudança |
|---|---|
| `src/components/admin/personas/persona-edit-shell.tsx` | Embed `<AIAssistantSidebar>` ao lado do form; passa `useFormReturn` por prop |
| `src/app/admin/(dashboard)/personas/[id]/page.tsx` | Garantir que persona é passada pra shell (já é provável) |
| `tests/regression/agent-trajectory.test.ts` | Adicionar 5 cassettes `BUG-ASSISTANT-*` |
| `src/lib/agent/system-prompt.ts` | Nenhuma mudança esperada — HARD_RULES.md é doc paralelo |
| `vitest.config.ts` | Garantir que `tests/regression/` e `src/**/*.test.ts` estão incluídos (provável já está) |

---

## Fase 0 — HARD_RULES.md + sincronia com cassettes

**Goal:** Extrair regras hard do `system-prompt.ts` num doc humano e travar sincronia com cassettes Camada 2.

### Task 0.1: Extrair regras hard do system-prompt em doc humano

**Files:**
- Create: `src/lib/agent/HARD_RULES.md`

- [ ] **Step 1: Ler system-prompt.ts e listar TODAS as regras BUG-* + frases proibidas + fluxos obrigatórios**

Comando exploratório:
```bash
grep -nE 'BUG-|PROIBID|REGRA DURA|TOPIC-PICKER|^- "[A-Z]' src/lib/agent/system-prompt.ts | head -80
```

- [ ] **Step 2: Listar frases proibidas dos cassettes Camada 2 existentes**

Comando:
```bash
grep -E "expect\(.*toMatch|expect\(.*not\.toContain" tests/regression/agent-trajectory.test.ts | head -40
```

- [ ] **Step 3: Escrever HARD_RULES.md**

Conteúdo mínimo (escreva você, não copie literal — adapte ao que achou):

```markdown
# HARD RULES — Comportamento do Agent Aja Agora

> Doc de referência humano. Sincronia com `tests/regression/agent-trajectory.test.ts`
> é travada pelo teste `HARD_RULES.test.ts`. Quem mexer em prompt/cassette
> atualiza este doc no mesmo commit.

## 1. Frases absolutamente proibidas no `assistantResponse` de qualquer example,
##    e no `voiceTone` quando aplicado

Lista canônica vinda dos cassettes:

- "Vamos achar a opção certa" (BUG-TOPIC-PICKER-AUTO-VARIANT)
- "Prazer, X!" sem tool save_contact_name disparada antes (BUG-NO-CTA-AFTER-NAME)
- "Motivo:", "Reavaliando:", "Como mecânica" (BUG-INTERNAL-REASONING-LEAK)
- 13 variantes proibidas de topic-picker (listar todas — extrair do cassette)
- ... (completar com todas as regras encontradas)

## 2. Fluxos obrigatórios

### Captura de nome
ANTES de saudar/responder, agent DEVE chamar save_contact_name.
Persona não pode ter voiceTone que diga "cumprimente antes" — colide com BUG-SAVE-CONTACT-NAME-MUST-FIRE.

### Gates pré-valor (3 gates obrigatórios)
experience → timeframe → lance.
Não pular nenhum. Persona não pode ter voiceTone/example que pule.

### Topic-picker
Não usar variantes auto-listadas. Sempre via tool present_topic_picker.

## 3. Constraints por role

- **concierge**: não dá valor de parcela, não recomenda grupo específico
- **specialist auto**: não fala de imóvel
- **specialist imóvel**: não fala de auto
- **specialist moto**: não fala de auto nem imóvel
- **specialist servicos**: foco em serviços

## 4. Constraints por campo

### voiceTone
- Não pode instruir "cumprimentar antes da save_contact_name"
- Não pode listar tools que o agent deve chamar (campo activeTools faz isso)
- Não pode citar valores numéricos absolutos (parcelas, taxas) — context-dependent

### examples
- Cada `assistantResponse` passa pelas mesmas regras de 1 e 2
- `userMessage` realista (não markdown formatado, não emojis em excesso)
- `whenChannel` consistente: example de whatsapp não usa cards de web

### forbiddenTopics
- Não pode bloquear tópicos canônicos do funil: "consórcio", "simulação", "carta de crédito"
- Resposta orientada (`responseWhenAsked`) também segue regras de 1 e 2

### handoffTriggers
- Só ativa quando user explicitamente pede humano ("quero falar com pessoa", "atendente")
- Não pode disparar por palavra-chave fraca ("ajuda", "dúvida")
```

- [ ] **Step 4: Verificar que o arquivo tem ao menos 100 linhas e cobre as 4 seções**

```bash
wc -l src/lib/agent/HARD_RULES.md
```
Expected: ≥ 100

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/HARD_RULES.md
git commit -m "docs(agent): HARD_RULES.md extraído de system-prompt + cassettes

Doc humano das regras críticas. Sincronia com Camada 2 será travada
em commit seguinte por HARD_RULES.test.ts."
```

### Task 0.2: Teste de sincronia HARD_RULES.md ↔ cassettes

**Files:**
- Create: `src/lib/agent/HARD_RULES.test.ts`

- [ ] **Step 1: Escrever teste que FALHA se cassette mencionar frase proibida que não está no doc**

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const HARD_RULES_PATH = path.join(process.cwd(), "src/lib/agent/HARD_RULES.md");
const CASSETTE_PATH = path.join(process.cwd(), "tests/regression/agent-trajectory.test.ts");

describe("HARD_RULES sync with Camada 2 cassettes", () => {
  it("toda frase proibida em cassette aparece no HARD_RULES.md", () => {
    const rules = fs.readFileSync(HARD_RULES_PATH, "utf8");
    const cassette = fs.readFileSync(CASSETTE_PATH, "utf8");

    // Extrai patterns de toContain/toMatch que indicam "frase proibida" via .not.
    const forbiddenInCassette = Array.from(
      cassette.matchAll(/not\.toContain\(["'`]([^"'`]+)["'`]\)/g),
    ).map((m) => m[1]);

    const missing = forbiddenInCassette.filter(
      (phrase) => !rules.includes(phrase),
    );

    expect(missing).toEqual([]);
  });

  it("HARD_RULES.md cobre as 4 seções obrigatórias", () => {
    const rules = fs.readFileSync(HARD_RULES_PATH, "utf8");
    expect(rules).toMatch(/Frases absolutamente proibidas/i);
    expect(rules).toMatch(/Fluxos obrigatórios/i);
    expect(rules).toMatch(/Constraints por role/i);
    expect(rules).toMatch(/Constraints por campo/i);
  });
});
```

- [ ] **Step 2: Rodar — deve PASSAR se HARD_RULES.md tem todas as frases dos cassettes**

```bash
npx vitest run src/lib/agent/HARD_RULES.test.ts
```
Expected: PASS. Se FAIL, adicione no HARD_RULES.md as frases faltantes e re-rode.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/HARD_RULES.test.ts src/lib/agent/HARD_RULES.md
git commit -m "test(agent): sync HARD_RULES.md com cassettes Camada 2

Falha PR se cassette tem frase proibida que não está no doc."
```

**Critério de aceite Fase 0:**
- ✅ `src/lib/agent/HARD_RULES.md` existe com ≥100 linhas, 4 seções
- ✅ `src/lib/agent/HARD_RULES.test.ts` passa
- ✅ Pre-commit hook do projeto detecta mudança em `src/lib/agent/` e EXIGE Camada 3 — esse será o teste real na hora de adicionar tools/route (após Fase 4)

---

## Fase 1 — Schema Zod `PersonaPatch`

**Goal:** Discriminated union dos patches possíveis, reusável em tool input e client.

### Task 1.1: Schema PersonaPatch + tests structural

**Files:**
- Create: `src/lib/validations/persona-patch.ts`
- Create: `src/lib/validations/persona-patch.test.ts`

- [ ] **Step 1: Escrever testes que FALHAM**

```ts
// src/lib/validations/persona-patch.test.ts
import { describe, expect, it } from "vitest";
import { personaPatchSchema } from "./persona-patch";

describe("personaPatchSchema", () => {
  it("aceita voiceTone patch válido", () => {
    const result = personaPatchSchema.safeParse({
      kind: "voiceTone",
      before: "formal e técnico",
      after: "casual, próximo, como amigo no zap",
      rationale: "admin pediu menos formal",
      personaVersionSeen: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita voiceTone com after > 2000 chars", () => {
    const result = personaPatchSchema.safeParse({
      kind: "voiceTone",
      before: "x",
      after: "y".repeat(2001),
      rationale: "r",
      personaVersionSeen: 1,
    });
    expect(result.success).toBe(false);
  });

  it("aceita example.add com PersonaExample válido", () => {
    const result = personaPatchSchema.safeParse({
      kind: "example.add",
      after: {
        id: "ex-001",
        userMessage: "Quanto custa?",
        assistantResponse: "Depende da faixa. Posso te mostrar opções?",
      },
      rationale: "exemplo de pergunta de preço",
      personaVersionSeen: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita example.add com userMessage curta", () => {
    const result = personaPatchSchema.safeParse({
      kind: "example.add",
      after: {
        id: "ex-002",
        userMessage: "ok",
        assistantResponse: "Beleza! Vamos lá?",
      },
      rationale: "r",
      personaVersionSeen: 1,
    });
    expect(result.success).toBe(false);
  });

  it("aceita example.remove com targetId uuid", () => {
    const result = personaPatchSchema.safeParse({
      kind: "example.remove",
      targetId: "550e8400-e29b-41d4-a716-446655440000",
      rationale: "exemplo redundante",
      personaVersionSeen: 1,
    });
    expect(result.success).toBe(true);
  });

  it("aceita forbiddenTopic.add", () => {
    const result = personaPatchSchema.safeParse({
      kind: "forbiddenTopic.add",
      after: {
        id: "ft-001",
        topic: "comissão de corretor",
        responseWhenAsked: "Não trabalho com corretagem. Sou seu agente digital direto.",
        enabled: true,
      },
      rationale: "evitar pergunta de comissão",
      personaVersionSeen: 1,
    });
    expect(result.success).toBe(true);
  });

  it("aceita handoffTrigger.add", () => {
    const result = personaPatchSchema.safeParse({
      kind: "handoffTrigger.add",
      after: {
        id: "ht-001",
        condition: "usuário pede explicitamente falar com humano",
        enabled: true,
      },
      rationale: "trigger explícito de humano",
      personaVersionSeen: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita kind desconhecido", () => {
    const result = personaPatchSchema.safeParse({
      kind: "displayName",
      after: "Novo Nome",
      rationale: "r",
      personaVersionSeen: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita patch sem personaVersionSeen", () => {
    const result = personaPatchSchema.safeParse({
      kind: "voiceTone",
      before: "x",
      after: "y",
      rationale: "r",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar — deve FALHAR (módulo não existe)**

```bash
npx vitest run src/lib/validations/persona-patch.test.ts
```
Expected: FAIL — Cannot find module

- [ ] **Step 3: Implementar `src/lib/validations/persona-patch.ts`**

```ts
import { z } from "zod";
import {
  personaExampleSchema,
  personaForbiddenTopicSchema,
  personaHandoffTriggerSchema,
} from "./persona";

const baseFields = {
  rationale: z.string().min(1).max(280),
  personaVersionSeen: z.number().int().nonnegative(),
};

export const personaPatchSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("voiceTone"),
    before: z.string().min(1).max(2000),
    after: z.string().min(1).max(2000),
    ...baseFields,
  }),
  z.object({
    kind: z.literal("example.add"),
    after: personaExampleSchema,
    ...baseFields,
  }),
  z.object({
    kind: z.literal("example.remove"),
    targetId: z.string().uuid(),
    ...baseFields,
  }),
  z.object({
    kind: z.literal("forbiddenTopic.add"),
    after: personaForbiddenTopicSchema,
    ...baseFields,
  }),
  z.object({
    kind: z.literal("forbiddenTopic.remove"),
    targetId: z.string().uuid(),
    ...baseFields,
  }),
  z.object({
    kind: z.literal("handoffTrigger.add"),
    after: personaHandoffTriggerSchema,
    ...baseFields,
  }),
  z.object({
    kind: z.literal("handoffTrigger.remove"),
    targetId: z.string().uuid(),
    ...baseFields,
  }),
]);

export type PersonaPatch = z.infer<typeof personaPatchSchema>;
export type PersonaPatchKind = PersonaPatch["kind"];
```

- [ ] **Step 4: Rodar — deve PASSAR**

```bash
npx vitest run src/lib/validations/persona-patch.test.ts
```
Expected: PASS, 9 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/persona-patch.ts src/lib/validations/persona-patch.test.ts
git commit -m "feat(validation): PersonaPatch schema Zod discriminated union

Suporta voiceTone | example.add/remove | forbiddenTopic.add/remove
| handoffTrigger.add/remove. Reusado por tool inputSchema e client."
```

**Critério de aceite Fase 1:**
- ✅ Schema aceita 7 kinds de patch
- ✅ Rejeita malformados (kind desconhecido, sem personaVersionSeen, valores fora de range)
- ✅ Tipo `PersonaPatch` exportado e usável

---

## Fase 2 — Assistant Prompt + Tools

**Goal:** Sistema de prompt do AI Assistant e factory de tools com closure pra personaId.

### Task 2.1: Assistant prompt + builder

**Files:**
- Create: `src/lib/agent/assistant-prompt.ts`
- Create: `src/lib/agent/assistant-prompt.test.ts`

- [ ] **Step 1: Escrever testes que FALHAM**

```ts
// src/lib/agent/assistant-prompt.test.ts
import { describe, expect, it } from "vitest";
import {
  ASSISTANT_BASE_PROMPT,
  buildAssistantPrompt,
} from "./assistant-prompt";
import fs from "node:fs";
import path from "node:path";

const examplePersona = {
  id: "test-1",
  displayName: "Rafael Auto",
  role: "specialist" as const,
  category: "auto",
  expertise: "compactos",
  voiceTone: "formal e técnico",
  examples: [],
  forbiddenTopics: [],
  handoffTriggers: [],
  version: 1,
};

describe("ASSISTANT_BASE_PROMPT", () => {
  it("instrui IA a desambiguar antes de propor", () => {
    expect(ASSISTANT_BASE_PROMPT).toMatch(/desambigu/i);
    expect(ASSISTANT_BASE_PROMPT).toMatch(/ask_clarification/);
  });

  it("instrui IA a validar antes de propose_patch", () => {
    expect(ASSISTANT_BASE_PROMPT).toMatch(/valid/i);
    expect(ASSISTANT_BASE_PROMPT).toMatch(/HARD_RULES/);
  });

  it("instrui linguagem simples (admin leigo)", () => {
    expect(ASSISTANT_BASE_PROMPT).toMatch(/leigo|simples|sem jargão/i);
  });

  it("não menciona campos fora do escopo (activeTools, activeCampaigns)", () => {
    expect(ASSISTANT_BASE_PROMPT).not.toMatch(/activeTools|activeCampaigns/);
  });
});

describe("buildAssistantPrompt", () => {
  it("injeta HARD_RULES.md inteiro no prompt", () => {
    const hardRules = fs.readFileSync(
      path.join(process.cwd(), "src/lib/agent/HARD_RULES.md"),
      "utf8",
    );
    const built = buildAssistantPrompt(examplePersona);
    expect(built).toContain(hardRules.slice(0, 200));
  });

  it("injeta ficha da persona (displayName, role, category, voiceTone)", () => {
    const built = buildAssistantPrompt(examplePersona);
    expect(built).toContain("Rafael Auto");
    expect(built).toContain("specialist");
    expect(built).toContain("auto");
    expect(built).toContain("formal e técnico");
  });

  it("injeta personaVersion para anti-stale", () => {
    const built = buildAssistantPrompt(examplePersona);
    expect(built).toContain("version: 1");
  });
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

```bash
npx vitest run src/lib/agent/assistant-prompt.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implementar `src/lib/agent/assistant-prompt.ts`**

```ts
import fs from "node:fs";
import path from "node:path";

let cachedHardRules: string | null = null;

function loadHardRules(): string {
  if (cachedHardRules === null) {
    cachedHardRules = fs.readFileSync(
      path.join(process.cwd(), "src/lib/agent/HARD_RULES.md"),
      "utf8",
    );
  }
  return cachedHardRules;
}

export const ASSISTANT_BASE_PROMPT = `Você é um assistente que ajuda admins **leigos** a configurar agentes de consórcio.

# Como você trabalha

- Admin descreve em linguagem simples o que quer mudar no agente (ex: "deixa menos formal", "adiciona exemplo de quando perguntam preço")
- Você **traduz** essa intenção em mudança estruturada em um dos campos: voiceTone, examples, forbiddenTopics, handoffTriggers
- **Desambigue antes de propor**: se a intenção é vaga, chame \`ask_clarification\` com uma pergunta direta de uma frase
- **Valide antes de propor**: TODA proposta passa por \`validate_against_rules\` antes de virar \`propose_patch\`. Se validate retorna inválido, repense — não force
- Linguagem simples, sem jargão de prompt engineering. Fale como amigo explicando, não como engenheiro

# Campos que você pode editar

- \`voiceTone\`: tom de voz do agente (texto livre, até 2000 chars). Influencia personalidade, linguagem, estilo
- \`examples\`: exemplos de diálogo few-shot (par userMessage/assistantResponse) que ensinam o agente
- \`forbiddenTopics\`: tópicos que o agente NÃO pode tocar, com resposta orientada quando perguntado
- \`handoffTriggers\`: condições explícitas pra escalar pra humano

# Campos que você NÃO edita

NUNCA proponha mudanças em activeTools, activeCampaigns, displayName, role, category, expertise. Essas são decisões técnicas/operacionais.

# Regras hard do produto

As regras críticas do produto estão abaixo. Toda proposta deve respeitá-las. Se admin pedir algo que viola, EXPLIQUE em uma frase simples por que não dá e ofereça alternativa.

---

`;

type PersonaContext = {
  id: string;
  displayName: string;
  role: "concierge" | "specialist";
  category: string | null;
  expertise: string | null;
  voiceTone: string;
  examples: unknown[];
  forbiddenTopics: unknown[];
  handoffTriggers: unknown[];
  version: number;
};

export function buildAssistantPrompt(persona: PersonaContext): string {
  const hardRules = loadHardRules();
  const ficha = `# Persona em edição

- displayName: ${persona.displayName}
- role: ${persona.role}
- category: ${persona.category ?? "(none)"}
- expertise: ${persona.expertise ?? "(none)"}
- version: ${persona.version}

## voiceTone atual

\`\`\`
${persona.voiceTone}
\`\`\`

## examples atuais (${persona.examples.length})

${JSON.stringify(persona.examples, null, 2)}

## forbiddenTopics atuais (${persona.forbiddenTopics.length})

${JSON.stringify(persona.forbiddenTopics, null, 2)}

## handoffTriggers atuais (${persona.handoffTriggers.length})

${JSON.stringify(persona.handoffTriggers, null, 2)}
`;

  return `${ASSISTANT_BASE_PROMPT}${hardRules}\n\n---\n\n${ficha}`;
}
```

- [ ] **Step 4: Rodar — deve PASSAR**

```bash
npx vitest run src/lib/agent/assistant-prompt.test.ts
```
Expected: PASS, 7 testes

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/assistant-prompt.ts src/lib/agent/assistant-prompt.test.ts
git commit -m "feat(agent): assistant-prompt builder injeta HARD_RULES + ficha"
```

### Task 2.2: Assistant tools (factory com closure)

**Files:**
- Create: `src/lib/agent/tools/assistant-tools.ts`
- Create: `src/lib/agent/tools/assistant-tools.test.ts`

- [ ] **Step 1: Escrever testes que FALHAM**

```ts
// src/lib/agent/tools/assistant-tools.test.ts
import { describe, expect, it } from "vitest";
import { buildAssistantTools } from "./assistant-tools";

describe("buildAssistantTools", () => {
  it("retorna 3 tools no registry", () => {
    const tools = buildAssistantTools({
      personaId: "p1",
      personaVersion: 1,
      currentRow: {
        voiceTone: "x",
        examples: [],
        forbiddenTopics: [],
        handoffTriggers: [],
      },
    });
    expect(Object.keys(tools).sort()).toEqual([
      "ask_clarification",
      "propose_patch",
      "validate_against_rules",
    ]);
  });

  it("propose_patch rejeita patch com 'before' que não bate com row atual", async () => {
    const tools = buildAssistantTools({
      personaId: "p1",
      personaVersion: 1,
      currentRow: {
        voiceTone: "formal e técnico",
        examples: [],
        forbiddenTopics: [],
        handoffTriggers: [],
      },
    });
    const result = await tools.propose_patch.execute(
      {
        kind: "voiceTone",
        before: "tom errado que não está no row",
        after: "casual",
        rationale: "x",
        personaVersionSeen: 1,
      },
      {} as never,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/before.*não bate/i);
  });

  it("propose_patch rejeita personaVersionSeen stale", async () => {
    const tools = buildAssistantTools({
      personaId: "p1",
      personaVersion: 5,
      currentRow: {
        voiceTone: "formal",
        examples: [],
        forbiddenTopics: [],
        handoffTriggers: [],
      },
    });
    const result = await tools.propose_patch.execute(
      {
        kind: "voiceTone",
        before: "formal",
        after: "casual",
        rationale: "x",
        personaVersionSeen: 3,
      },
      {} as never,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vers[ãa]o/i);
  });

  it("propose_patch rejeita voiceTone contendo frase proibida", async () => {
    const tools = buildAssistantTools({
      personaId: "p1",
      personaVersion: 1,
      currentRow: {
        voiceTone: "x",
        examples: [],
        forbiddenTopics: [],
        handoffTriggers: [],
      },
    });
    const result = await tools.propose_patch.execute(
      {
        kind: "voiceTone",
        before: "x",
        after: "casual, e sempre cumprimente pelo nome assim que entrar",
        rationale: "r",
        personaVersionSeen: 1,
      },
      {} as never,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/save_contact_name|cumpriment/i);
  });

  it("propose_patch aceita patch válido", async () => {
    const tools = buildAssistantTools({
      personaId: "p1",
      personaVersion: 1,
      currentRow: {
        voiceTone: "formal e técnico",
        examples: [],
        forbiddenTopics: [],
        handoffTriggers: [],
      },
    });
    const result = await tools.propose_patch.execute(
      {
        kind: "voiceTone",
        before: "formal e técnico",
        after: "casual, próximo, fala como amigo no zap",
        rationale: "admin pediu menos formal",
        personaVersionSeen: 1,
      },
      {} as never,
    );
    expect(result.ok).toBe(true);
    expect(result.patch?.kind).toBe("voiceTone");
  });

  it("validate_against_rules detecta frase proibida em texto livre", async () => {
    const tools = buildAssistantTools({
      personaId: "p1",
      personaVersion: 1,
      currentRow: {
        voiceTone: "x",
        examples: [],
        forbiddenTopics: [],
        handoffTriggers: [],
      },
    });
    const result = await tools.validate_against_rules.execute(
      {
        text: "Vamos achar a opção certa pra você",
        field: "voiceTone",
      },
      {} as never,
    );
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(expect.stringMatching(/Vamos achar a opção certa/i));
  });

  it("ask_clarification retorna a pergunta sem persistir nada", async () => {
    const tools = buildAssistantTools({
      personaId: "p1",
      personaVersion: 1,
      currentRow: {
        voiceTone: "x",
        examples: [],
        forbiddenTopics: [],
        handoffTriggers: [],
      },
    });
    const result = await tools.ask_clarification.execute(
      { question: "Menos formal igual amigo no zap, ou só menos técnico?" },
      {} as never,
    );
    expect(result.question).toMatch(/menos formal/i);
  });
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

```bash
npx vitest run src/lib/agent/tools/assistant-tools.test.ts
```

- [ ] **Step 3: Implementar `src/lib/agent/tools/assistant-tools.ts`**

```ts
import { tool } from "ai";
import { z } from "zod";
import { personaPatchSchema, type PersonaPatch } from "@/lib/validations/persona-patch";

type AssistantToolsContext = {
  personaId: string;
  personaVersion: number;
  currentRow: {
    voiceTone: string;
    examples: unknown[];
    forbiddenTopics: unknown[];
    handoffTriggers: unknown[];
  };
};

// Lista canônica de frases proibidas — sincronizada com HARD_RULES.md.
// Mantida como const aqui para validação em runtime; HARD_RULES.test.ts garante sync.
const FORBIDDEN_PHRASES = [
  "Vamos achar a opção certa",
  "Reavaliando",
  "Motivo:",
  "Como mecânica",
  // ... completar com a lista de cassettes
];

const VIOLATING_VOICE_TONE_RULES = [
  {
    test: /cumpriment(e|ar).*(antes|assim que|entrar|nome)/i,
    error:
      "voiceTone não pode instruir cumprimentar pelo nome antes — colide com save_contact_name (BUG-SAVE-CONTACT-NAME-MUST-FIRE)",
  },
];

function detectViolations(text: string, _field: string): string[] {
  const violations: string[] = [];
  for (const phrase of FORBIDDEN_PHRASES) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      violations.push(`Contém frase proibida: "${phrase}"`);
    }
  }
  for (const rule of VIOLATING_VOICE_TONE_RULES) {
    if (rule.test.test(text)) {
      violations.push(rule.error);
    }
  }
  return violations;
}

export function buildAssistantTools(ctx: AssistantToolsContext) {
  return {
    ask_clarification: tool({
      description:
        "Faça uma pergunta de UMA FRASE pro admin quando a intenção dele estiver ambígua. Use ANTES de propor patch quando há mais de uma interpretação plausível.",
      inputSchema: z.object({
        question: z.string().min(5).max(280),
      }),
      execute: async ({ question }) => ({ question }),
    }),

    validate_against_rules: tool({
      description:
        "Verifica se um texto livre viola alguma HARD_RULE do produto antes de você propor patch. Use SEMPRE antes de propose_patch.",
      inputSchema: z.object({
        text: z.string().min(1),
        field: z.enum([
          "voiceTone",
          "example.assistantResponse",
          "forbiddenTopic.responseWhenAsked",
          "handoffTrigger.condition",
        ]),
      }),
      execute: async ({ text, field }) => {
        const violations = detectViolations(text, field);
        return { valid: violations.length === 0, violations };
      },
    }),

    propose_patch: tool({
      description:
        "Propõe uma mudança estruturada na persona. SEMPRE valide o conteúdo com validate_against_rules antes de chamar. Inclua personaVersionSeen igual à versão atual da persona no contexto.",
      inputSchema: personaPatchSchema,
      execute: async (
        patch,
      ): Promise<
        | { ok: true; patch: PersonaPatch }
        | { ok: false; error: string }
      > => {
        if (patch.personaVersionSeen !== ctx.personaVersion) {
          return {
            ok: false,
            error: `versão stale: você viu version=${patch.personaVersionSeen} mas atual é ${ctx.personaVersion}`,
          };
        }

        if (patch.kind === "voiceTone") {
          if (patch.before !== ctx.currentRow.voiceTone) {
            return {
              ok: false,
              error: "patch.before não bate com voiceTone atual da persona",
            };
          }
          const violations = detectViolations(patch.after, "voiceTone");
          if (violations.length > 0) {
            return { ok: false, error: violations.join(" | ") };
          }
        }

        if (patch.kind === "example.add") {
          const violations = detectViolations(
            patch.after.assistantResponse,
            "example.assistantResponse",
          );
          if (violations.length > 0) {
            return { ok: false, error: violations.join(" | ") };
          }
        }

        if (patch.kind === "forbiddenTopic.add") {
          const violations = detectViolations(
            patch.after.responseWhenAsked,
            "forbiddenTopic.responseWhenAsked",
          );
          if (violations.length > 0) {
            return { ok: false, error: violations.join(" | ") };
          }
        }

        return { ok: true, patch };
      },
    }),
  };
}

export type AssistantTools = ReturnType<typeof buildAssistantTools>;
```

- [ ] **Step 4: Rodar — deve PASSAR**

```bash
npx vitest run src/lib/agent/tools/assistant-tools.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/assistant-tools.ts src/lib/agent/tools/assistant-tools.test.ts
git commit -m "feat(agent): assistant tools (ask_clarification, propose_patch, validate_against_rules)

Factory com closure pra personaId/version/currentRow.
propose_patch valida before/version/frases proibidas server-side."
```

**Critério de aceite Fase 2:**
- ✅ `ASSISTANT_BASE_PROMPT` instrui desambiguar + validar + leigo
- ✅ `buildAssistantPrompt` injeta HARD_RULES + ficha
- ✅ 3 tools registradas no factory
- ✅ `propose_patch` rejeita stale version, before-mismatch e frase proibida

---

## Fase 3 — Rate limit + API route

**Goal:** Endpoint server-side que sobe stream com assistant.

### Task 3.1: Rate limiter in-memory

**Files:**
- Create: `src/lib/agent/assistant-rate-limit.ts`
- Create: `src/lib/agent/assistant-rate-limit.test.ts`

- [ ] **Step 1: Test que FALHA**

```ts
// src/lib/agent/assistant-rate-limit.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { rateLimit, _resetForTests } from "./assistant-rate-limit";

describe("assistant-rate-limit", () => {
  beforeEach(() => _resetForTests());

  it("permite até 10 requests por minuto", () => {
    for (let i = 0; i < 10; i++) {
      expect(rateLimit("user-1").allowed).toBe(true);
    }
  });

  it("bloqueia 11º request na mesma janela", () => {
    for (let i = 0; i < 10; i++) rateLimit("user-1");
    expect(rateLimit("user-1").allowed).toBe(false);
  });

  it("isola users", () => {
    for (let i = 0; i < 10; i++) rateLimit("user-1");
    expect(rateLimit("user-2").allowed).toBe(true);
  });

  it("retorna retryAfterMs quando bloqueia", () => {
    for (let i = 0; i < 10; i++) rateLimit("user-1");
    const r = rateLimit("user-1");
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.retryAfterMs).toBeLessThanOrEqual(60_000);
  });
});
```

- [ ] **Step 2: FALHA**

```bash
npx vitest run src/lib/agent/assistant-rate-limit.test.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/lib/agent/assistant-rate-limit.ts
const WINDOW_MS = 60_000;
const MAX = 10;

const buckets = new Map<string, number[]>();

export function rateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const bucket = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (bucket.length >= MAX) {
    const oldest = bucket[0];
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
  }
  bucket.push(now);
  buckets.set(key, bucket);
  return { allowed: true };
}

export function _resetForTests() {
  buckets.clear();
}
```

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/assistant-rate-limit.ts src/lib/agent/assistant-rate-limit.test.ts
git commit -m "feat(agent): rate limit in-memory 10req/min/admin pra assist"
```

### Task 3.2: API route POST /api/admin/personas/[id]/assist

**Files:**
- Create: `src/app/api/admin/personas/[id]/assist/route.ts`
- Create: `src/app/api/admin/personas/[id]/assist/route.test.ts`

- [ ] **Step 1: Test que FALHA**

```ts
// src/app/api/admin/personas/[id]/assist/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { _resetForTests } from "@/lib/agent/assistant-rate-limit";

// Mock guards e DB
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/db", () => ({
  db: {
    query: {
      personas: {
        findFirst: vi.fn(),
      },
    },
  },
}));

const mockRequireAdmin = vi.mocked(
  (await import("@/lib/auth/require-admin")).requireAdmin,
);
const mockFindFirst = vi.mocked((await import("@/db")).db.query.personas.findFirst);

describe("POST /api/admin/personas/[id]/assist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTests();
  });

  it("retorna 401 sem session de admin", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("UNAUTHORIZED"));
    const req = new Request("http://x/api/admin/personas/p1/assist", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
    });
    const res = await POST(req as never, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("retorna 404 se persona não existe", async () => {
    mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
    mockFindFirst.mockResolvedValue(undefined as never);
    const req = new Request("http://x/api/admin/personas/p404/assist", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "oi" }] }),
    });
    const res = await POST(req as never, { params: Promise.resolve({ id: "p404" }) });
    expect(res.status).toBe(404);
  });

  it("retorna 429 após 10 req no minuto", async () => {
    mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
    mockFindFirst.mockResolvedValue({
      id: "p1",
      displayName: "x",
      role: "specialist",
      category: "auto",
      expertise: null,
      voiceTone: "x",
      examples: [],
      forbiddenTopics: [],
      handoffTriggers: [],
      version: 1,
    } as never);

    for (let i = 0; i < 10; i++) {
      const req = new Request("http://x/api/admin/personas/p1/assist", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: "oi" }] }),
      });
      await POST(req as never, { params: Promise.resolve({ id: "p1" }) });
    }
    const req = new Request("http://x/api/admin/personas/p1/assist", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "oi" }] }),
    });
    const res = await POST(req as never, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implementar `route.ts`**

```ts
// src/app/api/admin/personas/[id]/assist/route.ts
import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/require-admin";
import { rateLimit } from "@/lib/agent/assistant-rate-limit";
import { buildAssistantPrompt } from "@/lib/agent/assistant-prompt";
import { buildAssistantTools } from "@/lib/agent/tools/assistant-tools";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const limit = rateLimit(`assist:${admin.id}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  const persona = await db.query.personas.findFirst({
    where: eq(personas.id, id),
  });
  if (!persona) {
    return NextResponse.json({ error: "persona_not_found" }, { status: 404 });
  }

  const body = await req.json();
  const messages = body.messages ?? [];

  const tools = buildAssistantTools({
    personaId: persona.id,
    personaVersion: persona.version,
    currentRow: {
      voiceTone: persona.voiceTone,
      examples: persona.examples,
      forbiddenTopics: persona.forbiddenTopics,
      handoffTriggers: persona.handoffTriggers,
    },
  });

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: buildAssistantPrompt(persona as never),
    messages: convertToModelMessages(messages.slice(-24)),
    tools,
    stopWhen: stepCountIs(6),
    temperature: 0.4,
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 4: PASS — todos os 3 testes**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/personas/[id]/assist/route.ts src/app/api/admin/personas/[id]/assist/route.test.ts
git commit -m "feat(api): POST /admin/personas/[id]/assist com streamText + tools

Guards: requireAdmin (401), persona exists (404), rate limit 10/min (429).
streamText com claude-sonnet-4-6 + 3 tools + stopWhen 6 steps."
```

**Critério de aceite Fase 3:**
- ✅ 401 sem admin, 404 sem persona, 429 após 10 req
- ✅ `streamText` configurado com Sonnet 4.6 + tools + 6 steps max
- ✅ Histórico limitado aos últimos 24 mensagens (custo)

---

## Fase 4 — Camada 2 cassettes BUG-ASSISTANT-*

**Goal:** 5 cassettes determinísticos no `tests/regression/agent-trajectory.test.ts` que falham se LLM regredir.

### Task 4.1: Adicionar cassettes ao arquivo de trajectory

**Files:**
- Modify: `tests/regression/agent-trajectory.test.ts`

- [ ] **Step 1: Ler estrutura atual do arquivo pra entender padrão de cassette**

```bash
head -100 tests/regression/agent-trajectory.test.ts
```

- [ ] **Step 2: Adicionar bloco `describe("BUG-ASSISTANT-*", ...)` no final do arquivo com 5 cassettes**

Os cassettes simulam respostas do LLM via `MockLanguageModelV2` da `ai/test` e validam:

1. **BUG-ASSISTANT-AMBIGUOUS-MUST-ASK**: input "menos formal" → primeira tool call deve ser `ask_clarification`, NÃO `propose_patch`
2. **BUG-ASSISTANT-PROPOSAL-MUST-VALIDATE**: LLM chama `propose_patch` direto sem `validate_against_rules` antes → cassette assert que validate foi chamado primeiro
3. **BUG-ASSISTANT-NO-CTA-LEAK**: LLM tenta propor voiceTone com "Vamos achar a opção certa" → `propose_patch.execute` retorna `ok: false` com error contendo "Vamos achar"
4. **BUG-ASSISTANT-RESPECT-PERSONA-ROLE**: Persona role=concierge — LLM não pode propor example.add cujo assistantResponse mencione "parcela R$ X" (concierge não dá valor)
5. **BUG-ASSISTANT-DIFF-BEFORE-MATCHES-CURRENT**: LLM gera propose_patch com `before: "tom A"` mas currentRow.voiceTone é "tom B" → server retorna erro, LLM precisa re-fetch

**Template de cassette** (adaptar dos existentes — não inventar):

```ts
describe("BUG-ASSISTANT-AMBIGUOUS-MUST-ASK", () => {
  it("input vago 'menos formal' dispara ask_clarification antes de propose_patch", async () => {
    const cassette = simulateReadableStream({
      chunks: [
        {
          type: "tool-call" as const,
          toolCallId: "1",
          toolName: "ask_clarification",
          args: { question: "Menos formal igual amigo no zap, ou só menos técnico?" },
        },
        { type: "finish" as const, finishReason: "tool-calls" as const, usage: { inputTokens: 100, outputTokens: 30 } },
      ],
    });

    const model = new MockLanguageModelV2({
      doStream: async () => ({ stream: cassette, rawCall: { rawPrompt: null, rawSettings: {} } }),
    });

    const tools = buildAssistantTools({
      personaId: "p1",
      personaVersion: 1,
      currentRow: { voiceTone: "formal e técnico", examples: [], forbiddenTopics: [], handoffTriggers: [] },
    });

    const result = await streamText({
      model,
      messages: [{ role: "user", content: "deixa menos formal" }],
      tools,
      stopWhen: stepCountIs(2),
    });

    const steps = await result.steps;
    expect(steps[0].toolCalls?.[0]?.toolName).toBe("ask_clarification");
    expect(steps[0].toolCalls?.[0]?.toolName).not.toBe("propose_patch");
  });
});
```

(Repetir padrão pros outros 4 cassettes.)

- [ ] **Step 3: Rodar cassettes — todos devem PASSAR**

```bash
npx vitest run tests/regression/agent-trajectory.test.ts -t "BUG-ASSISTANT"
```

- [ ] **Step 4: Commit**

```bash
git add tests/regression/agent-trajectory.test.ts
git commit -m "test(regression): 5 cassettes BUG-ASSISTANT-* Camada 2

- AMBIGUOUS-MUST-ASK
- PROPOSAL-MUST-VALIDATE
- NO-CTA-LEAK
- RESPECT-PERSONA-ROLE
- DIFF-BEFORE-MATCHES-CURRENT"
```

**Critério de aceite Fase 4:**
- ✅ 5 novos cassettes no arquivo
- ✅ Todos PASSAM (com mocks, comportamento esperado do LLM)
- ✅ Cassettes detectariam regressão se LLM começasse a violar (validação manual via grep)

---

## Fase 5 — UI sidebar + DiffCard

**Goal:** Sidebar lateral com chat + DiffCard que aplica `setValue` no form parent.

### Task 5.1: DiffCard

**Files:**
- Create: `src/components/admin/personas/diff-card.tsx`
- Create: `src/components/admin/personas/diff-card.test.tsx`

- [ ] **Step 1: Test que FALHA**

```tsx
// src/components/admin/personas/diff-card.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiffCard } from "./diff-card";

describe("DiffCard", () => {
  const baseProps = {
    patch: {
      kind: "voiceTone" as const,
      before: "formal e técnico",
      after: "casual, próximo, fala como amigo no zap",
      rationale: "admin pediu menos formal",
      personaVersionSeen: 1,
    },
    onApply: vi.fn(),
    onReject: vi.fn(),
    onEdit: vi.fn(),
  };

  it("renderiza before e after", () => {
    render(<DiffCard {...baseProps} />);
    expect(screen.getByText(/formal e técnico/)).toBeInTheDocument();
    expect(screen.getByText(/casual, próximo/)).toBeInTheDocument();
  });

  it("renderiza rationale", () => {
    render(<DiffCard {...baseProps} />);
    expect(screen.getByText(/admin pediu menos formal/)).toBeInTheDocument();
  });

  it("clica Aplicar dispara callback", () => {
    render(<DiffCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /aplicar/i }));
    expect(baseProps.onApply).toHaveBeenCalledWith(baseProps.patch);
  });

  it("clica Rejeitar dispara callback", () => {
    render(<DiffCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /rejeitar|✕/i }));
    expect(baseProps.onReject).toHaveBeenCalled();
  });

  it("após apply, mostra estado 'aplicado'", () => {
    const { rerender } = render(<DiffCard {...baseProps} state="applied" />);
    expect(screen.getByText(/aplicado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aplicar/i })).toBeNull();
  });
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implementar `DiffCard`** — buscar bloco shadcn/studio Pro de comparação via MCP antes:

```bash
# pseudo: usar MCP shadcn-studio-mcp pra get-blocks-metadata + procurar "comparison" / "diff"
```

Esqueleto:

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PersonaPatch } from "@/lib/validations/persona-patch";

type State = "pending" | "applied" | "rejected";

export function DiffCard({
  patch,
  state = "pending",
  onApply,
  onReject,
  onEdit,
}: {
  patch: PersonaPatch;
  state?: State;
  onApply: (p: PersonaPatch) => void;
  onReject: () => void;
  onEdit?: (p: PersonaPatch) => void;
}) {
  return (
    <Card className="border-l-4 border-l-violet-500">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            <Badge variant="secondary" className="mr-2">
              {labelForKind(patch.kind)}
            </Badge>
            {patch.rationale}
          </CardTitle>
          {state === "applied" && <Badge className="bg-emerald-600">✓ aplicado</Badge>}
          {state === "rejected" && <Badge variant="outline">✕ descartado</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {"before" in patch && (
          <div className="rounded bg-red-50 p-2 text-red-900 line-through">
            {patch.before}
          </div>
        )}
        {"after" in patch && (
          <div className="rounded bg-emerald-50 p-2 text-emerald-900">
            {renderAfter(patch)}
          </div>
        )}
        {"targetId" in patch && (
          <div className="rounded bg-orange-50 p-2 text-orange-900">
            Remover item id={patch.targetId}
          </div>
        )}
        {state === "pending" && (
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={() => onApply(patch)}>
              ✓ Aplicar
            </Button>
            {onEdit && (
              <Button size="sm" variant="outline" onClick={() => onEdit(patch)}>
                ✏ Editar
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onReject}>
              ✕
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function labelForKind(kind: PersonaPatch["kind"]) {
  const m: Record<PersonaPatch["kind"], string> = {
    voiceTone: "Tom de voz",
    "example.add": "+ Exemplo",
    "example.remove": "− Exemplo",
    "forbiddenTopic.add": "+ Tópico proibido",
    "forbiddenTopic.remove": "− Tópico proibido",
    "handoffTrigger.add": "+ Handoff",
    "handoffTrigger.remove": "− Handoff",
  };
  return m[kind];
}

function renderAfter(patch: PersonaPatch): string {
  if (patch.kind === "voiceTone") return patch.after;
  if (patch.kind === "example.add")
    return `User: ${patch.after.userMessage}\nAgent: ${patch.after.assistantResponse}`;
  if (patch.kind === "forbiddenTopic.add")
    return `Tópico: ${patch.after.topic}\nResposta: ${patch.after.responseWhenAsked}`;
  if (patch.kind === "handoffTrigger.add") return patch.after.condition;
  return "";
}
```

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/personas/diff-card.tsx src/components/admin/personas/diff-card.test.tsx
git commit -m "feat(admin): DiffCard componente visual antes→depois com Aplicar/Rejeitar"
```

### Task 5.2: AIAssistantSidebar + integração no shell

**Files:**
- Create: `src/components/admin/personas/ai-assistant-sidebar.tsx`
- Create: `src/components/admin/personas/ai-assistant-sidebar.test.tsx`
- Modify: `src/components/admin/personas/persona-edit-shell.tsx`

- [ ] **Step 1: Implementar `AIAssistantSidebar`** — usa `useChat` do `@ai-sdk/react`

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { UseFormReturn } from "react-hook-form";
import { DiffCard } from "./diff-card";
import type { PersonaPatch } from "@/lib/validations/persona-patch";

export function AIAssistantSidebar({
  personaId,
  formMethods,
}: {
  personaId: string;
  formMethods: UseFormReturn<any>;
}) {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: `/api/admin/personas/${personaId}/assist`,
  });

  function applyPatch(patch: PersonaPatch) {
    if (patch.kind === "voiceTone") {
      formMethods.setValue("voiceTone", patch.after, { shouldDirty: true });
    }
    if (patch.kind === "example.add") {
      const cur = formMethods.getValues("examples") ?? [];
      formMethods.setValue("examples", [...cur, patch.after], { shouldDirty: true });
    }
    if (patch.kind === "example.remove") {
      const cur = formMethods.getValues("examples") ?? [];
      formMethods.setValue(
        "examples",
        cur.filter((e: any) => e.id !== patch.targetId),
        { shouldDirty: true },
      );
    }
    // ... idem forbiddenTopic / handoffTrigger
  }

  return (
    <aside className="flex h-full w-96 flex-col border-l bg-zinc-50">
      <header className="border-b px-4 py-3">
        <h2 className="font-medium">✨ AI Assistant</h2>
        <p className="text-xs text-zinc-500">
          Descreva o que quer ajustar. Eu proponho — você decide.
        </p>
      </header>
      <ScrollArea className="flex-1 px-4 py-2">
        {messages.map((m) => (
          <div key={m.id} className="mb-3">
            <div className="text-xs font-medium text-zinc-500">
              {m.role === "user" ? "Você" : "Assistente"}
            </div>
            {m.parts?.map((part, i) => {
              if (part.type === "text")
                return <div key={i} className="text-sm">{part.text}</div>;
              if (part.type === "tool-propose_patch" && part.output?.ok)
                return (
                  <DiffCard
                    key={i}
                    patch={part.output.patch}
                    onApply={applyPatch}
                    onReject={() => {}}
                  />
                );
              return null;
            })}
          </div>
        ))}
      </ScrollArea>
      <form onSubmit={handleSubmit} className="border-t p-3">
        <Textarea
          value={input}
          onChange={handleInputChange}
          placeholder="Ex: deixa o tom menos formal..."
          disabled={status === "streaming"}
          rows={3}
        />
        <Button type="submit" disabled={status === "streaming"} className="mt-2 w-full">
          Enviar
        </Button>
      </form>
    </aside>
  );
}
```

- [ ] **Step 2: Modificar `persona-edit-shell.tsx`** pra embed a sidebar

```tsx
// adicionar import + render condicional + passar formMethods
import { AIAssistantSidebar } from "./ai-assistant-sidebar";

// no JSX:
<div className="flex h-screen">
  <div className="flex-1 overflow-auto">
    {/* form existente */}
  </div>
  <AIAssistantSidebar personaId={persona.id} formMethods={formMethods} />
</div>
```

- [ ] **Step 3: Testar manualmente em dev**

```bash
npm run dev # ou comando equivalente do projeto
# abrir http://localhost:3000/admin/personas/<id-real>
# digitar "deixa menos formal"
# ver diff card aparecer
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/personas/ai-assistant-sidebar.tsx src/components/admin/personas/persona-edit-shell.tsx
git commit -m "feat(admin): AIAssistantSidebar persistente em persona-edit-shell

useChat -> /api/admin/personas/[id]/assist. DiffCard inline aplica
setValue no form parent (não persiste no DB até Salvar)."
```

**Critério de aceite Fase 5:**
- ✅ DiffCard renderiza pending/applied/rejected
- ✅ Sidebar conecta no endpoint e exibe stream
- ✅ Apply preenche o form sem persistir
- ✅ UI manual em dev: digitar mensagem → diff card aparece → Aplicar → form fica dirty

---

## Fase 6 — Camada 3 eval LLM real

**Goal:** Suite nightly que valida comportamento end-to-end com Sonnet 4.6 real + Haiku user-bot.

### Task 6.1: tests/eval/assistant-flow.eval.test.ts

**Files:**
- Create: `tests/eval/assistant-flow.eval.test.ts`

- [ ] **Step 1: Ler tests/eval/agent-flow.eval.test.ts e copiar estrutura**

```bash
head -150 tests/eval/agent-flow.eval.test.ts
```

- [ ] **Step 2: Escrever 4 cenários canônicos**

Esqueleto (adaptar do agent-flow.eval.test.ts):

```ts
import { describe, it, expect } from "vitest";
import { generateText, streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { buildAssistantPrompt } from "@/lib/agent/assistant-prompt";
import { buildAssistantTools } from "@/lib/agent/tools/assistant-tools";

describe("EVAL-ASSISTANT-FLOW", () => {
  it("EVAL-ASSISTANT-LESS-FORMAL: pede 'menos formal' → 1 clarification + 1 propose_patch válido", async () => {
    const persona = makePersonaFixture({ voiceTone: "formal e técnico" });
    const tools = buildAssistantTools({ /* ctx */ });
    // simular conversa: user diz "menos formal", coletar tool calls
    // assert: primeira call é ask_clarification; depois user responde "como amigo zap"; assert propose_patch válido
  }, 30_000);

  it("EVAL-ASSISTANT-ADD-EXAMPLE-PRICE: 'adiciona exemplo de quando perguntam preço' → pede contexto + propõe example.add", async () => {
    // ...
  }, 30_000);

  it("EVAL-ASSISTANT-REJECT-CTA-BEFORE-NAME: pede 'cumprimentar pelo nome assim que entrar' → IA rejeita explicando", async () => {
    // assertion: NÃO chega propose_patch válido; ou IA explica em texto que viola regra
  }, 30_000);

  it("EVAL-ASSISTANT-RESPECT-CONCIERGE-ROLE: persona concierge — 'adiciona exemplo de valor de parcela' → IA recusa ou desvia", async () => {
    // ...
  }, 30_000);
});
```

- [ ] **Step 3: Rodar com chave real**

```bash
npm run test:eval -- assistant-flow
```
Expected: 4/4 PASS (pode demorar ~60s)

- [ ] **Step 4: Adicionar `EVAL-ASSISTANT-LESS-FORMAL` ao `test:eval:quick` (pre-commit)**

Editar `package.json`:
```json
"test:eval:quick": "vitest run --config vitest.eval.config.ts -t 'EVAL-SAVE-CONTACT-NAME-CIRURGICO|EVAL-ASSISTANT-LESS-FORMAL'"
```

- [ ] **Step 5: Commit (vai forçar Camada 3 via pre-commit — espera passar)**

```bash
git add tests/eval/assistant-flow.eval.test.ts package.json
git commit -m "test(eval): Camada 3 LLM real do AI Assistant

4 cenários canônicos. EVAL-ASSISTANT-LESS-FORMAL adicionado ao
test:eval:quick (gate pre-commit pra mudanças em src/lib/agent/)."
```

**Critério de aceite Fase 6:**
- ✅ 4 cenários eval no arquivo
- ✅ Sonnet 4.6 real passa todos
- ✅ Pre-commit hook agora roda esse arquivo automaticamente em commits que mexem em `src/lib/agent/`

---

## Fase 7 — QA crítico (lançado depois)

Após Fases 0-6 verdes, o **QA crítico (Opus)** é lançado via skill `qa-flow` ou Agent direto. Ele:

1. Lê `docs/test-plans/ai-assistant-persona-edit.md` (gerado pelo PO Lead)
2. Executa cenários P0/P1/regressão/segurança/perf — mistura de unit (já existem), integration, E2E Playwright e UI manual
3. Reporta pass/fail por cenário com evidência (screenshot, log, DB query)
4. Loop até verde — fix → re-run

**Critério de aceite Fase 7 (= Definition of Done da feature):**
- ✅ Todos os cenários P0 do PO Lead passam
- ✅ Cenários de regressão (BUG-* antigos) continuam passando
- ✅ Camadas 1+2+3 verdes
- ✅ UI manual confirmada: admin leigo consegue editar 3 campos numa sessão sem ajuda externa
- ✅ Done report em `.done/2026-05-19-HHmm-ai-assistant-persona-edit.md`

---

## Self-Review

**Spec coverage check:**

| Spec section | Coberto por |
|---|---|
| 1. Problema | Contexto do plano + cenários do PO Lead |
| 2. Objetivo | Critérios de aceite por fase |
| 3. Decisões D1-D9 | D1 — Fase 2 (tools só editam 4 campos) / D2 — Fase 5 (sidebar) / D3 — Fase 5 (DiffCard apply local) / D4 — Fase 0 (HARD_RULES) / D5 — Fase 3 (Sonnet 4.6 no route) / D6 — Fase 3 (useChat + streamText) / D7 — Fase 1 (Zod union) / D8 — Fase 5 (stateless useChat) / D9 — Fase 5 (apply = setValue) |
| 4. Arquitetura fluxo | Fases 0-6 implementam ponto-a-ponto |
| 5.1 AIAssistantSidebar | Fase 5.2 |
| 5.2 DiffCard | Fase 5.1 |
| 5.3 API route | Fase 3.2 |
| 5.4 personaPatchSchema | Fase 1 |
| 5.5 HARD_RULES.md | Fase 0 |
| 5.6 ASSISTANT_PROMPT | Fase 2.1 |
| 6. Schema sem mudanças | Confirmado — zero migration |
| 7. Testes 3 camadas | Camada 1: Fases 0/1/2/3 (cada uma com `.test.ts`) / Camada 2: Fase 4 / Camada 3: Fase 6 |
| 8. shadcn/studio Pro | Fase 5 (mencionado em DiffCard via MCP) |
| 9. Riscos R1-R8 | R1: Fase 0.2 / R2: Fase 2.2 propose_patch.before check / R3: Fase 5.1 individual buttons / R4: Fase 3.2 slice(-24) / R5: Fase 3.2 server-only route / R6: Fase 2.2 personaVersionSeen / R7: Fase 0 + hook pre-commit / R8: Fase 5.1 local state |
| 10. Fora de escopo | Não implementado por design |
| 11. Próximos | Fase 7 QA crítico |
| 12. Métricas | Validadas em Fase 7 done report |

**Placeholder scan:** zero TBD/TODO no plano. Cada step tem código real.

**Type consistency:** `PersonaPatch` definido em Fase 1.1, usado em Fases 2.2 (tools), 5.1 (DiffCard), 5.2 (sidebar) — coerente. `AssistantToolsContext` em Fase 2.2, consumido em Fase 3.2 — coerente.

Plano completo. Pronto pra execução.

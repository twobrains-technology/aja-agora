# Spec — AI Assistant no Cadastro/Edição de Agente (Persona)

**Data**: 2026-05-19
**Branch**: feat/ai-assistant-persona-edit (a criar)
**Operador**: Kairo
**Status**: Aguardando review

---

## 1. Problema

O backoffice do aja-agora permite que admin edite o comportamento das personas (agentes) através de campos estruturados — `voiceTone`, `examples` (few-shot), `forbiddenTopics`, `handoffTriggers`. Mas esses campos exigem **conhecimento técnico** de prompt engineering, formato de few-shot, e das regras hard do produto (`BUG-NO-CTA-AFTER-NAME`, fluxo de gates pré-valor, frases proibidas, persona/category constraints).

Sintomas observados:
- Admin leigo escreve `voiceTone` genérico ("seja simpático") sem instrução acionável → comportamento do agent não muda
- Admin não sabe escrever `PersonaExample` no formato correto (`whenExpertise`, `whenChannel`, `userMessage`, `agentReply`) → exemplo vira lixo no few-shot
- Admin adiciona instrução que viola HARD_RULES — ex: "sempre cumprimente pelo nome" colide com `BUG-NO-CTA-AFTER-NAME` → regressão em prod
- Bruna (PO) hoje precisa pedir pro engenheiro traduzir feedback em mudança de prompt — gargalo

A IA conversacional do produto **resolve** desambiguação pro usuário final. Mas o admin que **configura** essa IA não tem o mesmo suporte. Inversão de assimetria.

## 2. Objetivo

Adicionar um **AI Assistant** persistente como sidebar na tela de edição da persona (`/admin/personas/[id]`). Admin descreve em linguagem natural o que quer mudar; o assistant:

1. **Desambigua** quando a intenção é vaga ("menos formal" → casual zap vs. corporate brando vs. técnico mas próximo?)
2. **Traduz** intenção em **patch estruturado** sobre os campos do `PersonaRow` (voiceTone, examples, forbiddenTopics, handoffTriggers)
3. **Valida** cada patch contra `HARD_RULES.md` antes de propor — proposta inválida vira pedido de revisão pra IA, nunca chega no diff card
4. **Apresenta** o patch como **diff card** (antes → depois) com botões `Aplicar` / `Editar` / `Rejeitar`. Nada vai pro banco sem confirmação humana.

Métrica de sucesso (esperada): tempo de admin pra ajustar um agent cai de ~30min (escrever exemplo na mão + testar) pra ~3min (descrever intenção + aprovar 2-3 diffs).

## 3. Decisões arquiteturais (aprovadas)

| # | Decisão | Justificativa |
|---|---------|---------------|
| D1 | **Escopo comportamental**: edita `voiceTone`, `examples`, `forbiddenTopics`, `handoffTriggers`. Exclui `activeTools` (técnico — leigo não escolhe) e `activeCampaigns` (operacional — marketing) | Risco de leigo desligar tool crítica via prompt natural é alto |
| D2 | **Sidebar lateral persistente** (padrão Cursor/Copilot) — chat ao lado do form. Diff cards aparecem inline no chat | Contexto sempre visível; user vê form + proposta simultâneo |
| D3 | **Diff cards com Aplicar/Editar/Rejeitar individuais** — nada vai pro form sem confirm humano. Aplicar = `setValue` no react-hook-form (não persiste no banco até Salvar do form) | Leigo aprende vendo tradução prompt→estrutura; controle granular evita aplicar 5 mudanças erradas em batch |
| D4 | **HARD_RULES.md resumido como contexto** (`src/lib/agent/HARD_RULES.md`, ~500 linhas) com regras críticas extraídas de `system-prompt.ts`. IA recebe esse doc + valida cada proposta antes de exibir o diff. Reutilizável em onboarding e docs | system-prompt.ts inteiro custaria ~12k tokens/turn; HARD_RULES focado em proibições/fluxos obrigatórios é suficiente e mantém manutenção centralizada |
| D5 | **Modelo: Sonnet 4.6** via `@ai-sdk/anthropic` | Desambiguação requer raciocínio sobre regras de negócio; Haiku falha em few-shot de alta qualidade |
| D6 | **Streaming via `useChat` + tool calling** — assistant é um agent com tools `propose_patch`, `ask_clarification`, `validate_against_rules`. Sai do mesmo SDK do chat de produção | Reuso de padrão e de telemetria; useChat é o canônico do projeto |
| D7 | **Patch como schema Zod discriminado por campo** — `PersonaPatch = VoiceTonePatch \| ExampleAddPatch \| ExampleRemovePatch \| ForbiddenTopicAddPatch \| ...` | Type-safe ponta-a-ponta; AI SDK valida `tool.inputSchema` antes de chegar no client |
| D8 | **Conversa não persiste entre sessões** — drop ao sair da página. Sem histórico cross-tab | MVP simples; assistant é ferramenta, não memória |
| D9 | **Apply ≠ Save** — Aplicar diff card só preenche o react-hook-form. Persistir requer click no `Salvar` do form (que já existe e dispara `invalidateAgentCache`) | Mantém um único gate de escrita no banco; assistant não vira atalho pra contornar validação do form |

## 4. Arquitetura — fluxo end-to-end

```
ADMIN abre /admin/personas/abc-123
      │
      ▼
TELA renderiza: <PersonaEditShell>
  ├─ <PersonaEditForm>           (form react-hook-form existente)
  └─ <AIAssistantSidebar>        (NOVO — chat persistente)
      │
      ▼
ADMIN digita "deixa ele menos formal, fala como amigo no zap"
      │
      ▼
useChat → POST /api/admin/personas/[id]/assist
      │
      ▼
streamText com:
  - system prompt: ASSISTANT_PROMPT + HARD_RULES.md + ficha da persona atual
  - tools: ask_clarification, propose_patch, validate_against_rules
  - messages: histórico da conversa
      │
      ▼
LLM raciocina → chama tool propose_patch({
  field: "voiceTone",
  before: "<atual do row>",
  after: "<sugestão estruturada>",
  rationale: "<1 linha explicando>"
})
      │
      ▼
propose_patch.execute() roda VALIDATE contra HARD_RULES:
  - voiceTone não pode conter frase proibida da lista
  - examples não podem violar BUG-NO-CTA-AFTER-NAME (regex)
  - patch.before deve casar com row atual (anti-stale)
  │
  ├─ válido → retorna patch ao client
  └─ inválido → retorna error → LLM tenta de novo (até 2x)
      │
      ▼
CLIENT recebe tool result → renderiza <DiffCard>
      │
      ▼
ADMIN clica [Aplicar]
      │
      ▼
useForm.setValue("voiceTone", patch.after, { shouldDirty: true })
      │
      ▼
form fica dirty → Salvar habilitado → admin clica Salvar → PATCH /api/admin/personas/[id]
      │
      ▼
invalidateAgentCache(id) → próxima conversa usa nova versão
```

## 5. Componentes — boundaries

### 5.1. `AIAssistantSidebar` (client, novo)
**Path**: `src/components/admin/personas/ai-assistant-sidebar.tsx`
**Responsabilidade**: Renderiza o chat lateral. Recebe `formMethods: UseFormReturn<PersonaFormValues>` da tela pai pra aplicar patches no form.
**State**: useChat do `@ai-sdk/react` apontando pra `/api/admin/personas/[id]/assist`.
**Dependências**: form parent, persona atual, lista de campos editáveis (D1).

### 5.2. `DiffCard` (client, novo)
**Path**: `src/components/admin/personas/diff-card.tsx`
**Responsabilidade**: Renderiza um patch (`field`, `before`, `after`, `rationale`) com 3 botões. Visual claro pro leigo (antes em vermelho riscado, depois em verde).
**Estados**: `pending` (mostra botões), `applied` (mostra "✓ aplicado"), `rejected` (mostra "✕ descartado").
**Interface**: `onApply(patch) → void` / `onEdit(patch) → openInlineEditor()` / `onReject(patch) → void`.

### 5.3. `/api/admin/personas/[id]/assist` (server route, novo)
**Path**: `src/app/api/admin/personas/[id]/assist/route.ts`
**Responsabilidade**: Recebe POST com histórico + nova mensagem. Carrega persona do DB, monta system prompt com `HARD_RULES.md` + ficha. Chama `streamText` com tools. Retorna SSE.
**Validação**: `requireAdmin(session)` (padrão já em uso); rate limit (10 req/min/admin).
**Tools registradas** (factory com closure pra `personaId`):
- `ask_clarification(question: string)` — IA pergunta de volta antes de propor
- `propose_patch(patch: PersonaPatch)` — valida + retorna ao client
- `validate_against_rules(text: string, field: string)` — utility tool pra IA checar antes de propor

### 5.4. `personaPatchSchema` (lib, novo)
**Path**: `src/lib/validations/persona-patch.ts`
**Responsabilidade**: Zod discriminated union dos patches possíveis. Reusado no `tool.inputSchema` e no client.

```ts
const personaPatchSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("voiceTone"),
    before: z.string(),
    after: z.string().max(2000),
    rationale: z.string().max(280),
  }),
  z.object({
    kind: z.literal("example.add"),
    after: personaExampleSchema, // já existe
    rationale: z.string().max(280),
  }),
  z.object({
    kind: z.literal("example.remove"),
    targetId: z.string().uuid(),
    rationale: z.string().max(280),
  }),
  z.object({
    kind: z.literal("forbiddenTopic.add"),
    after: personaForbiddenTopicSchema, // já existe
    rationale: z.string().max(280),
  }),
  // ... idem remove, handoffTrigger.add/remove
]);
```

### 5.5. `HARD_RULES.md` (doc, novo)
**Path**: `src/lib/agent/HARD_RULES.md`
**Conteúdo**: Extrato das regras hard do `system-prompt.ts`:
- **Proibições absolutas** (frases proibidas com regex): "Vamos achar a opção certa", "Reavaliando", "Motivo:", etc — lista vinda dos cassettes Camada 2
- **Fluxo obrigatório de gates pré-valor**: experience → timeframe → lance (não pular)
- **Constraints por field**:
  - `voiceTone`: nunca pode instruir o agent a "cumprimentar antes da save_contact_name" → colide com BUG-SAVE-CONTACT-NAME-MUST-FIRE
  - `examples`: cada `agentReply` deve passar pela mesma checagem de frases proibidas
  - `forbiddenTopics`: não pode incluir tópicos canônicos do funil (consórcio, simulação)
  - `handoffTriggers`: só ativa quando user explicitamente pede humano
- **Constraints por persona**:
  - Concierge (role=concierge): não pode dar valor de parcela — só specialist
  - Specialist auto: não fala de imóvel; specialist imóvel não fala de auto

**Quem mantém**: `HARD_RULES.md` é **escrito manualmente** como fonte humana das regras críticas. A fonte programática é `system-prompt.ts` + os cassettes em `tests/regression/agent-trajectory.test.ts`. O teste `src/lib/agent/HARD_RULES.test.ts` confere a **sincronia** entre eles: toda frase proibida que aparece em algum cassette (Camada 2) deve aparecer também em `HARD_RULES.md`. Divergência quebra PR — força quem mexer em prompt/cassette a atualizar o doc no mesmo commit.

### 5.6. `ASSISTANT_PROMPT` (lib, novo)
**Path**: `src/lib/agent/assistant-prompt.ts`
**Conteúdo**: System prompt do AI Assistant — diferente do prompt do agent de produção. Foco:
- "Você é um assistente que ajuda admins **leigos** a configurar agents de consórcio"
- "Sempre desambigue antes de propor — use `ask_clarification` se ambíguo"
- "Toda proposta DEVE passar pelo `validate_against_rules` antes de virar `propose_patch`"
- "Linguagem simples, sem jargão de prompt engineering"
- Injeta `HARD_RULES.md` e ficha da persona (`displayName`, `role`, `category`, `expertise`, examples atuais, etc).

## 6. Schema — sem mudanças no DB

Não cria tabelas novas. AI Assistant é stateless por design (D8). Conversa vive na memória do browser via `useChat`. Patches só persistem quando admin clica `Salvar` no form (que usa rota existente).

**Impacto**: zero migration. Zero risco de schema drift.

## 7. Testes — 3 camadas obrigatórias (CLAUDE.md)

### Camada 1 — Structural (PR gate, ~1s/arquivo)
- `src/lib/validations/persona-patch.test.ts` — schema Zod aceita todos discriminantes válidos; rejeita malformados
- `src/lib/agent/HARD_RULES.test.ts` — toda frase proibida em `agent-trajectory.test.ts` (Camada 2 atual) aparece também em `HARD_RULES.md` (falha = doc rotted)
- `src/lib/agent/assistant-prompt.test.ts` — prompt menciona "desambigue", "valide antes", referencia HARD_RULES; tools registradas no factory
- `src/app/api/admin/personas/[id]/assist/route.test.ts` — `requireAdmin` enforça 401 sem session; rate limit dispara após 10 req

### Camada 2 — Trajectory snapshots (PR gate, ~500ms)
Adicionar **5 cassettes** ao `tests/regression/agent-trajectory.test.ts` com namespace `BUG-ASSISTANT-*`:
- `BUG-ASSISTANT-AMBIGUOUS-MUST-ASK` — admin diz "menos formal", IA precisa chamar `ask_clarification` (não `propose_patch` direto)
- `BUG-ASSISTANT-PROPOSAL-MUST-VALIDATE` — IA propõe patch que viola HARD_RULE → `validate_against_rules` rejeita → IA tenta de novo
- `BUG-ASSISTANT-NO-CTA-LEAK` — IA não pode sugerir voiceTone contendo "Vamos achar a opção certa"
- `BUG-ASSISTANT-RESPECT-PERSONA-ROLE` — IA não pode propor exemplo de "valor de parcela" em persona concierge
- `BUG-ASSISTANT-DIFF-BEFORE-MATCHES-CURRENT` — IA inclui `before` exato (não inventa) — se row mudou no meio, IA precisa re-fetch

### Camada 3 — LLM real eval (nightly, ~30s)
- `tests/eval/assistant-flow.eval.test.ts` (Sonnet 4.6 como assistant + Haiku 4.5 como user-bot)
- Cenários canônicos:
  - "deixa menos formal" → assistant faz 1 clarification + 1 propose_patch válido em voiceTone
  - "adiciona exemplo de quando perguntam preço" → assistant pede contexto (qual preço? parcela? lance?) + propõe `example.add` válido
  - "remove o tópico proibido de comissão" → assistant identifica targetId existente + propõe `forbiddenTopic.remove`
  - "bota pra cumprimentar pelo nome assim que entrar" → assistant **rejeita** (viola HARD_RULE) e explica o porquê pro leigo
- Pré-commit hook já força esse arquivo via mudança em `tests/eval/` (regra já existe em `.husky/pre-commit`)

### Integration (opcional, manual)
- `src/app/api/admin/personas/[id]/assist/route.integration.test.ts` — sobe DB de teste, cria persona, faz POST, verifica que stream chega com tool result

## 8. Design system — shadcn/studio Pro (OBRIGATÓRIO)

Por CLAUDE.md do projeto, todo layout novo usa blocos Pro via MCP. Para esta feature:

- **Layout sidebar**: inspiração de `application-shell` (já mapeado pra Phase 3 do projeto). Não criar split-pane do zero.
- **Chat UI dentro da sidebar**: `/rui` (Refine UI) sobre `Card`, `ScrollArea`, `Textarea`, `Button`. Padrão de chat do `useChat` é simples — não precisa bloco de chat dedicado.
- **Diff card**: `/rui` sobre `Card` + variantes Pro. Buscar bloco `comparison-card` ou similar antes de codar.
- **Botão flutuante "✨ AI Assistant"** (caso sidebar esteja collapsed em telas estreitas): `Sheet` do shadcn/ui base é suficiente.

**Buscar via MCP** (`get-blocks-metadata`) antes de implementar qualquer um desses.

## 9. Riscos identificados

| # | Risco | Mitigação |
|---|-------|-----------|
| R1 | LLM gera patch que viola HARD_RULE e mesmo assim passa porque a regra não tá no doc | Test Camada 1 (`HARD_RULES.test.ts`) garante sincronia com cassettes da Camada 2 — divergência quebra PR |
| R2 | LLM inventa `before` (não bate com row atual) → admin aplica e perde dado | Server valida `patch.before === row[field]` em `propose_patch.execute`; mismatch → erro → LLM re-tenta |
| R3 | Admin aplica 5 diffs sem revisar e quebra a persona | Diffs são individuais (D3); não há "Aplicar tudo". Form fica dirty antes de Salvar — admin vê preview no próprio form. |
| R4 | Custo de token alto se conversa fica longa | Limita histórico ao últimos 12 turns no server route; HARD_RULES.md custa ~3k tokens (aceito) |
| R5 | Vazamento de chave Anthropic no client | Endpoint server-only; client só fala com `/api/admin/personas/[id]/assist`. `ANTHROPIC_API_KEY` nunca vai pro browser |
| R6 | Race condition: outro admin edita a persona enquanto este conversa com IA | Server lê `version` do `personas` row no início do POST e passa como contexto pro LLM. Patch carrega `personaVersionSeen` no schema; server valida `personaVersionSeen === row.version` antes de retornar o patch ao client. Mismatch → resposta com erro estruturado → assistant fala "a persona foi editada por outro admin, recarregue a tela" |
| R7 | LLM regride se `HARD_RULES.md` ficar desatualizado | Test Camada 1 + responsabilidade de quem mexe em `system-prompt.ts` atualizar `HARD_RULES.md` no mesmo commit (CLAUDE.md já força Camada 3 nesse path) |
| R8 | Admin reverte clicando Rejeitar mas LLM já "achou" que aplicou (state desalinhado) | Diff card é local ao client; backend não persiste estado. Reject só esconde o card. |

## 10. Fora de escopo (MVP)

- Persistir conversa entre sessões (D8). Eventual: gravar `assistant_sessions` table se admin pedir.
- Undo após aplicar (granular). Atual: descartar form sem Salvar = perde mudança.
- Editar `activeTools` ou `activeCampaigns` via IA (D1).
- "Aplicar tudo" em batch.
- Assistant cross-persona ("clone a voiceTone da persona X pra Y").
- Geração de persona inteira do zero ("crie uma persona pra moto"). Continua via form manual.
- Histórico de patches aplicados (audit log) — fora de escopo; se quiser, vira tabela `persona_patch_log` numa V2.

## 11. Próximos passos sugeridos

Após aprovação deste spec, invocar `superpowers:writing-plans` para detalhar:
- Ordem de implementação (HARD_RULES.md primeiro → schema → route → componente → tests)
- Migration plan se houver (nenhuma esperada)
- Critérios de aceite verificáveis por fase
- Plano de teste do QA Lead (Opus) com cenários happy/edge/regressão

## 12. Métricas esperadas (pós-deploy)

- Tempo médio de admin pra ajuste de persona: ~30min → ~3min
- Patches aplicados por sessão: 2-5 (mediana esperada)
- Taxa de rejeição de patch (admin clica ✕): < 30% (sinaliza que LLM tá desambiguando bem)
- Quebras de HARD_RULE detectadas em prod pós-feature: **zero** (validação server-side é gate duro)

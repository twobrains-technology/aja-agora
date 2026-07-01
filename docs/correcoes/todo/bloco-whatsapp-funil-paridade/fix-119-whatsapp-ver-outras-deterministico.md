---
id: FIX-119
titulo: "WhatsApp: \"Ver outras opções\" do card de decisão = determinístico (buildOtherOptions)"
status: todo
severidade: media
bloco: bloco-whatsapp-funil-paridade
arquivos: [src/lib/whatsapp/interactive-handlers.ts, src/lib/whatsapp/formatter.ts]
rodada: 2026-07-01 — auditoria código×jornada (Mapa em docs/jornada/jornada-canonica.md)
---

## Origem (auditoria D22 — voz do operador na jornada canônica)

Divergência **D22** do Mapa em `docs/jornada/jornada-canonica.md`, rodada de auditoria
código×jornada de 2026-07-01. Severidade **P2**. A **REGRA** (a voz do operador na
jornada) é:

> **Passo 5** — "Ver outras opções" é o **comparativo DETERMINÍSTICO das ofertas REAIS**
> da descoberta. No web isso é `buildOtherOptions` (surfacing das outras 2 ofertas reais
> do cache do adapter, com dedupe e exclusão da recomendada) — **zero free-run do modelo,
> zero dado inventado** (docstring de `src/lib/bevi/other-options.ts:1-5`). O usuário deve
> ver as MESMAS ofertas reais que já estão no contexto, não uma reinterpretação do modelo.

O web já obedece (`route.ts` → `buildOtherOptions`). No **WhatsApp o botão
`decision_outras` do card de decisão não tem handler** e o clique vira **texto livre pro
modelo** — risco de o modelo alucinar/reformular ofertas ou simplesmente não surfaçar as
ofertas reais determinísticas. A regra deste card é **paridade com o comportamento web já
correto**.

## Cenário exato (comportamento divergente HOJE)

- **Canal:** WhatsApp (interativo).
- **Passos:** 1) Usuário chega ao passo 4→5 e recebe o card de decisão "Esse plano faz
  sentido para você?" (3 botões). 2) Clica em **"Ver outras opções"** (botão id
  `decision_outras`). 3) Em vez de receber o comparativo determinístico das ofertas reais,
  o clique cai no **processamento de texto livre** e o modelo conduz a resposta por conta
  própria — pode reformular, omitir ou fabricar valores em vez de repetir as ofertas reais
  da descoberta.
- **Evidência (file:line):**
  - `src/lib/whatsapp/formatter.ts:1244-1260` — `decisionPromptToWhatsApp`: os 3 botões são
    emitidos com `id: decision_${o.intent}` (`:1255`), logo "Ver outras opções" vira
    `decision_outras`. O comentário `:1241-1243` **admite** o gap: *"os títulos (≤20 chars)
    caem no processamento de texto (sem handler dedicado)"*.
  - `src/lib/whatsapp/interactive-handlers.ts:99-124` — `dispatchInteractiveReply` **não tem
    nenhum branch `decision_`** (só `show_others`, `interest_`, `offer_reject`,
    `contract_*`, `offer_*`, gates). Para `decision_outras` cai no `return false` (`:124`).
  - `src/lib/whatsapp/processor.ts:223-224` — fallback: `if (!handled)` →
    `processTextMessage(from, replyTitle=...)`. O texto "Ver outras opções" não bate em
    `/reset`/identify/contract-capture → chega em `processWithOrchestrator` (`processor.ts:181`)
    = **turno livre do modelo**.
  - **Web CORRETO** — `src/app/api/chat/route.ts:521-548`
    (`body.action?.kind === "show-other-options"`) → `buildOtherOptions(conversationId, meta)`
    → escreve `others.text` + emite `comparison_table` com `others.groups` (ofertas reais).
    O botão web dispara essa action em `src/components/chat/artifacts/decision-prompt.tsx:30-31`
    (`intent === "outras"` → `sendAction({ kind: "show-other-options", label }, label)`).

## Esperado × Atual

- **Esperado (paridade web):** clicar "Ver outras opções" no card de decisão do WhatsApp
  dispara o **mesmo caminho determinístico** `buildOtherOptions` — surfaça as outras ofertas
  REAIS da descoberta (texto + `comparison_table`), exatamente como o web, sem passar pelo
  modelo.
- **Atual:** `decision_outras` não tem handler → cai em `processTextMessage` → o modelo
  recebe "Ver outras opções" como texto livre e conduz a resposta (risco de alucinar/omitir
  as ofertas reais).

## Root cause (INVESTIGADO — provado no código atual)

Confirmado lendo este worktree (não é gap já resolvido por FIX-113/114/115):

- O card de decisão no WhatsApp está **correto na emissão**: `decisionPromptToWhatsApp`
  (`formatter.ts:1244-1260`) gera o botão `decision_outras` com o `waTitle` "Ver outras
  opções" (`DECISION_PROMPT_OPTIONS[1]` em `src/lib/chat/types.ts:200`). O defeito **não** é
  o botão — é a **ausência de handler** pro clique.
- `dispatchInteractiveReply` (`interactive-handlers.ts:90-125`) roteia por prefixo/igualdade
  de `replyId`, mas **não cobre o prefixo `decision_`**. `decision_outras` (e os irmãos
  `decision_contratar`/`decision_especialista`) escorregam pro `return false` (`:124`).
- `processor.ts:223-224`: sem handler, o dispatcher devolve `false` e o processor faz
  fallback pra `processTextMessage(from, replyTitle)`. Em `processTextMessage` (`:40-182`)
  "Ver outras opções" não casa com nenhum captor determinístico (`/reset` `:47`, identify
  `:97-134`, contract-capture `:138-166`) → cai no `processWithOrchestrator` (`:181`) = turno
  livre do modelo. É exatamente o "risco de alucinar/não surfaçar as ofertas reais" da D22.
- O caminho determinístico **já existe e é compartilhado**: `buildOtherOptions(conversationId,
  meta)` em `src/lib/bevi/other-options.ts:34-...` retorna `{ text, groups }` a partir do
  cache do adapter da conversa (mesma seleção/dedupe/exclusão-da-recomendada que o web usa).
  Só falta o WhatsApp chamá-lo no clique — o WhatsApp já sabe **enviar** um `comparison_table`
  via `comparisonTableToWhatsApp(payload)` (`formatter.ts:139` / `artifactToWhatsApp`
  `:1199-1207`) + `sendInteractiveMessage`/`sendTextMessage` (`api.ts:62,149`), como faz o
  adapter em `adapter.ts:153-169`.
- **Nota de contraste (não confundir):** o botão "Ver outras opções" do **card da
  recomendada** (`show_others`, FIX-108) tem handler `handleShowOthers` (`:557-561`), mas ele
  **delega ao modelo** via `processTextMessage(from, "Quero ver outras opções")` — também NÃO
  é determinístico. Este fix (D22) é sobre o **card de decisão** e prescreve explicitamente o
  caminho `buildOtherOptions`, **não** copiar a delegação textual do `handleShowOthers`.

## Correção proposta (o quê × onde)

Adicionar o branch `decision_outras` no dispatcher, disparando o **mesmo caminho
determinístico** do web (`buildOtherOptions` → texto + `comparison_table` real).

| O quê | Onde |
|-------|------|
| Adicionar branch `if (replyId === "decision_outras") return handleDecisionOutras(ctx);` no `dispatchInteractiveReply` | `src/lib/whatsapp/interactive-handlers.ts:99-124` |
| Novo handler `handleDecisionOutras(ctx)`: `recordUserClick(ctx)` → `loadMeta` → `buildOtherOptions(conversationId, meta)` → `sendTextMessage(from, others.text)` + `saveMessage(conversationId, "assistant", others.text, "whatsapp")` → enviar `comparison_table` com `others.groups` via `artifactToWhatsApp("comparison_table", { groups })` + `sendInteractiveMessage`/`sendTextMessage` (espelha `adapter.ts:153-169`) | `src/lib/whatsapp/interactive-handlers.ts` (novo handler) |
| `catch` de erro espelhando o web (`route.ts:539-546`): enviar texto de fallback ("Deixa eu refazer a busca pra te mostrar as outras opções — me dá um instante e pede de novo?") — nunca deixar o clique em silêncio nem cair no modelo | `src/lib/whatsapp/interactive-handlers.ts` (corpo do handler) |
| Atualizar o comentário enganoso `:1241-1243` de `decisionPromptToWhatsApp` (que diz que os títulos "caem no processamento de texto (sem handler dedicado)") — agora `decision_outras` tem handler determinístico | `src/lib/whatsapp/formatter.ts:1241-1243` |
| **NÃO** alterar `handleShowOthers` (FIX-108) nem os irmãos `decision_contratar`/`decision_especialista` — fora do escopo da D22 (ver nota de escopo) | — (preservar) |

**Nota de escopo:** a D22 é especificamente o **comparativo de ofertas reais** ("outras"),
que é onde o free-run do modelo pode **fabricar/omitir números**. Os botões irmãos
`decision_contratar` (avança fechamento) e `decision_especialista` (handoff) também caem no
texto livre hoje, mas não arriscam inventar ofertas — ficam fora deste card (avaliar em fix
próprio se o operador quiser paridade total do card de decisão no WhatsApp).

## Regressão exigida (3 camadas — bug de comportamento do agente/WhatsApp)

Por ser comportamento do funil no canal WhatsApp (e por o defeito ser justamente o
**escorregar pro modelo**), seguir as **3 camadas** obrigatórias:

- **Camada 1 — Structural** (`src/lib/whatsapp/interactive-handlers.<slug>.test.ts`):
  `dispatchInteractiveReply` com `replyId="decision_outras"` **retorna `true`** (foi reclamado),
  chama `buildOtherOptions` e emite um `comparison_table` com os `groups` REAIS retornados
  (mockar `buildOtherOptions`/adapter), e **NÃO** cai em `processTextMessage`/
  `processWithOrchestrator`. Espelhar o assert do web (`show-other-options` → `buildOtherOptions`)
  pra travar a paridade. Assertar também `recordUserClick` (clique persistido).
- **Camada 2 — Cassette** em `tests/regression/agent-trajectory.test.ts`: `describe` novo
  ("FIX-119 — WhatsApp decision_outras determinístico"). Como o caminho corrigido é
  **model-free**, o cassette guarda a **fronteira**: encode um stream de modelo que
  *alucinaria* ofertas se recebesse "Ver outras opções" como texto e asserte que o clique em
  `decision_outras` **nunca invoca o modelo** (o `MockLanguageModelV2` não é chamado) — a
  trajetória surfaça `comparison_table` com os grupos reais do `buildOtherOptions`, não texto
  do modelo. Cross-ref pro teste structural.
- **Camada 3 — Eval** (`tests/eval/agent-flow.eval.test.ts`, nightly): cenário WhatsApp de
  persona que, no card de decisão, clica "Ver outras opções" e deve receber as ofertas REAIS
  da descoberta (mesmos valores do reveal), sem números novos/inventados — paridade com o
  cenário web equivalente. Só relatório, não gate.

**Fluxo TDD:** escrever Camadas 1+2, **ver falhar** (hoje `decision_outras` retorna `false`
e cai no modelo), aplicar o handler `handleDecisionOutras`, ver as duas verdes, commit
`test+fix:` único (Camada 1 + Camada 2 + fix).

**A REGRA é a paridade com o comportamento web já correto** (`route.ts:521-548` →
`buildOtherOptions`): o WhatsApp deve surfaçar as **mesmas ofertas reais determinísticas** que
o web, sem free-run do modelo — como manda o docstring de `other-options.ts` ("zero free-run
do modelo, zero dado inventado").

# Continuidade de contexto cross-canal (web ↔ WhatsApp) — Design & Decisões

> **Status:** DRAFT · 2026-07-01 · aguardando revisão do Kairo
> **Origem:** print do Kairo — cliente fecha o plano na web, recebe o resumo da
> contratação no WhatsApp e, ao responder pelo número, o agente "esquece" e
> volta a perguntar "qual valor você tá pensando?".
> **Método:** brainstorming (superpowers). As 3 decisões de produto/arquitetura
> foram adotadas com o **default recomendado** (Kairo estava away); marcadas
> abaixo como **CONFIRMAR**.

---

## 1. O problema (com causa raiz verificada no código)

Sequência observada no print:

1. Cliente monta/fecha o plano na **web** → recebe "Resumo da sua contratação" no **WhatsApp** (BB, grupo 1797, R$ 131.042, parcela R$ 2.365,57).
2. Responde "legal hein" pelo número → o agente responde **"Haha, bora focar no seu carro! Qual valor você tá pensando?"** — re-qualificando, como se a jornada nunca tivesse acontecido.

### Causa raiz (não é copy, é arquitetura)

- Web e WhatsApp são **duas rows fisicamente separadas** em `conversations`, chaveadas de formas diferentes: web por cookie (`metadata.webCookie` / `id`), WhatsApp por `wa_id` (o telefone). — `src/app/api/chat/route.ts:242,260,271`; `src/lib/whatsapp/session.ts:22-39`.
- **Todo o estado do funil vive em `conversations.metadata` (jsonb), que é por-conversa.** O tipo é `ConversationMetadata` (`src/lib/agent/personas.ts:45+`): `contractClosed`, `revealCompleted`, `decisionDispatched`, `searchDispatched`, `qualifyAnswers`, `identityCollected`, etc. Lido/gravado por `metaOf`/`persistMeta` (`src/lib/conversation/meta.ts:7-19`).
- A máquina de estados `nextGate(meta)` (`src/lib/agent/qualify-state.ts:33+`) deriva o próximo passo **só do meta**. Meta vazio → devolve `name → experience → consent → identify → credit` → o "qual valor você tá pensando?".
- Quando o cliente responde no WhatsApp, `getOrCreateConversation(waId)` **cria uma conversa nova com `metadata` vazio** (`session.ts:36-39`). O estado do fechamento (que está na conversa **web**) nunca é lido.
- **O elo cross-canal JÁ EXISTE mas não é usado para estado:** `contacts` (FIX-41/FIX-42) resolve o cliente por `phone`/`cpf`/`email` e agrega N conversas via `conversations.contactId`. Tanto a web (`storeIdentity` → `attachContact`, `identity.ts:104`) quanto o WhatsApp (`getOrCreateConversation` → `attachContact({phone})`, `session.ts:61`) **já ligam o mesmo `contactId`** pelo telefone normalizado. Mas o runtime do agente **carrega estado e histórico por `conversationId`, nunca por `contactId`**. `contacts` hoje é usado só para kanban/admin.

> **Uma frase:** o cliente já é reconhecido como o mesmo contato nos dois canais; só o **estado da jornada** não viaja junto.

---

## 2. Decisões (defaults adotados — CONFIRMAR)

| # | Decisão | Default adotado | Alternativas descartadas |
|---|---|---|---|
| **D1** | Estratégia de unificação | **A — Unificar o estado por contato.** No turno, o runtime resolve o `contactId` e lê estado+histórico do *contato*. Resolve TODA transição cross-canal (web→whats, whats→web, abandonou-e-voltou), não só o pós-fechamento. | **B — Semear no fechamento** (band-aid, só cobre o print). **C — Re-modelar conversa-por-contato** (migração grande, YAGNI). |
| **D2** | Qual contexto assumir com +1 jornada | **Mais assertivo, empate → recente**, e **pergunta só se conflitar**: prioridade `contractClosed > decisionDispatched > revealCompleted > searchDispatched > qualifyAnswers`; empate → conversa mais recente (`lastInboundAt`/`updatedAt`); se houver 2+ jornadas **igualmente avançadas de bens diferentes** (ex.: carro E imóvel), o agente **pergunta** qual retomar em vez de adivinhar. | Sempre a mais recente (pega qualificação abandonada em vez do plano fechado). |
| **D3** | Comportamento pós-fechamento no whats | **Modo acompanhamento.** Com `contractClosed`, o agente reconhece o plano fechado, responde sobre ele e orienta próximos passos; **NÃO re-qualifica**. Nova jornada só se o cliente pedir outro bem explicitamente. | Handoff imediato pra mesa; continuar vendedor com upsell proativo. |

---

## 3. Arquitetura da solução (D1 — estado por contato)

**Princípio:** o `ConversationMetadata` do funil é **promovido de por-conversa para por-contato** a partir do momento em que a identidade é resolvida. Antes da identidade (anônimo) o estado continua na conversa; depois, o **contato é a fonte única**.

Isso encaixa no que já existe (`contacts`, `attachContact` retornando `contactId`) e evita a re-modelagem C.

### 3.1 Schema — estado no contato

Adicionar a `contacts` (`src/db/schema.ts:207`):

```ts
journeyState: jsonb("journey_state").$type<ConversationMetadata>(),
journeyAnchorConversationId: uuid("journey_anchor_conversation_id"), // conversa âncora corrente (rastreio/histórico)
```

Migration drizzle (`drizzle-kit push` em dev; `migrate` no release — nunca à mão contra o banco).

### 3.2 Camada de acesso ao estado (`src/lib/conversation/meta.ts`)

Introduzir resolução ciente de contato, mantendo a assinatura antiga como fallback:

- `resolveJourneyState(conv)` → se `conv.contactId` e o contato tem `journeyState`, retorna esse; senão `conv.metadata`. (async — faz lookup do contato)
- `persistJourneyState(conv, meta)` → se `conv.contactId`, grava em `contacts.journeyState`; senão em `conversations.metadata`.
- `metaOf`/`persistMeta` continuam existindo para caminhos pré-identidade e simulados; os call-sites do runtime migram para os novos.

### 3.3 Promoção na identificação (o momento do merge)

A promoção acontece **uma vez**, quando o `contactId` é ligado:

- **Web** — `storeIdentity` (`identity.ts:92`), logo após `attachContact`: se o contato ainda **não** tem `journeyState`, copia o meta atual da conversa para o contato; se **já** tem (ex.: cliente que já veio de outra sessão), aplica a **regra D2** (âncora por assertividade) para escolher o estado vigente.
- **WhatsApp** — `getOrCreateConversation` (`session.ts:60`), após `attachContact({phone})`: idem. É aqui que a conversa nova do whats passa a **ler** o `journeyState` do contato (que veio da web) em vez de nascer vazia. **Corrige o print.**

Regra D2 (sem misturar campos de jornadas diferentes): escolhe-se **um** estado vencedor inteiro (o da conversa/estado mais assertivo), nunca um merge campo-a-campo — senão `qualifyAnswers` de carro e imóvel se misturariam.

### 3.4 Runtime do agente (`src/lib/agent/orchestrator/index.ts:58-136`)

- `meta` = `resolveJourneyState(conv)` (por contato pós-identidade).
- Persistência do turno → `persistJourneyState`.
- **Histórico:** quando a conversa corrente é nova/vazia e há uma âncora do mesmo contato, **prefixar** o histórico da âncora (limitado às últimas N mensagens — controlar tokens) antes do histórico da conversa corrente, para o agente "falar sobre o contexto recente". Não unir histórico de jornadas de bens diferentes (usar só a âncora escolhida por D2).

### 3.5 Modo acompanhamento pós-fechamento (D3)

- `nextGate` (`qualify-state.ts:33`): no topo, `if (meta.contractClosed) return "acompanhamento"` (novo estado terminal) — nunca mais devolve gates de qualificação depois de fechado.
- `system-context`/prompt: quando `contractClosed`, injetar o contexto do plano fechado (a partir de `getLatestBeviProposal` por `contactId`/conversa âncora — `proposal-repo.ts`) e a instrução de acompanhamento (reconhecer o plano, próximos passos, sem re-perguntar valor). Copy sem cara de IA, PT-BR correto.

---

## 4. Fluxo de dados (o caso do print, depois do fix)

```
WEB: qualifica → identify (CPF+celular) → attachContact → contactId=C
     → fecha (offer-confirm) → contractClosed=true gravado em contacts[C].journeyState
     → sendContractSummary envia o resumo pro WhatsApp do cliente
WHATSAPP: cliente responde "legal hein"
     → getOrCreateConversation(waId) cria conv nova, attachContact({phone}) → MESMO contactId=C
     → runtime: resolveJourneyState(conv) devolve contacts[C].journeyState (contractClosed=true)
     → nextGate → "acompanhamento" (NÃO "credit")
     → agente: "Seu plano do BB (grupo 1797) tá confirmado ✅ — quer que eu te explique os próximos passos?"
```

---

## 5. Edge cases

- **Número do whats ≠ telefone informado na web** → `contactId` diferente → tratado como novo. Aceitável (raro); fora de escopo casar por outro identificador aqui.
- **Anônimo sem identidade que vai pro whats** → sem `contactId` comum → não casa. Mas fechamento exige identidade, então não é o caso do print. Estado segue por-conversa.
- **Duas jornadas de bens diferentes** → D2: âncora por assertividade; conflito de igual assertividade → o agente pergunta qual retomar.
- **Simulados (`SIM-...`)** → `attachContact` é no-op (`session.ts:60`) → estado fica por-conversa, isolado. Mantém os cassettes/testes determinísticos.
- **Concorrência** (dois turnos quase simultâneos web+whats) → raro (transição é sequencial). Escrita no contato deve ser last-write-wins com `updatedAt`; se virar problema real, endurecer depois (não antecipar).

---

## 6. Regressão — 3 camadas OBRIGATÓRIAS (bug de comportamento do agent)

Conforme `CLAUDE.md` → "Regressão de agent — 3 camadas".

- **Camada 1 (structural, todo PR):**
  - `resolveJourneyState` devolve o estado do contato quando há `contactId`; fallback pra conversa quando não há.
  - `nextGate({contractClosed:true})` **nunca** devolve `credit`/gate de qualificação → devolve `acompanhamento`.
  - Promoção copia o meta da conversa pro contato na identificação (web e whats).
- **Camada 2 (cassette determinístico — `tests/regression/agent-trajectory.test.ts`):**
  - Novo `describe`: **pós-fechamento no WhatsApp** — contato com `contractClosed=true`, primeira msg inbound no whats → detector garante que o agente **NÃO** emite "qual valor"/gate de crédito e responde em modo acompanhamento (reconhece o plano). `MockLanguageModelV2` + `simulateReadableStream`.
- **Camada 3 (eval nightly — `tests/eval/agent-flow.eval.test.ts`):**
  - Cenário cross-canal: fecha na web → responde no whats → asserts comportamentais (sem frase de re-qualificação; menção ao plano fechado).
- **Integration (toca DB):** promoção web→whats liga o mesmo `contactId` e o `journeyState` viaja; `resolveJourneyState` por contato.

---

## 7. Fora de escopo (YAGNI agora)

- Re-modelagem para conversa-única-por-contato (D1 opção C).
- Casar contatos por identificadores fracos (mesmo device, e-mail digitado errado).
- Merge campo-a-campo de jornadas paralelas.
- Handoff automático pra mesa no pós-fechamento (D3 alternativa) — a mesa segue sendo acionada pelo kanban (`na_administradora`), como já é.

---

## 8. Decomposição em blocos (para o todo-blocks, DEPOIS da aprovação)

Paralelizáveis com uma base de integração comum:

1. **Bloco — estado por contato (núcleo):** schema (`journeyState`), `resolveJourneyState`/`persistJourneyState`, promoção em `storeIdentity` + `getOrCreateConversation`. Camada 1 + integration.
2. **Bloco — runtime + histórico:** `orchestrator/index.ts` lê/grava por contato; prefixação de histórico da âncora. Camada 1.
3. **Bloco — modo acompanhamento (D3):** gate `acompanhamento` em `nextGate`, injeção do plano fechado no prompt, copy. Camada 1 + **Camada 2 cassette** (o caso do print).
4. **Bloco — regra D2 (âncora + pergunta em conflito):** seleção do estado vencedor, pergunta quando bens diferentes empatam. Camada 1 + cassette.

(A Camada 3 eval entra no bloco 3, roda nightly.)

---

## 9. Perguntas abertas (CONFIRMAR com o Kairo)

1. **D1/D2/D3** acima — adotei os recomendados; confirmar ou ajustar.
2. **Copy do modo acompanhamento** — decisão de produto (o que o agente fala pós-fechamento no whats). Proponho rascunho no bloco 3; validar.
3. **Janela agente × mesa** — pós-fechamento, antes de `na_administradora`, o agente faz acompanhamento; a partir de `na_administradora` a mesa assume (como já é). Confirmar que essa fronteira está certa.

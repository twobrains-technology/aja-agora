---
data: 2026-06-25
bloco: bloco-c-estudo-remocao-letta
escopo: FIX-80 — ESTUDO + PLANO + STUB do re-home da memória do Letta pro Postgres
status: PROPOSTO — PENDENTE-KAIRO (não executar sem medição em prod + aval)
autor: executor do bloco (estudo autônomo — operador autorizou no _prompt.md)
substitui_parcialmente: 2026-05-16-aja-agora-letta-sidecar-integration
---

# ADR — Remover o Letta e re-homear a memória cross-channel pro Postgres

> ⚠️ **Este ADR é uma PROPOSTA de estudo, não uma execução.** Nada de runtime foi
> alterado. O Letta continua ativo. A decisão é grande e **PENDENTE-KAIRO**: o
> veredito é forte por inferência de código, mas **não cravado por dado de prod**.
> A primeira sub-tarefa da execução futura é a **MEDIÇÃO** (última seção). Sem ela,
> não aprovar a remoção.

## 1. Contexto

A camada de memória cross-channel do Aja Agora foi integrada via **Letta OSS**
(sidecar shared em `tb-letta-shared`, ECS sa-east-1, descoberto por Cloud Map SRV)
no ADR `2026-05-16-aja-agora-letta-sidecar-integration`. O objetivo de produto é
legítimo e alinhado ao core value: **continuidade entre sessões e entre canais**
(web ↔ WhatsApp) — o agente "lembra" do usuário que volta dias depois e retoma de
onde parou, em vez de recomeçar do zero.

Na rodada de **QA manual do Kairo (2026-06-25)** + avaliação de arquiteto sênior
(Opus), surgiu o veredito de que **o Letta é OVERKILL para o uso que este app faz
dele**. A memória (a feature de produto) fica; o **Letta (o mecanismo)** é que está
superdimensionado. Este ADR estuda o re-home do mecanismo pro Postgres que o app já
opera, preservando 100% do comportamento observável.

### 1.1 Como a memória é REALMENTE exercitada (mapa de código)

A interface de corte já existe: `MemoryAdapter` (`src/lib/memory/adapter.ts`), com
três implementações — `LettaMemoryAdapter` (real), `NoopMemoryAdapter` (testes +
fallback de circuito) e o factory com circuit-breaker (`src/lib/memory/index.ts`).
Todo o orchestrator fala com a memória por **um único bridge**
(`src/lib/memory/orchestrator-bridge.ts`). Call-sites de runtime (todos fora de
`src/lib/memory/` exceto o factory):

| Fase | Onde | O que faz |
|---|---|---|
| **Read-side** (pré-turno) | `orchestrator/index.ts:147-154` | `resolveIdentityForTurn` → `loadMemoryContextForTurn` → `memorySystemMessageFromContext`. O resultado vira o system message `[CONTEXTO DO USUÁRIO]` / `[REATIVAÇÃO]` prependido ao prompt. |
| **Write-side** (pós-stream) | `orchestrator/index.ts:221` | `void storeMemoriesForTurn(...)` — **fire-and-forget** (não `await`). |
| **Reconcile** (lead capturado) | `orchestrator/lead-collection.ts:229` | `getMemoryAdapter()` + `runReconcile` quando o lead web (cookie anônimo) vira phone. |
| **Purge** (/reset web) | `app/api/chat/reset/route.ts:82,90` | `purgeIdentity` por cookie/phone. Best-effort. |
| **Render do prompt** | `agent/agents/builder.ts:194,217-219` | 2º ponto que chama `buildMemorySystemMessage(memoryContext)` e injeta no agent — a origem da **dupla injeção** por turno (custo de token). A migração não muda isto (consome `MemoryContext`, agnóstico ao backend), mas a fase de cutover é boa janela pra consolidar numa injeção só. |
| **Inspector admin** (dev-only) | `app/api/admin/simulator/sessions/[id]/memory/route.ts:42` → `memory/inspect.ts:93` | Lê snapshot pra UI do simulador. ⚠️ **Instancia `new LettaMemoryAdapter()` DIRETO**, furando o factory/interface — é o único call-site acoplado à implementação concreta. A fase 1 precisa trocá-lo por `getMemoryAdapter()` (ou pelo novo adapter) pra não quebrar a inspeção. 404 em prod (sem impacto de usuário). |

Pontos provados por leitura de código:

1. **Archival memory (a parte cara — busca semântica via embeddings OpenAI) está
   MORTA.** Caiu por OpenAI 429 (card `2026-06-25-letta-archival-timeout-mascara-openai-429.md`)
   e o produto seguiu **sem impacto perceptível de UX**. O `searchArchival` real
   retorna hits que, na prática, não chegam. Prova empírica de que ninguém depende
   disso hoje.

2. **A memória agêntica self-editing (o diferencial do Letta) tem ZERO uso.** O
   `LettaMemoryAdapter` faz `PATCH`/`POST` direto no memory_block via REST — nunca
   invoca o loop agêntico do Letta. Há um `model: anthropic/claude-haiku-4-5`
   setado por agent (`letta-adapter.ts:73`) que **nunca gera nada**. O Letta é
   usado como **KV-store REST caro e remoto**.

3. **O que chega ao prompt é projeção DETERMINÍSTICA, sem LLM.** O
   `[CONTEXTO DO USUÁRIO]`/`[REATIVAÇÃO]` é montado por `reactivation.ts` a partir do
   `HumanMemoryBlock`, que por sua vez é preenchido pelo `extractor.ts` — heurística
   pura (sem LLM) que lê **artifacts produzidos por tool calls + `conversations.metadata`**.
   Ou seja: **a fonte do que vira memória já vive no Postgres do app**. O Letta só
   guarda uma cópia serializada (`block.value` = JSON string) desses mesmos dados.

4. **Nada quebra sem Letta — degrada limpo em todo caminho.** Read-side nunca dá
   `throw` (retorna `null`/`[]`); write-side é fire-and-forget; o factory cai pra
   `NoopMemoryAdapter` quando o circuito abre. O contrato `MemoryAdapter` já garante
   essas invariantes.

### 1.2 Custo atual do mecanismo

- **~2.131 LOC** em `src/lib/memory/` (adapter REST, client, circuit-breaker, lock
  anti-race, observability, reconciler, parsing de shapes da API Letta v0.16).
- **Container ECS shared** `tb-letta-shared` + **Cloud Map SRV discovery** + Postgres
  próprio do Letta.
- **Dependência externa OpenAI** (embeddings) — ponto único de falha, **já caiu**.
- **6 env vars** (`LETTA_BASE_URL`, `LETTA_API_KEY`, `LETTA_NAMESPACE`,
  `LETTA_EMBEDDING`, ...) + `MEMORY_ADAPTER`.
- **Memória injetada EM DOBRO por turno** em alguns caminhos (card
  `2026-06-25-system-messages-prompt-injection-warning.md`) — custo de token.
- **Latência de rede** por turno (timeout 2s no read-side) contra um serviço remoto,
  pra ler dado que o app já tem localmente.

## 2. Veredito

**OVERKILL — do LETTA, não da memória.** O Letta entrega, hoje, um KV-store de um
blob `jsonb` keyed por identidade. Isso é uma linha de tabela no Postgres que o app
**já roda**. A feature de produto (continuidade entre sessões/canais, reativação,
reconciliação web→WhatsApp) **fica intacta** — muda só o backend que a sustenta.

> **Confiança:** alta por inferência de código; **não cravada por dado de prod.**
> Ver §7 (medição obrigatória).

## 3. Opções consideradas

### Opção A — Manter o Letta como está
- **Prós:** zero trabalho; mecanismo agêntico disponível se um dia for usado.
- **Contras:** paga todo o custo de §1.2 por uma feature que um `upsert` resolve;
  mantém dependência OpenAI já quebrada; superfície de falha e LOC altos.
- **Rejeitada:** custo desproporcional ao valor entregue.

### Opção B — Re-home pro Postgres atrás da interface `MemoryAdapter` (ESCOLHIDA como proposta)
- Novo `PostgresMemoryAdapter` implementa a interface existente. 1 tabela `jsonb`
  (`memory_identities`) keyed por identidade. O `extractor` já produz o `blockPatch`
  → vira `INSERT ... ON CONFLICT DO UPDATE` atômico (substitui o read-modify-write
  remoto + lock anti-race do Letta por um único statement transacional).
- **Prós:** corte limpo (adapter pattern já existe); mata container/SRV/OpenAI/circuit;
  remove latência de rede; dado fica onde já vive; ~2k LOC viram ~algumas centenas.
- **Contras:** archival semântico sai (mas **já está morto**); exige migração + medição.
- **Por que vence:** entrega 100% do comportamento observável hoje com fração do custo.

### Opção C — Re-home pro Postgres COM pgvector (archival reativado) já na fase 1
- **Rejeitada para a fase 1:** o archival está morto e ninguém sente falta. Reativar
  agora é resolver problema que não existe (YAGNI). Vira **fase 2 OPCIONAL** (§5).

### Opção D — Trocar para `MEMORY_ADAPTER=noop` (matar a memória)
- **Rejeitada:** apaga a feature de produto (continuidade/reativação), que é alinhada
  ao core value. O veredito é overkill **do mecanismo**, não da memória.

## 4. Decisão proposta

Implementar a **Opção B**: `PostgresMemoryAdapter` atrás da interface `MemoryAdapter`,
preservando o contrato (read não-throw, write fire-and-forget, degradação limpa,
reativação, reconciliação, purge idempotente). Archival = **fase 2 opcional**. A
troca do adapter ativo só acontece **depois da medição em prod (§7)** e do aval do
Kairo. Stub ilustrativo do contrato em `src/lib/memory/postgres-adapter.ts`
(NÃO ligado no runtime).

### 4.1 Tabela proposta

```
memory_identities
  id                  uuid pk
  namespace           varchar   -- prod | dev | local-<workspace>
  kind                varchar   -- phone | email | anon-cookie
  value               varchar   -- E.164 | email | hash do cookie
  block               jsonb     -- HumanMemoryBlock (hoje serializado em string no Letta)
  reconciled_from     text      -- proveniência do merge (cookie → phone)
  last_interaction_at timestamptz
  created_at          timestamptz
  updated_at          timestamptz
  UNIQUE (namespace, kind, value)
```

`memory_events` (audit) **já existe** no schema e não muda — só deixa de referenciar
`letta_agent_id` semanticamente (coluna pode virar `memory_key` num passo cosmético
posterior; não bloqueia).

## 5. Plano de migração faseado

> Cada fase é um bloco `todo-blocks` próprio. **A fase 0 é gate das demais.**

- **Fase 0 — MEDIÇÃO (obrigatória, bloqueante).** Instrumentar/consultar prod pelos 3
  itens de §7. **Sem (1) e (2) verdes, parar aqui.** Entrega: relatório com os números.

- **Fase 1 — Implementar `PostgresMemoryAdapter` (sem ligar).** Tabela Drizzle
  `memory_identities` (migração via pipeline/entrypoint, nunca à mão — regra global de
  migrations). Corpos reais nos métodos do stub. TDD: reusar os testes
  `index.test.ts`/`reactivation.test.ts`/`reconciler.test.ts`/`e2e.test.ts` já
  existentes (validam o contrato `MemoryAdapter` independentemente do backend) +
  estrutural do upsert/merge. Adapter ainda **não** registrado no factory.

- **Fase 2 — Cutover atrás da flag.** Registrar `PostgresMemoryAdapter` no factory
  sob `MEMORY_ADAPTER=postgres`. **Backfill** (opcional): migrar os blocks vivos do
  Letta → `memory_identities` (script one-shot lendo a API Letta; só identidades com
  `lastInteractionAt` recente importam). Cutover em **dev primeiro**, observar recall,
  depois prod. Letta segue de pé como fallback durante a janela.

- **Fase 3 — Desativação do Letta.** Após N dias de prod estável no Postgres: remover
  `LettaMemoryAdapter` + client + circuit-breaker do código, env vars `LETTA_*` do
  compose/Secrets, e o serviço `tb-letta-shared` **se nenhum outro app depender dele**
  (⚠️ Letta é **shared** — FPMA, sparkflow, letdrill também usam; ver §6). A desativação
  do container é decisão de plataforma, separada deste app.

- **Fase 2-archival — OPCIONAL, só se houver demanda real.** pgvector +
  `memory_passages` + embeddings pelo **gateway LiteLLM shared** (NÃO OpenAI direto).
  Hoje injustificada (archival morto sem impacto).

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Veredito errado por falta de dado de prod | **Fase 0 bloqueante (§7).** Não cutar sem número. |
| Recall/reativação cai no cutover | Cutover dev→prod gradual; Letta de pé como fallback; comparar taxa de `[CONTEXTO]` não-vazio antes/depois. |
| `reconcileIdentity` web→WhatsApp regride | Coberto pelos testes `reconciler`/`identity` existentes; medir uso real (§7.3). |
| Perda de histórico ao desligar Letta | Backfill (fase 2) antes do cutover; Letta só desliga na fase 3, dias depois. |
| **Letta é SHARED** — desligar quebra outros apps | Fase 3 desativa só o **adapter do aja-agora**; o container só morre se nenhum app depender (decisão de plataforma à parte). |
| Migração rodada à mão | Proibido — migração via pipeline/entrypoint (regra global). |

## 7. Pré-requisitos de medição — PENDENTE-KAIRO (gate da execução)

> O veredito é forte por inferência de código, mas **não cravado por dado**. Estes 3
> itens são a **primeira sub-tarefa** da execução. **Sem (1) e (2), NÃO aprovar a
> remoção.** Não dá pra confirmar nada disto a partir do código — o default é
> `MEMORY_ADAPTER ?? "letta"` (`index.ts:23`), mas o valor REAL em prod e as taxas só
> aparecem no ambiente.

1. **Qual `MEMORY_ADAPTER` está ativo em prod (`letta` vs `noop`) + taxa de
   circuito-aberto.** Onde: Secrets Manager do service prod (env efetiva) +
   `memory_events` com `event_type = 'fallback_triggered'` (taxa de circuito aberto)
   / logs `letta_op: "fallback_triggered"`. **Se já estiver em `noop` em prod, a
   "remoção" é trivial — ninguém usa Letta hoje.**

2. **Taxa real de recall/reativação em prod.** Onde: contar turnos cujo system
   message `[CONTEXTO DO USUÁRIO]`/`[REATIVAÇÃO]` saiu **não-vazio** (instrumentar
   `buildMemorySystemMessage`/`memorySystemMessageFromContext` com um contador, ou
   amostrar logs). Cruzar com: quantos web-anônimos cruzam o threshold de **3 turnos
   + cookie** (`ENGAGEMENT_THRESHOLD`, `identity.ts:13`) pra virar identidade.
   **Se a taxa de `[CONTEXTO]` não-vazio for ~0, a memória mal é exercitada e o
   re-home é ainda mais seguro (e a feature, questionável).**

3. **Uso real de `reconcileIdentity` web→WhatsApp em prod.** Onde: `memory_events`
   com `event_type = 'reconciled'`. Confirma se a reconciliação de identidade
   (cookie anônimo → phone no fechamento do lead) acontece de fato e com que
   frequência — define quanto rigor a fase 1 precisa nesse caminho.

**Critério de aprovação:** (1) e (2) medidos e consistentes com o veredito (Letta
ativo porém sub-exercitado, OU já em noop). (3) informa esforço, não bloqueia. Com
os números, o Kairo decide se executa as fases 1-3.

## 8. Rollback

- **Fases 1-2 são reversíveis por flag:** `MEMORY_ADAPTER` volta pra `letta` num
  deploy; o Letta nunca foi desligado até a fase 3. A tabela `memory_identities` fica
  inerte (não atrapalha) se o adapter voltar pro Letta.
- **Fase 3 (desativação do Letta no aja-agora)** só após janela de prod estável; o
  container shared **não** é desligado por este app.

## 9. O que fica PENDENTE-KAIRO

1. **Aprovar a direção** (re-home pro Postgres) — decisão arquitetural grande.
2. **Rodar a fase 0 (medição §7)** antes de qualquer código de produção.
3. **Decidir o destino do archival** (fase 2 pgvector OPCIONAL — default: não fazer).
4. **Decisão de plataforma** sobre o container `tb-letta-shared` (outros apps usam).

---

**Entrega deste bloco:** este ADR + plano + stub ilustrativo
(`src/lib/memory/postgres-adapter.ts`, não-ligado). **Nenhum código de runtime foi
tocado; o Letta segue ativo.**

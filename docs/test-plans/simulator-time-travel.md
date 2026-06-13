# Test Plan — Simulator Time-Travel

**Data:** 2026-05-17
**Branch:** `feat/simulator-memory`
**Autor:** PO Lead (Opus 4.7) — persona QA fintech consórcio sênior
**Spec de referência:** `docs/specs/2026-05-17-simulator-time-travel-design.md`
**Antecessores:**
- `docs/test-plans/simulador-completo.md` — plano simulador (120 CAs)
- `docs/test-plans/2026-05-17-consolidated-v2.md` — Bruna v2 (12 itens)
- `docs/specs/2026-05-16-bruna-v1-qa-plan.md` — memória Letta cross-channel

Este documento é **contrato de aceite** pro QA Crítico. Cada critério P0 é binário, com **GIVEN/WHEN/THEN** verificável objetivamente. Sem "deveria", "talvez". Cenários P1 são alto valor secundário (não bloqueiam ship se justificado). Edge cases adversariais são P0 quando reveladores de buraco de segurança/integridade; P1 quando UX.

---

## 1. Escopo e premissas

### Dentro do escopo (feature inclui)

- Campo `metadata.simulator.clockOffsetMs` (int, default 0, ≥ 0) por conversation simulada (`is_simulated=true`).
- Helper `simulatorNow()` + `runWithSimulatorClock()` via AsyncLocalStorage em `src/lib/utils/simulator-clock.ts`.
- 3 endpoints novos sob `/api/admin/simulator/sessions/[id]/`:
  - `POST clock` (body `{ advanceDays }`, cumulativo, cap 3650)
  - `POST clock/reset`
  - `GET memory` (snapshot Letta + reactivation hint preview + archival top 10)
- Componente `MemoryDevPanel` no simulador web e WhatsApp (drawer 320px, polling 3s).
- Substituição de `new Date()` por `simulatorNow()` em todos pontos do path do turno simulado (letta-adapter, extractor, orchestrator, lead-collection, whatsapp/proxy, whatsapp/simulator-bus, chat/route, conversation/messages).
- ALS context inicializado em entrypoints: `src/app/api/chat/route.ts`, `src/lib/whatsapp/processor.ts`, `src/app/api/admin/simulator/whatsapp/[id]/send/route.ts`.

### Fora do escopo (não cobrir neste plano)

- Voltar no tempo (offset negativo). Reset zera; não rebobina ts já gravados.
- Time-travel em conversa real (`is_simulated=false`).
- Time-travel global (bulk em várias conversas).
- BullMQ / cron / EventBridge agendados — fora do path síncrono do turno.
- Migrations de schema (campo é `jsonb`, sem DDL).

### Pré-requisitos de ambiente

| Item | Valor exigido | Como verificar |
|---|---|---|
| Letta sidecar | rodando local via `local-dev` (`~/.tb-local/_shared/`) | `curl http://letta.orb.local/health` retorna 200 |
| `MEMORY_ADAPTER` | `letta` (não `noop`) | `docker compose exec aja env \| grep MEMORY_ADAPTER` |
| `AJA_DEBUG_MEMORY` | `1` | `docker compose exec aja env \| grep AJA_DEBUG_MEMORY` |
| `isSimulatorEnabled()` | `true` (dev, `TB_ENV != production`) | endpoint `GET /api/admin/simulator/sessions` responde 200 (não 404) |
| Admin token | usuário com `role=admin` no `user` table | login via UI ou seed |
| DB | Postgres do workspace via OrbStack | `psql $DATABASE_URL -c "select 1"` |
| App reachable | `http://aja-<workspace>.orb.local` | curl 200 na home |

**Snapshot baseline antes de rodar:**
```bash
docker compose exec aja-db psql -U aja -d aja \
  -c "select count(*) filter (where is_simulated) as sim, count(*) filter (where not is_simulated) as real from conversations;"
```
Anotar contagem. Ao final, conversas reais não podem ter mudado contagem nem ter timestamps alterados.

---

## 2. Critérios de aceite binários (P0)

Cada P0 deve estar ✓ pra feature ir pra prod. Numeração é estável — QA reporta com mesmo número.

### P0-01 — Avanço de tempo persiste no DB

- **GIVEN** uma conversa whatsapp simulada com `id = X` (`POST /api/admin/simulator/sessions` body `{channel:"whatsapp"}` → criou com `metadata.simulator.clockOffsetMs` ausente ou 0)
- **WHEN** `POST /api/admin/simulator/sessions/X/clock` com body `{"advanceDays": 5}` e header admin válido
- **THEN** HTTP 200 com body contendo `{"offsetMs": 432000000, "simulatedNow": "<ISO>", "conversation": {...}}` E o registro DB satisfaz:

```sql
SELECT metadata->'simulator'->>'clockOffsetMs' AS off,
       metadata->'simulator'->>'clockAdvancedAt' AS at
FROM conversations WHERE id = 'X';
-- esperado: off = '432000000', at = ISO timestamp dentro dos últimos 5s
```

### P0-02 — Avanço cumulativo soma corretamente

- **GIVEN** conv X com `clockOffsetMs = 432000000` (5d)
- **WHEN** `POST .../clock` body `{"advanceDays": 3}`
- **THEN** HTTP 200; DB `clockOffsetMs = 691200000` (8d = 5+3) exato (sem floating arredondado)

### P0-03 — Reset zera offset

- **GIVEN** conv X com `clockOffsetMs > 0`
- **WHEN** `POST .../clock/reset`
- **THEN** HTTP 200 body `{"offsetMs": 0, ...}`; DB `metadata->'simulator'->>'clockOffsetMs' = '0'`; `clockAdvancedAt` atualizado

### P0-04 — Mensagem do agent grava `createdAt` no futuro

- **GIVEN** conv whatsapp simulada X, `clockOffsetMs = 5*86400000` (5d), 1ª mensagem do user já enviada via `POST /api/admin/simulator/whatsapp/X/send` body `{"text":"oi"}`
- **WHEN** agent responde (aguardar até `messages` ter ≥ 2 linhas pra conv X com `role='assistant'`)
- **THEN** `SELECT created_at FROM messages WHERE conversation_id = 'X' AND role = 'assistant' ORDER BY id DESC LIMIT 1` retorna timestamp dentro de `[now+5d-60s, now+5d+60s]`

```sql
SELECT (created_at - (now() + interval '5 days')) AS drift
FROM messages WHERE conversation_id='X' AND role='assistant' ORDER BY id DESC LIMIT 1;
-- esperado: |drift| < 60 segundos
```

### P0-05 — Mensagem do user também respeita offset

- Mesmo setup do P0-04
- `SELECT created_at FROM messages WHERE conversation_id='X' AND role='user' ORDER BY id DESC LIMIT 1` retorna timestamp dentro de `[now+5d-60s, now+5d+60s]`

### P0-06 — `conversations.updatedAt` respeita offset

- Mesmo setup P0-04, após agent responder
- `SELECT updated_at FROM conversations WHERE id='X'` retorna timestamp ≥ `now + 5d - 60s` e ≤ `now + 5d + 60s`

### P0-07 — Letta `lastInteractionAt` reflete tempo simulado

- **GIVEN** conv whatsapp simulada X com identidade `phone:+5511SIM-...`, `clockOffsetMs = 5d`, turno completo executado (user+assistant)
- **WHEN** `GET /api/admin/simulator/sessions/X/memory`
- **THEN** response JSON tem `block.lastInteractionAt` ISO dentro de `[now+5d-60s, now+5d+60s]`

### P0-08 — Hint de reativação dispara no turno seguinte

- **GIVEN** conv simulada X com 1 turno completo (user+assistant) gravado em t0; `clockOffsetMs = 5*86400000` aplicado **depois** do primeiro turno; `AJA_DEBUG_MEMORY=1` no servidor
- **WHEN** novo turno é enviado (`POST .../send` body `{"text":"voltei"}`) e agent responde
- **THEN** o último `messages.metadata->>'lettaDebugHint'` (do turno N+1) **inclui** literal `[REATIVAÇÃO]` (ou `[REATIVAÇÃO LONGA]` se ≥ 30d)

```sql
SELECT metadata->>'lettaDebugHint' AS hint
FROM messages WHERE conversation_id='X' AND role='assistant'
ORDER BY id DESC LIMIT 1;
-- esperado: contém '[REATIVAÇÃO]'
```

### P0-09 — `daysSinceLastInteraction` no payload de memória

- Mesmo setup P0-08, antes do 2º turno (apenas avançou tempo, ainda não mandou msg)
- `GET .../memory` → `daysSinceLastInteraction` = 5 (±1 por arredondamento de horas)

### P0-10 — Reset volta gravação a "agora real"

- **GIVEN** conv X com `clockOffsetMs = 10d`, sem mensagem nova após avanço
- **WHEN** `POST .../clock/reset` e em seguida `POST .../send` body `{"text":"reset check"}`
- **THEN** `messages.createdAt` da última msg do user está dentro de `[now-60s, now+60s]` (tempo real, não futuro)

### P0-11 — Endpoints rejeitam conv não-simulada

- **GIVEN** conv real (`is_simulated = false`) com id `Y`
- **WHEN** `POST /api/admin/simulator/sessions/Y/clock` body `{"advanceDays":1}`
- **THEN** HTTP **404** (não 200, não 403). Mesma resposta pra `clock/reset` e `GET memory`.
- **AND** `SELECT metadata FROM conversations WHERE id='Y'` permanece inalterado (sem chave `simulator`)

### P0-12 — Endpoints rejeitam não-admin

- **GIVEN** usuário autenticado com `role != 'admin'` (`user` table) e conv simulada X
- **WHEN** `POST .../clock` body `{"advanceDays":1}`
- **THEN** HTTP **403**

### P0-13 — Endpoints 404 com simulador desligado

- **GIVEN** servidor com `TB_ENV=production` ou flag forçando `isSimulatorEnabled() = false`
- **WHEN** qualquer um dos 3 endpoints é chamado por admin válido
- **THEN** HTTP **404** (mesmo body que rota inexistente)

### P0-14 — Validação `advanceDays` > 0

- **GIVEN** conv simulada X
- **WHEN** `POST .../clock` body `{"advanceDays": 0}`, `{"advanceDays": -5}`, `{"advanceDays": "abc"}`, `{}`
- **THEN** todos retornam HTTP **400** com error body Zod-shaped; DB `clockOffsetMs` permanece inalterado

> **Decisão de design:** `advanceDays = 0` é rejeitado (400). Sem-op explícito não é permitido — operador que quer "checar" usa o GET, não POST.

### P0-15 — Hard cap em `advanceDays`

- **GIVEN** conv simulada X com offset atual `0`
- **WHEN** `POST .../clock` body `{"advanceDays": 3651}`
- **THEN** HTTP **400** com error `"advanceDays excede limite de 3650 dias"` (ou shape Zod equivalente)
- **AND** body `{"advanceDays": 3650}` no mesmo estado **passa** (HTTP 200), offset final = 3650*86400000

### P0-16 — Cap acumulativo

- **GIVEN** conv X com `clockOffsetMs = 3650*86400000 - 86400000` (3649d)
- **WHEN** `POST .../clock` body `{"advanceDays": 2}` (resultaria 3651)
- **THEN** HTTP **400** (cap rejeita acumulado, não só body)

### P0-17 — Conversa real não é afetada (regressão crítica)

- **GIVEN** conv real Y existente antes da feature
- **WHEN** o turno é executado normalmente (web `/api/chat/route.ts` ou whatsapp processor) sem qualquer call aos novos endpoints
- **THEN** `SELECT created_at, now() FROM messages WHERE conversation_id='Y' ORDER BY id DESC LIMIT 1` retorna `created_at` com diff `< 5s` de `now()`. **Zero drift de futuro**.

### P0-18 — Letta `loadContext` real não usa `simulatorNow`

- **GIVEN** conv real Y, com bloco Letta de identidade já criado e `lastInteractionAt` gravado há 7 dias reais
- **WHEN** próximo turno real executa orchestrator
- **THEN** `daysSinceLastInteraction` calculado no `LettaMemoryAdapter.loadContext` é **7** (real), não afetado por nenhum offset (porque ALS está fora de scope)
- **AND** `messages.metadata->>'lettaDebugHint'` (com `AJA_DEBUG_MEMORY=1`) contém `[REATIVAÇÃO]` por dias REAIS

### P0-19 — ALS sobrevive ao fire-and-forget de `storeMemoriesForTurn`

- **GIVEN** conv simulada X com offset 5d, turno em execução dentro de `runWithSimulatorClock`
- **WHEN** orchestrator retorna a resposta ao cliente (handler HTTP retornou), mas `storeMemoriesForTurn` ainda está em execução (await opcional, fire-and-forget)
- **THEN** o `passage` gravado no Letta archival tem `created_at` (no Letta) ou `lastInteractionAt` no bloco humano com tempo futuro (now+5d ± 60s), **não** "agora real"
- **Como verificar:** `GET .../memory` após 10s; `block.lastInteractionAt` está no futuro; `archivalSample[0].createdAt` está no futuro

### P0-20 — Endpoint GET memory retorna shape esperado

- **GIVEN** conv simulada X com 1 turno completo + offset 5d
- **WHEN** `GET /api/admin/simulator/sessions/X/memory`
- **THEN** HTTP 200, JSON com **todas** as chaves obrigatórias:
  - `identity` (objeto `{kind, value, namespace}` ou `null`)
  - `agentExists` (boolean)
  - `block` (HumanMemoryBlock ou `null`)
  - `daysSinceLastInteraction` (number ou `null`)
  - `reactivationHint` (string ou `null`)
  - `archivalSample` (array, comprimento ≤ 10)
  - `clockOffsetMs` (number)
  - `simulatedNow` (string ISO)

### P0-21 — Lint/grep antirregressão para `new Date()` órfão

- **GIVEN** repo no head da feature
- **WHEN** rodar `npm test -- no-new-date` (ou test specific de cobertura via grep) OU executar grep manual:
```bash
grep -rn "new Date(" src/lib/memory/ src/lib/agent/orchestrator/ \
  src/lib/whatsapp/proxy.ts src/lib/whatsapp/simulator-bus.ts \
  src/lib/conversation/messages.ts src/app/api/chat/route.ts \
  src/lib/memory/extractor.ts
```
- **THEN** zero ocorrências fora de allow-list documentada (comentários, testes, ou linhas marcadas explicitamente como "tempo real intencional")

---

## 3. Cenários P1 (alto valor secundário, não bloqueiam)

### P1-01 — Drawer renderiza nos dois canais

- **GIVEN** simulador web `/admin/simulator/web?conversationId=X` e whatsapp `/admin/simulator/whatsapp?conversationId=X`
- **WHEN** página carrega
- **THEN** drawer `<MemoryDevPanel>` está visível, com header "🕰️ Memória" (ou equivalente), botão de colapsar `>`, e largura 320px

### P1-02 — Polling refresh

- **GIVEN** drawer aberto na conv X
- **WHEN** outro admin (ou request via API) muda `clockOffsetMs` da conv X (`POST .../clock`)
- **THEN** dentro de 5s o drawer renderiza o novo "Agora simulado" e nova marca `(+Xd Yh)` sem reload manual

### P1-03 — Reset reflete no drawer

- **GIVEN** drawer aberto, offset > 0
- **WHEN** admin clica botão "↺ Resetar" no drawer
- **THEN** dentro de 3s drawer mostra `Agora simulado = Agora real` e marca `(+0d 0h)` (ou some)

### P1-04 — Botões pré-set funcionam

- **GIVEN** drawer aberto
- **WHEN** admin clica `+1 dia`, depois `+3 dias`, depois `+7 dias`
- **THEN** offset final no DB = `(1+3+7) * 86400000` = `950400000`

### P1-05 — Botão "Avançar X dias…" custom

- **GIVEN** drawer aberto
- **WHEN** admin preenche input com `15` e submete
- **THEN** offset acumula `15*86400000`

### P1-06 — Bloco humano JSON colapsável

- **GIVEN** drawer aberto numa conv com bloco Letta já criado
- **WHEN** admin clica `▾ Bloco humano (JSON)`
- **THEN** seção expande mostrando JSON formatado, indented, com chaves `schemaVersion`, `name` (ou similar), `stage` etc.

### P1-07 — Archival on-demand

- **GIVEN** drawer aberto, seção archival colapsada
- **WHEN** admin clica `▾ Archival (10 últimos)`
- **THEN** dispara request adicional ao endpoint memory **ou** já tem dados; renderiza ≤ 10 entries com snippet truncado (~80 chars)

### P1-08 — Loading states

- **GIVEN** primeira abertura do drawer (sem cache)
- **WHEN** request em voo
- **THEN** drawer mostra skeleton/loading ao invés de empty state vazio enganoso

### P1-09 — Banner Letta circuit aberto

- **GIVEN** Letta intencionalmente desligado (`docker compose stop letta`) e conv simulada X com offset > 0
- **WHEN** `GET .../memory`
- **THEN** drawer renderiza banner `⚠ Letta offline (Noop fallback). Memória não persistirá esta interação.`

### P1-10 — Banner conv web abaixo do threshold

- **GIVEN** conv simulada web nova, 0 turnos
- **WHEN** drawer abre
- **THEN** drawer renderiza `0/3 turnos para criação automática do agent Letta.` (ou texto equivalente). Após 1º turno, `1/3`. Após 2º, `2/3`. Após 3º, agent é criado.

### P1-11 — Conversa whatsapp `SIM-<uuid>` cria identity já no 1º turno

- **GIVEN** conv simulada whatsapp recém-criada (`waId = SIM-<uuid>`)
- **WHEN** 1º turno user
- **THEN** após agent responder, drawer mostra `identity.kind = "phone"`, `identity.value = "<SIM-uuid>"`, `agentExists = true`

### P1-12 — Reactivation hint preview no drawer

- **GIVEN** conv simulada X com offset 5d, turno completo
- **WHEN** drawer carrega
- **THEN** seção "Próximo hint" mostra preview de string contendo `[REATIVAÇÃO]` e referência a "5 dias" (não literal mas próximo)

### P1-13 — Disclaimer visível

- **GIVEN** drawer aberto em qualquer estado
- **THEN** disclaimer "Avançar o tempo afeta apenas esta conversa simulada (`is_simulated=true`). Conversa real não é impactada." está visível no rodapé do painel

---

## 4. Edge cases / cenários adversariais

Cobertura adversarial obrigatória. P0 quando integridade/segurança; P1 quando UX.

### EC-01 (P0) — Race: dois admins clicam +1d simultâneo

- **GIVEN** conv X com `clockOffsetMs = 0`
- **WHEN** duas requests `POST .../clock` body `{"advanceDays":1}` chegam dentro de 50ms (simular com `curl` paralelo ou Promise.all)
- **THEN** offset final é `2*86400000` (não `1*86400000`, não corrupção). Implementação **deve** usar `UPDATE ... SET metadata = jsonb_set(... cast inteiro + soma + cast volta)` em SQL atômico, ou transação com lock, ou re-read+CAS com retry. Test verifica via `SELECT`.

> Se a implementação não suporta atomicidade (race result = 1d) → **FAIL P0**. QA reporta com snippet das duas responses e DB final.

### EC-02 (P0) — Avançar tempo durante streaming SSE

- **GIVEN** conv simulada X, turno em curso (request SSE aberto, agent ainda transmitindo)
- **WHEN** admin clica `+5d` no painel (request `POST .../clock` paralelo)
- **THEN** o turno em curso (streaming) **não** muda seu offset (mensagem do agent grava com offset antigo, possivelmente 0). O próximo turno (após streaming fechar) usa offset novo.
- **Verificar:** msg do agent N tem `createdAt ≈ now` (offset antigo); msg do agent N+1 (próximo turno) tem `createdAt ≈ now+5d`

### EC-03 (P0) — Letta circuit aberto durante avanço

- **GIVEN** Letta parado (`docker compose stop letta`), conv simulada X
- **WHEN** `POST .../clock` body `{"advanceDays":1}` E em seguida `POST .../send` body `{"text":"hello"}`
- **THEN** clock endpoint retorna 200 (não depende de Letta); send endpoint retorna 200 com fallback Noop (msg gravada no DB com offset, mas sem persistir em Letta); `messages.createdAt` no futuro. Drawer mostra banner offline.

### EC-04 (P0) — `isSimulatorEnabled() = false` em prod

- **GIVEN** servidor com flag `false`
- **WHEN** qualquer um dos 3 endpoints chamado
- **THEN** HTTP 404; **AND** `simulatorNow()` invocado em código real ainda retorna `new Date()` puro (zero impacto). Test unit em `simulator-clock.test.ts` cobre.

### EC-05 (P0) — Conversa simulada do parceiro (cross-tenant)

- **GIVEN** admin A criou conv simulada X (`metadata.createdBySimUserId = A`); admin B (também role admin) tenta `POST /api/admin/simulator/sessions/X/clock`
- **THEN** comportamento documentado: **200** (admin é admin global, sem isolamento por owner) OU **403** (decisão de design). **Plano adota 200** (consistente com hoje — não há isolamento por owner em `/admin/simulator/sessions`). QA confirma e registra.

### EC-06 (P0) — `is_simulated` flipado em runtime

- **GIVEN** conv X criada com `is_simulated=true`, offset 5d, depois `UPDATE conversations SET is_simulated=false WHERE id='X'` à mão (cenário adversarial não-suportado)
- **WHEN** `POST .../clock` body `{"advanceDays":1}`
- **THEN** HTTP 404 (validação no endpoint usa `conv.isSimulated === true`)

### EC-07 (P0) — Reset com `lastInteractionAt` futuro no Letta

- **GIVEN** conv simulada X, offset 10d aplicado, 1 turno completo (Letta block tem `lastInteractionAt ≈ now+10d`)
- **WHEN** `POST .../clock/reset` e em seguida `POST .../send` body `{"text":"agora"}`
- **THEN** `messages.createdAt` da nova msg ≈ `now` (real). Letta `daysBetween(lastInteractionAt_futuro, simulatorNow())` é **negativo** (~ -10d). Implementação deve tratar: `daysBetween` retorna `null` ou `0` quando negativo, OU código de reativação ignora dias negativos. **Não pode disparar `[REATIVAÇÃO LONGA]` com valor negativo absurdo nem crashar.** Verificar `metadata.lettaDebugHint` da nova msg não contém literal `-10` nem `NaN` nem string vazia inesperada.

### EC-08 (P0) — Offset que estoura JS safe integer

- **GIVEN** conv X
- **WHEN** body `{"advanceDays": Number.MAX_SAFE_INTEGER}` (>> 3650)
- **THEN** HTTP 400 (rejeitado pelo cap), NÃO crash de serialização

### EC-09 (P1) — `advanceDays` decimal

- **WHEN** body `{"advanceDays": 1.5}`
- **THEN** HTTP 400 (Zod `int()`) OU truncado para 1 (decisão registrada). **Plano adota 400** (integer estrito) — operador que quer "12h" não tem suporte agora.

### EC-10 (P1) — `advanceDays` string parseável

- **WHEN** body `{"advanceDays": "5"}`
- **THEN** HTTP 400 (Zod number estrito)

### EC-11 (P0) — Conv web abaixo do threshold (1-2 turnos)

- **GIVEN** conv simulada web com 1 turno user+assistant (agent Letta ainda não criado — threshold 3)
- **WHEN** `POST .../clock` `{"advanceDays":3}` e em seguida 2º turno
- **THEN** clock funciona (offset persistido), 2º turno grava `messages.createdAt` no futuro. `GET .../memory` retorna `agentExists: false`, `block: null`, `daysSinceLastInteraction: null`, `reactivationHint: null`. UI mostra "X/3 turnos". **Nada crasha.**

### EC-12 (P0) — Phone identity reconcile depois de avanço

- **GIVEN** conv simulada whatsapp X com offset 5d, 1 turno; phone identity já criada
- **WHEN** reconciler dispara (cenário existente — `reconcileIdentity()`) trocando para cookie destino
- **THEN** próximo turno usa agent destino, `lastInteractionAt` no destino é gravado com `simulatorNow()` (futuro), drawer reflete novo `identity`

### EC-13 (P1) — Reset com 0 turnos

- **GIVEN** conv simulada X recém-criada, sem turnos
- **WHEN** `POST .../clock/reset`
- **THEN** HTTP 200; offset permanece 0 (idempotente); sem erro

### EC-14 (P0) — Idempotência do reset

- **GIVEN** conv simulada X, offset = 5d
- **WHEN** `POST .../clock/reset` chamado 3x consecutivas
- **THEN** todas retornam 200; DB final tem `clockOffsetMs = 0`; `clockAdvancedAt` atualizado a cada chamada

### EC-15 (P0) — `messages.createdAt` ordering preservada

- **GIVEN** conv X, 2 turnos no tempo real (t0, t1), depois +5d offset, depois 2 turnos (t2, t3 ≈ t1+5d)
- **THEN** `SELECT created_at FROM messages WHERE conversation_id='X' ORDER BY id` retorna timestamps **estritamente crescentes** (t0 < t1 < t2 < t3). Sem buracos ou inversões.

### EC-16 (P1) — Polling 3s não esmaga Letta

- **GIVEN** drawer aberto por 60s
- **THEN** observar logs do Letta (`docker compose logs letta`) — não mais de ~22 requests do endpoint memory (3s polling, ±1 jitter aceitável). Implementação **deve** cachear bloco por 1s no servidor pra reduzir.

### EC-17 (P0) — Endpoints rejeitam JSON malformado

- **WHEN** `POST .../clock` body inválido (texto plano "abc", JSON truncado)
- **THEN** HTTP 400, sem crash do server (sem 500)

### EC-18 (P0) — Endpoints sem auth retornam 401

- **WHEN** request sem cookie de sessão
- **THEN** HTTP 401 (de `requireRole("admin")`). Não 200, não 500.

### EC-19 (P1) — Conv inexistente

- **WHEN** `POST /api/admin/simulator/sessions/00000000-0000-0000-0000-000000000000/clock` `{"advanceDays":1}`
- **THEN** HTTP 404

---

## 5. Regressões prováveis (anti-regressão crítica)

A substituição de `new Date()` por `simulatorNow()` em arquivos compartilhados com path real é o maior risco. Cada item abaixo é P0.

### REG-01 — `messages.createdAt` em conversa real

- **GIVEN** conv real Y (`is_simulated=false`), web ou whatsapp
- **WHEN** turno é executado normalmente
- **THEN** `created_at` da nova msg está dentro de `[now-2s, now+2s]` (com tolerância de 2s pra rede/serialização)
- **Verificação SQL:**
```sql
SELECT EXTRACT(EPOCH FROM (created_at - now())) AS drift_seconds
FROM messages WHERE conversation_id='Y' ORDER BY id DESC LIMIT 1;
-- |drift_seconds| < 2
```

### REG-02 — Lead-collection em conversa real

- **GIVEN** conv real Y, fluxo de lead collection ativo (`/api/lead` ou orchestrator/lead-collection)
- **WHEN** lead é gravado
- **THEN** `leads.created_at`, `leads.updated_at` no DB estão dentro de `[now-2s, now+2s]`

### REG-03 — Handoff real (não simulado) registra timestamp atual

- **GIVEN** conv real Y; gatilho de handoff dispara
- **WHEN** `conversations.handoff_status` muda
- **THEN** `updated_at` da conv ≈ `now` real

### REG-04 — Reactivation real continua disparando por dias reais

- **GIVEN** conv real Y, identidade Letta com `lastInteractionAt` há 3 dias reais (forjar via update do bloco se necessário)
- **WHEN** novo turno user
- **THEN** `metadata.lettaDebugHint` contém `[REATIVAÇÃO]` referenciando 3 dias (REAIS, não simulados). Nada de offset interfere porque ALS está fora do scope.

### REG-05 — Dashboard analytics não vaza dados simulados

- **GIVEN** conv simulada X com 5 mensagens, todas com `createdAt = now+5d`; queries de dashboard que filtram `is_simulated = false`
- **WHEN** dashboard agrega mensagens "do dia"
- **THEN** mensagens de X **não aparecem** (filtro correto); sem mensagens com `createdAt > now` (futuro) no resultado real
- **Verificação:**
```sql
SELECT count(*) FROM messages m
JOIN conversations c ON m.conversation_id=c.id
WHERE NOT c.is_simulated AND m.created_at > now() + interval '1 hour';
-- esperado: 0
```

### EC bonus — Whatsapp proxy retry em conv real

- **GIVEN** conv real whatsapp Y; webhook retry do Meta (idempotência por `wamid`)
- **WHEN** mesma msg processada 2x
- **THEN** comportamento idêntico ao baseline (sem `simulatorNow` impactar). Test integration existente cobre — verificar que ainda passa.

---

## 6. Cenários de fidelidade do simulador (paridade com prod)

### FID-01 (P0) — Threshold web 3 turnos preservado

- **GIVEN** conv simulada web X, 0 turnos; offset = 0
- **WHEN** turno 1 do user (msg + reply do agent), turno 2, turno 3
- **THEN** apenas no turno 3 (ou 4 — confirmar literal da `THRESHOLD_TURNS` no código de Letta) o agent Letta é criado. Antes disso, `GET .../memory` retorna `agentExists: false`. Comportamento idêntico ao real.

### FID-02 (P0) — WhatsApp `SIM-<uuid>` produz phone identity

- **GIVEN** conv simulada whatsapp criada via POST sessions; waId = `SIM-<uuid>` (validar com regex)
- **WHEN** 1º turno
- **THEN** `GET .../memory` retorna `identity = {kind: "phone", value: "SIM-<uuid>", namespace: "aja-..."}` no 1º turno (sem threshold — whatsapp cria já)

### FID-03 (P0) — Memory store fire-and-forget sobrevive após handler retornar

- **GIVEN** conv simulada X, offset 5d, turno em execução
- **WHEN** handler HTTP retorna (cliente já recebeu resposta), mas `storeMemoriesForTurn` ainda em await fora do scope HTTP
- **THEN** após 30s, `GET .../memory` retorna `block.lastInteractionAt` no futuro (ALS sobreviveu ao await final). Não há gravação com timestamp "agora".
- **Verificar logs:** sem warning `als.getStore() returned undefined inside storeMemories`.

### FID-04 (P0) — Eval LLM ainda roda sem regressão

- **GIVEN** eval suite (`npm run eval` ou equivalente, se gate `EVAL_RUN=1`)
- **WHEN** rodar suite contra conv real Y
- **THEN** resultados idênticos ao baseline (mesmo eval pré-feature)

### FID-05 (P1) — Persona Bruno/Helena/Rafael não muda com simulator

- **GIVEN** conv simulada X com category moto, persona Bruno
- **WHEN** turno executado, com ou sem offset
- **THEN** specialist persona é Bruno (idêntico ao real); orchestrator não logga `no active specialist persona`

---

## 7. Dados de teste / fixtures

### Conversas

| Alias | Criação | Propósito |
|---|---|---|
| `SIM_WA_NEW` | `POST /api/admin/simulator/sessions` body `{"channel":"whatsapp"}` | Whatsapp simulada zerada (P0-01..10) |
| `SIM_WA_5D` | `SIM_WA_NEW` + `POST .../clock` `{"advanceDays":5}` | Whatsapp simulada com offset 5d (P0-04..09) |
| `SIM_WEB_NEW` | `POST /api/admin/simulator/sessions` body `{"channel":"web"}` | Web simulada zerada (FID-01) |
| `REAL_WA` | conv existente do dev workspace (ou seed) com `is_simulated=false` | Anti-regressão (REG-01..05, P0-17/18) |
| `REAL_WEB` | idem web | idem |

Seeds disponíveis em `npm run db:seed` (se houver) ou criados ad-hoc no início da execução do QA.

### Usuários

- **Admin:** seed em `user` table, role=admin, login via UI ou cookie de teste do `.env.test`. Conferir `secrets.sh e2e-decrypt aja-agora`.
- **Não-admin:** criar via `INSERT INTO user (..., role) VALUES (..., 'user')` se não houver fixture.

### Modo de inspeção via psql

```bash
docker compose exec aja-db psql -U aja -d aja
```

Queries úteis:
```sql
-- offset atual
SELECT metadata->'simulator'->>'clockOffsetMs' FROM conversations WHERE id='X';

-- timestamps recentes
SELECT id, role, created_at, metadata->>'lettaDebugHint' AS hint
FROM messages WHERE conversation_id='X' ORDER BY id DESC LIMIT 5;

-- drift contra now()
SELECT id, role, EXTRACT(EPOCH FROM (created_at - now())) AS drift_s
FROM messages WHERE conversation_id='X' ORDER BY id DESC LIMIT 5;

-- conversas com timestamps no futuro (deve ser só simuladas)
SELECT c.id, c.is_simulated, MAX(m.created_at) AS last_msg
FROM conversations c JOIN messages m ON m.conversation_id=c.id
WHERE m.created_at > now() + interval '1 day'
GROUP BY c.id, c.is_simulated;
```

Inspeção Letta:
```bash
curl -s "http://aja-<workspace>.orb.local/api/admin/simulator/sessions/X/memory" \
  -H "cookie: <admin-session>" | jq
```

---

## 8. Output esperado por cenário (resumo de assertions)

| Cenário | DB assertion | API assertion | UI assertion |
|---|---|---|---|
| P0-01 | `metadata->'simulator'->>'clockOffsetMs' = '432000000'` | HTTP 200 + body shape | — |
| P0-04 | `messages.created_at` drift < 60s contra `now+5d` | — | — |
| P0-07 | — | `block.lastInteractionAt` futuro | — |
| P0-08 | `metadata->>'lettaDebugHint'` contém `[REATIVAÇÃO]` | — | — |
| P0-11 | metadata inalterado | HTTP 404 | — |
| P0-13 | — | HTTP 404 (3 endpoints) | — |
| P1-01 | — | — | drawer presente, 320px |
| P1-02 | — | — | drawer reflete novo offset ≤ 5s |
| EC-01 | `clockOffsetMs = 2*86400000` após 2 calls paralelas | HTTP 200 nas duas | — |
| EC-07 | `lettaDebugHint` da próxima msg não contém `-10` nem `NaN` | — | drawer mostra `daysSinceLast` ≥ 0 ou `null` |
| REG-01 | `created_at` real drift < 2s | — | — |
| REG-05 | `count(*)` futuro real = 0 | — | — |
| FID-03 | `block.lastInteractionAt` futuro após handler retornar | — | — |

Cada cenário **deve** ter evidência anexa no QA report:
- DB assertion → screenshot do `\set` do psql OU output JSON
- API assertion → curl --include com headers/body
- UI assertion → screenshot Playwright do drawer

---

## 9. Pontos de falha conhecidos do domínio

### ALS pode não propagar

- **Risco:** `process.nextTick`, `setImmediate`, ou `queueMicrotask` chamados sem `als.run` wrap quebram contexto.
- **Mitigação:** integration test específico em FID-03 verifica `storeMemoriesForTurn` (fire-and-forget) ainda vê `als.getStore()`. Se falhar, suspeitar de await tardio fora do scope da função decorada — refatorar pra que o `runWithSimulatorClock` envolva o promise inteiro, incluindo fire-and-forget.

### Letta latência variável (flake potencial)

- **Risco:** `passages POST` pode levar 6-10s; assertions em ≤ 3s flakam.
- **Mitigação:** assertions com `waitForFunction`/`waitFor` até 15s; nunca `waitForTimeout`. Em SQL, esperar até count >= esperado, polling 500ms cap 20s. Documentar no QA report tempo médio.

### Polling 3s esconde bug

- **Risco:** drawer "passa" porque polling atualizou, mas mudança não foi disparada por intent do user.
- **Mitigação:** P1-02 assertion **deve** verificar valor antes do polling e depois, com timestamp do `(+Xd Yh)` mudando. Não basta "drawer mostra 5d" — tem que mostrar **mudança após ação**.

### `daysBetween` negativo após reset

- **Risco:** após reset, próximo turno vê `lastInteractionAt` futuro + `simulatorNow() = now real` → diff negativo. Função pode quebrar reactivation hint, gerar string com `-10 dias`, ou retornar `null`.
- **Mitigação:** EC-07 cobre. Decisão de design: `daysBetween` deve clampar a `0` quando negativo, ou retornar `null`. Cálculo de reactivation hint trata `null` como "primeira interação" (sem hint).

### Race `metadata` jsonb não-atômico

- **Risco:** Drizzle default `update().set({metadata: ...})` lê metadata existente no client e reescreve — last write wins, perde concorrência.
- **Mitigação:** EC-01 cobre. Implementação **deve** usar `sql\`jsonb_set(metadata, '{simulator,clockOffsetMs}', to_jsonb(...))\`` ou similar atômico, ou wrap em `db.transaction(... SELECT FOR UPDATE ...)`.

### Conversa real com `is_simulated` flipado por bug futuro

- **Risco:** desenvolvedor flippa `is_simulated` em uma conv real por engano, time-travel vaza pra prod.
- **Mitigação:** validação `conv.isSimulated === true` em todos endpoints. Runtime `runWithSimulatorClock` só é wrapado em paths gateados por `isSimulated && isSimulatorEnabled()`. EC-06 verifica.

### Browser cache do drawer

- **Risco:** após reset, frontend cacheia offset antigo.
- **Mitigação:** P1-03 verifica refresh dentro de 3s; SWR/react-query (se usado) deve invalidar onMutate.

---

## 10. Checklist final — gate "feature pronta"

Apenas declarar feature pronta quando **todos** os itens abaixo estiverem ✓.

- [ ] **All P0** (P0-01..21) PASS — verificado por QA Crítico com evidência
- [ ] **All REG** (REG-01..05) PASS — anti-regressão real
- [ ] **All FID** (FID-01..04) PASS — paridade simulador↔real
- [ ] **EC-01, EC-02, EC-03, EC-04, EC-05, EC-06, EC-07, EC-08, EC-11, EC-12, EC-14, EC-15, EC-17, EC-18** PASS — edges adversariais P0
- [ ] **P1 ≥ 80%** PASS (drawer UX) — não bloqueador absoluto mas justificar cada FAIL
- [ ] **Grep antirregressão** (P0-21) zero ocorrências fora de allow-list
- [ ] **Typecheck** `npm run typecheck` exit 0
- [ ] **Unit suite** `npm test` 0 falhas (incluindo `simulator-clock.test.ts` novo, `extractor.test.ts` ampliado)
- [ ] **Integration suite Letta** `MEMORY_ADAPTER=letta npm run test:integration` (ou equivalente) 0 falhas
- [ ] **Playwright E2E** `simulator-time-travel.spec.ts` PASS (web + whatsapp)
- [ ] **Anti-regressão suíte existente** todos os testes da branch base continuam verdes
- [ ] **Manual smoke prod-like:** rodar `TB_ENV=production npm run start` local; confirmar 404 em todos 3 endpoints novos
- [ ] **DB inspect final:** zero conversas com `is_simulated=false` tendo mensagens no futuro (`REG-05` query)
- [ ] **Letta inspect final:** zero blocks de conv real com `lastInteractionAt > now+1h`
- [ ] **Done-report** preparado em `.done/2026-05-XX-simulator-time-travel.md`

**Critério de não-negociação:** se qualquer P0 falhar, corrigir e re-rodar. Não negociar critério pra fechar feature.

---

## 11. Notas de execução pro QA Crítico

- Rodar todos os P0 **antes** dos P1; não economizar nos edges.
- Cada FAIL deve trazer evidência reproduzível: comando exato, response completo (curl --include), screenshot do psql, screenshot do drawer.
- Suspeito de race em EC-01 → rodar 10x consecutivas, reportar distribuição.
- Suspeito de ALS quebrar (FID-03) → adicionar log temporário no `storeMemoriesForTurn` `console.log('als-store:', als.getStore())` e capturar.
- Letta intermitente → registrar latência média e p95 das chamadas a `GET .../memory` no relatório.
- Sempre verificar **ambos os canais** (web e whatsapp) nos P0 onde aplicável — bugs aparecem em um e não no outro com frequência.

**Persona do QA:** chato, adversarial, primeiro QA do produto. Não aceitar "deveria funcionar". Tudo verificado, tudo com evidência, tudo binário.

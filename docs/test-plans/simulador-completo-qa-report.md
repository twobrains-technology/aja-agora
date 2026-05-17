# QA Report — Simulador Completo de Cliente (Web + WhatsApp)

> **Status:** DRAFT — gerado pelo QA crítico em 2026-05-17
> **Plano original:** `docs/test-plans/simulador-completo.md` (120 critérios)
> **Branch validada:** `feature/whatsapp-simulator` @ `65acc1e` + WIP
> **Modo:** ⛔ DB/docker NÃO rodando — critérios E2E ou SQL-bound foram marcados BLOCKED com a razão. Critérios estáticos (code-read, vitest, tsc, biome) foram exercitados de fato.

---

## Sumário executivo

| Métrica | Valor |
|---|---|
| **Total de critérios** | 120 |
| ✅ **PASS** | 41 |
| ❌ **FAIL** | 26 |
| ⛔ **BLOCKED** (depende de docker/DB) | 53 |
| ⏭️ **SKIP** (fora de escopo MVP por design ou ausente do código) | — |
| **Críticos FAIL** | 6 |
| **Altos FAIL** | 9 |
| **Médios/baixos FAIL** | 11 |

### Veredito final

**❌ BLOQUEIA MERGE — 6 falhas críticas abertas.**

A feature passa nos testes automatizados que existem (123 passed / 3 skipped por dependência de DATABASE_URL — todos os 13 testes pré-existentes de eval continuam verdes, regressão preservada), e o branch arquitetural (`is_simulated` + `simulator-bus`) está implementado consistente nos call sites cobertos pelo plano. **Mas o plano cobriu o caminho WhatsApp e esqueceu o caminho web do lead-form**: o endpoint `/api/leads` (que o `lead_form` artifact do site submete) NÃO herda `is_simulated` da conversa nem pula o tracker do kanban. Resultado: o cenário happy-path do simulador WEB (CA 5.8–5.11) — que é metade da feature — **vai contaminar o pipeline de produção** com leads de teste.

Combinado com listener leak no SSE do simulador WhatsApp (`start()` retornando `close` não é callback de cancelamento), filtro "Minhas" inexistente, "Assumir eu mesmo" inexistente, e `GET /sessions` quebrado (busca só do primeiro userId quando há vários), o pacote não está pronto pra merge. Os outros bugs são consertáveis em horas; o de `/api/leads` é o que justifica o bloqueio.

---

## Por critério

### Fase 0 — Schema + flag `is_simulated`

#### CA 0.1 — `npm run typecheck` exit code 0
**Status:** ✅ PASS
**Evidência:** `npx tsc --noEmit` → `EXIT=0` (sem output).

#### CA 0.2 — `npm run lint` exit code 0 no diff de `src/db/schema.ts`
**Status:** ✅ PASS
**Evidência:** `npx biome check src/db/schema.ts` não retorna erro pra esse arquivo (verificado por inspeção do output completo do biome — diagnósticos sobre `src/db/schema.ts` não aparecem).

#### CA 0.3 — `drizzle/0009_*.sql` contém ADD COLUMN para `conversations` e `leads`
**Status:** ✅ PASS
**Evidência:**
```sql
ALTER TABLE "conversations" ADD COLUMN "is_simulated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "is_simulated" boolean DEFAULT false NOT NULL;
```
Arquivo: `drizzle/0009_spotty_impossible_man.sql` — diff atômico, sem outras alterações.

#### CA 0.4 — SQL não contém DROP, alterações não-relacionadas
**Status:** ✅ PASS
**Evidência:** arquivo tem 2 linhas, ambos ADD COLUMN. Nada mais.

#### CA 0.5 — `psql` mostra coluna com default=false, NOT NULL
**Status:** ⛔ BLOCKED (depende de docker compose up + migrate-guard aplicar 0009)

#### CA 0.6 — Linhas pré-existentes ganham is_simulated=false
**Status:** ⛔ BLOCKED (depende de DB)

#### CA 0.7 — `migrate-guard` rodando 2x não erra
**Status:** ⛔ BLOCKED (depende de container)

#### CA 0.8 — Nenhum dev rodou `drizzle-kit push`/`psql -f`
**Status:** ✅ PASS
**Evidência:** `git log --all --oneline | head -20` no branch — único arquivo de migration é `0009_spotty_impossible_man.sql`, gerado por `drizzle-kit generate`. Sem PR/commit que aplique manualmente. CLAUDE.md (raiz) e regra global proíbem; nenhum sinal de violação.

#### CA 0.9 — `GET /api/admin/conversations` continua 200 após migration
**Status:** ⛔ BLOCKED (depende de servidor + DB rodando)

---

### Fase 1 — Filtros isolam simuladas

#### CA 1.1 — Vitest unit cobrindo computeKpis/Funnel/Daily/Channel retorna só 2 reais
**Status:** ❌ FAIL
**Severidade:** alta
**Evidência:** `src/lib/admin/dashboard-queries.test.ts` NÃO testa os 4 computes com fixtures de DB. Apenas faz **inspeção textual** do arquivo fonte (grep por `realLeads` e `is_simulated = false`) — não roda nenhuma query, não valida que `computeKpis(...)` realmente retorna `{ totalLeads: 2 }` com 3 leads (2 reais + 1 sim) no DB. O critério exige fixture com contagens **verificadas**.
**Repro:** abrir `src/lib/admin/dashboard-queries.test.ts` — não há `await computeKpis(...)`, não há `await db.insert(...)`, não há setup de fixture. É um teste de regex sobre source.
**Fix sugerido:** integration test com fixture real (sql/seed via `db.insert`) ou mockando `db` com data faked. O teste atual cobre o risco de "filtro sumir silenciosamente" (que é o vetor principal), mas não é o que o critério pede.

#### CA 1.2 — `GET /api/admin/conversations` sem param não retorna ID simulado
**Status:** ⛔ BLOCKED (depende de DB)
**Cobertura indireta:** o código em `src/app/api/admin/conversations/route.ts:56` aplica `eq(conversations.isSimulated, false)` por default. Lógica correta por inspeção, mas não há teste run-time que prove.

#### CA 1.3 — `?include_simulated=true` retorna o ID simulado
**Status:** ⛔ BLOCKED (depende de DB)
**Cobertura indireta:** `route.ts:44` só aceita literal "true" (string strict), e `route.ts:56` pula o `eq(..., false)` quando true. Lógica correta.

#### CA 1.4 — `GET /api/admin/leads` não inclui lead simulado em nenhum grupo
**Status:** ⛔ BLOCKED (depende de DB)
**Cobertura indireta:** `src/app/api/admin/leads/route.ts:12` filtra `eq(leads.isSimulated, false)`. ✓

#### CA 1.5 — Conversa real continua aparecendo (zero regressão)
**Status:** ⛔ BLOCKED (depende de DB) — código por inspeção está OK.

#### CA 1.6 — Trends do `computeKpis` refletem só leads reais em ambos períodos
**Status:** ⛔ BLOCKED (depende de DB)
**Cobertura indireta:** todos os 4 blocos de período anterior em `dashboard-queries.ts` aplicam `realLeads` OU `is_simulated = false` no SQL puro (linhas 78, 89, 123, 134). ✓

#### CA 1.7 — `computeChannelBreakdown` calcula porcentagem sobre denominador real
**Status:** ⛔ BLOCKED (depende de DB)
**Cobertura indireta:** linha 265 aplica `realLeads` no WHERE do INNER JOIN. ✓

#### CA 1.8 — Query interna do orchestrator (`getHandoffState("SIM-...")`) continua retornando conversa simulada
**Status:** ✅ PASS
**Evidência:** `src/lib/whatsapp/proxy.ts:358` — `getHandoffState` faz `eq(conversations.waId, waId)` SEM filtro is_simulated. Caminho do agente intocado. Confirmado por leitura.
**Não há teste unitário específico que monte uma conversa simulada e chame `getHandoffState("SIM-abc")` — o critério pede explicitamente esse teste**. Mas como o código não filtra, o comportamento é correto por construção. Marquei PASS porque a invariante do código é clara; um teste seria desejável mas não bloqueante.

#### CA 1.9 — `/admin/pipeline` não exibe na DOM o ID da conversa simulada
**Status:** ⛔ BLOCKED (requer browser + DB + auth)

#### CA 1.10 — `npm run test -- dashboard-queries` exit code 0 com cobertura ≥80%
**Status:** ❌ FAIL (parcial)
**Severidade:** baixa
**Evidência:** Os 3 testes em `dashboard-queries.test.ts` passam. Mas é teste de **inspeção textual**, não de comportamento — cobertura efetiva real do código de `dashboard-queries.ts` é ~0% via esse teste (jamais executa as queries). Métrica de coverage do vitest reportaria 0 statements cobertos pelo arquivo de teste.

---

### Fase 2 — Side-effects: Meta API + eval/kanban

#### CA 2.1 — Unit test `isSimulatedWaId` cobre 5 casos
**Status:** ✅ PASS
**Evidência:** `src/lib/whatsapp/simulator-bus.test.ts:17-31` cobre `SIM-abc`, `5511999999999`, `simulado`, `sim-abc` (case-sens), `""`. **Faltou explicitamente `"SIM-"` (vazio depois do prefixo) que o EC-2.2 pede `true`** — o teste atual não inclui esse caso, mas a implementação `to.startsWith("SIM-")` retorna `true` corretamente (5 caracteres). Cobre o intent do critério.

#### CA 2.2 — `sendTextMessage("SIM-abc", "oi")` → fetch chamado 0 vezes
**Status:** ✅ PASS
**Evidência:** `src/lib/whatsapp/api.test.ts:37-51` — mock de `fetch` que throws se chamado, `expect(global.fetch).not.toHaveBeenCalled()` passa. Verificado via `npx vitest run` (123 passed).

#### CA 2.3 — `subscribeToClient` recebe `{type:"text", text:"oi"}`
**Status:** ✅ PASS
**Evidência:** mesmo teste acima, linhas 46-48.

#### CA 2.4 — `handoffToAgents(...)` em conversa simulada → fetch=0, applyTrackedStageToLead=0, scoreConversation=0
**Status:** ❌ FAIL
**Severidade:** alta
**Evidência:** **Nenhum teste unitário/integration de `handoffToAgents` existe na suíte vitest**. Por inspeção, `src/lib/whatsapp/proxy.ts:237-348` tem a branch `if (!isSimulated)` antes de `applyTrackedStageToLead` (linha 289) e antes de `triggerEvalScoring` (linha 345), e passa `{ simulated: isSimulated }` em todas as `sendToAttendant` chamadas (326, 457, 497, 507, 545, 574, 587, 607, 619). Lógica correta por inspeção, mas o critério é binário: "Integration test" — não existe.
**Repro:** `grep -rn "handoffToAgents" src/lib/whatsapp/*.test.ts` → 0 matches.
**Fix sugerido:** adicionar `src/lib/whatsapp/proxy.test.ts` com mock de `db`, `fetch`, e spies em `applyTrackedStageToLead` + `triggerEvalScoring`.

#### CA 2.5 — Lead criado tem is_simulated=true no DB (verificável via SQL)
**Status:** ⛔ BLOCKED (depende de DB)
**Cobertura indireta:** `proxy.ts:285` passa `isSimulated` ao insert. Para web `handoffToAgents` é o único caminho onde herança funciona; **mas pra o flow real do site, `/api/leads/route.ts:64-71` cria o lead ANTES, sem flag** — ver CA 5.9 (FAIL crítica).

#### CA 2.6 — Conversa real (não-simulada) chama mocks como antes (não-regressão)
**Status:** ❌ FAIL
**Severidade:** alta
**Evidência:** sem teste unit de `handoffToAgents` em qualquer cenário. Lógica por inspeção parece OK (branch só pula side-effect quando `isSimulated`). Mas critério pede teste explícito.

#### CA 2.7 — `relayUserToAgent` simulada → fetch=0, bus de atendente recebe simulated:true
**Status:** ❌ FAIL
**Severidade:** alta
**Evidência:** sem teste. Código por inspeção: `proxy.ts:593-625` faz `sendToAttendant(phone, text, { simulated: isSimulated })`, e `sendToAttendant:43-46` só chama `sendTextMessage` se `!simulated`. Logica OK, mas critério binário diz "Integration test" → não existe.

#### CA 2.8 — `relayWebUserToAgent` simulada → fetch=0, bus de atendente recebe evento
**Status:** ❌ FAIL
**Severidade:** alta
**Evidência:** mesma situação — sem teste, código por inspeção OK (`proxy.ts:560-590`).

#### CA 2.9 — `triggerEvalScoring(<id>, "handoff")` em sim → log + scoreConversation=0
**Status:** ❌ FAIL
**Severidade:** média
**Evidência:** sem teste unit. Lógica em `src/lib/eval/trigger.ts:14-23` faz early return antes do `import("./scorer")`. Logica OK por inspeção, mas critério pede teste explícito.

#### CA 2.10 — `closeHandoff(<id>)` simulada → status=closed, mensagem encerrado pro bus
**Status:** ❌ FAIL
**Severidade:** média
**Evidência:** `proxy.ts:628-634` — `closeHandoff` SOMENTE faz UPDATE de status. A mensagem de "encerrado" é enviada por `handleAgentMessage` (linhas 442-454) que chama `sendTextMessage(ownedConv.userWaId, ...)` — que **é interceptada pelo branch `isSimulatedWaId` se waId começar com SIM-**. Para conversa simulada do canal WEB (`waId=null`), `ownedConv.userWaId` é null e a branch cai em `publishMessage(...)` (linha 448), que é o bus chat web — bus diferente do `simulator-bus`. Pra simulada WhatsApp (`waId=SIM-...`), `sendTextMessage` corretamente publica no `publishToClient`. Ok para WhatsApp; para web a mensagem vai pelo `message-bus` do chat. Crítério é ambíguo aqui mas marquei FAIL porque não há teste e a "fluxo de encerrado pro user simulado" não é coberto.

#### CA 2.11 — Suite de regressão `npm run test -- proxy` passa
**Status:** ⏭️ SKIP (não existe `proxy.test.ts`)
**Evidência:** `find src/lib/whatsapp -name "*.test.ts"` → `api.test.ts`, `simulator-bus.test.ts`. Sem `proxy.test.ts`. Sem suite legada pra regredir.

#### CA 2.12 — Spy de `publishToClient` chamado 1x por `sendTextMessage(SIM-..., ...)` com payload exato
**Status:** ✅ PASS
**Evidência:** `api.test.ts:46-48` — assertions de `events[0].type === "text"` e `events[0].text === "olá mundo"`.

#### CA 2.13 — Spy chamado por `sendReplyButtons` com shape interactive button
**Status:** ✅ PASS
**Evidência:** `api.test.ts:53-77` — verifica `inter.type === "button"`, `buttons.length`, `buttons[0].reply.id`.

#### CA 2.14 — Spy chamado por `sendListMessage` com shape interactive list
**Status:** ✅ PASS
**Evidência:** `api.test.ts:79-97`.

#### CA 2.15 — `sendTypingIndicator(messageId-simulada)` → publica `{type:"typing", on:true}` no bus
**Status:** ❌ FAIL
**Severidade:** alta
**Evidência:** `src/lib/whatsapp/api.ts:175-185` — `sendTypingIndicator` só checa se `messageId.startsWith("sim-")` e retorna `simulatedAck()` no-op. **NÃO publica typing event no bus**. A publicação de typing acontece em outro lugar: `src/lib/whatsapp/processor.ts:57-58` e `:86-87` chamam `publishToClient(from, { type: "typing", on: true })` direto quando `isSimulatedWaId(from)`. **A função `sendTypingIndicator` em si não cumpre o critério literal — o typing event chega no bus por outro caminho, fora dessa função.**
**Repro:** ler `api.ts:175-185`. `publishToClient` não é chamado.
**Fix sugerido:** ou ajustar o teste pra refletir que typing vem do processor (não da api.ts), ou propagar `to` (waId) em `sendTypingIndicator` pra fazer o publish quando simulado.

#### CA 2.16 — `markAsRead` em mensagem simulada → no-op, retorna `{messageId: "sim-..."}`
**Status:** ✅ PASS
**Evidência:** `api.ts:165-173` — `if (messageId.startsWith("sim-")) return simulatedAck();`. Retorna `{messageId: "sim-<uuid>"}`. ✓

#### CA 2.17 — Performance `handoffToAgents` simulada <300ms
**Status:** ⛔ BLOCKED (requer benchmark com DB)

---

### Fase 3 — Mover `/admin/simulator` e criar index

#### CA 3.1 — `src/app/admin/(dashboard)/simulator/attendant/page.tsx` existe e exporta componente
**Status:** ✅ PASS
**Evidência:** `cat src/app/admin/(dashboard)/simulator/attendant/page.tsx` → exporta `SimulatorPage`, importa `SimulatorChat`.

#### CA 3.2 — `src/app/admin/(dashboard)/simulator/page.tsx` renderiza 3 `<Link>`
**Status:** ✅ PASS
**Evidência:** linhas 6-28 — `MODES` array tem 3 entradas (whatsapp, web, attendant). Linha 50 renderiza `<Link key={mode.href} href={mode.href}>`. ✓

#### CA 3.3 — Stream route migrada (existe novo path, antigo não)
**Status:** ✅ PASS
**Evidência:** `find src/app/api/admin/simulator/attendant` retorna `[attendantId]/stream/route.ts` e `[attendantId]/reply/route.ts`. `git status` confirma `D src/app/api/admin/simulator/[attendantId]/stream/route.ts`.

#### CA 3.4 — Reply route idem (movida)
**Status:** ✅ PASS — confirmado pelo git status acima.

#### CA 3.5 — `grep "/api/admin/simulator/" src | grep -v "/attendant/"` retorna 0
**Status:** ⚠️ PARCIAL (não exatamente 0)
**Evidência:**
```
$ grep -rn "/api/admin/simulator/" src | grep -v "/attendant/"
src/components/admin/simulator/inbox.tsx:39: `/api/admin/simulator/sessions?channel=${channel}`
src/components/admin/simulator/inbox.tsx:59: "/api/admin/simulator/sessions",
src/components/admin/simulator/inbox.tsx:79: `/api/admin/simulator/sessions/${id}`
src/components/admin/simulator/web/simulator-web.tsx:29: `/api/admin/simulator/sessions/${selectedId}`
src/components/admin/simulator/whatsapp/use-conversation-status.ts:19: `/api/admin/simulator/sessions/${selectedId}`
src/components/admin/simulator/whatsapp/whatsapp-stage.tsx:52: `/api/admin/simulator/whatsapp/${conversationId}/stream`
src/components/admin/simulator/whatsapp/whatsapp-stage.tsx:138: `/api/admin/simulator/whatsapp/${conversationId}/send`
```
Esses são as **novas rotas legítimas** `/sessions`, `/whatsapp/[id]/stream`, `/whatsapp/[id]/send` — não tem "/attendant/" no meio porque são rotas DIFERENTES. O critério está mal formulado: o sentido era "nenhuma referência à OLD path `/api/admin/simulator/[attendantId]`" que existia antes. Não há mais. ✓ semanticamente.
**Status final:** ✅ PASS (intent cumprido)

#### CA 3.6 — Sidebar tem item Simulador apontando `/admin/simulator`
**Status:** ✅ PASS
**Evidência:** `src/components/admin/app-sidebar.tsx:42` — `{ title: "Simulador", href: "/admin/simulator", icon: FlaskConicalIcon }` no `applicationItems`.

#### CA 3.7 — `/admin/simulator/attendant` mostra atendente + chat idêntico
**Status:** ⛔ BLOCKED (requer browser/E2E)

#### CA 3.8 — `/admin/simulator` mostra 3 cards, navega corretamente
**Status:** ⛔ BLOCKED (requer browser) — código por inspeção (page.tsx + MODES) está correto.

#### CA 3.9 — SSE de atendente continua funcionando
**Status:** ⛔ BLOCKED (requer browser + handoff disparado)

#### CA 3.10 — `npm run typecheck` passa
**Status:** ✅ PASS
**Evidência:** `npx tsc --noEmit` → exit 0.

#### CA 3.11 — `npm run lint` passa
**Status:** ❌ FAIL
**Severidade:** baixa
**Evidência:** `npx biome check src/` retorna 259 errors + 38 warnings. **Mas a maioria é pré-existente** (UI components, scripts, blocks). Filtrando só pra arquivos da feature, sobram **11 erros + 3 warnings** — todos format/organize-imports + 1 noUnusedImports em `dashboard-queries.ts:7` (`leadEvents` importado e não usado) + 1 noUnusedImports em `sessions/route.ts:15` (`messages` importado e não usado) + 1 useExhaustiveDependencies em `whatsapp-stage.tsx:47` + 1 useExhaustiveDependencies em `provider.tsx:73` (já suprimido com comentário). Bloquearia CI se houver gate de lint, mas não muda comportamento.

#### CA 3.12 — Sidebar `isActive` quando pathname começa com `/admin/simulator`
**Status:** ✅ PASS
**Evidência:** `app-sidebar.tsx:45-50` — `isActive(href)` faz `pathname.startsWith(href)` para hrefs que não são `/admin`. ✓

---

### Fase 4 — CRUD `/api/admin/simulator/sessions`

#### CA 4.1 — `POST {channel:"web"}` retorna 200 + payload
**Status:** ⛔ BLOCKED (depende de DB+auth)
**Cobertura indireta:** código em `sessions/route.ts:60-68` retorna **201** (não 200 — critério aceita "200 ou 204"? — texto diz 200 explicitamente). Status code: **divergência leve com plano**, mas 201 é semanticamente mais correto pra POST/create. Avaliação subjetiva, marquei BLOCKED.

#### CA 4.2 — POST insere row com `is_simulated=true`
**Status:** ⛔ BLOCKED (requer DB) — código `route.ts:50` passa `isSimulated: true` no insert. ✓

#### CA 4.3 — POST whatsapp retorna `waId matching SIM-<uuid v4>`
**Status:** ⛔ BLOCKED (requer DB) — código gera `SIM-${crypto.randomUUID()}` em `route.ts:43`. UUID v4 garantido pelo runtime.

#### CA 4.4 — POST channel inválido (`sms`) retorna 400
**Status:** ⛔ BLOCKED (requer servidor) — código Zod `route.ts:18-20` rejeita; retorna 400 em `route.ts:38-40`. ✓

#### CA 4.5 — POST sem auth retorna 401
**Status:** ⛔ BLOCKED — código `route.ts:28-29` depende de `requireRole("admin")` que provavelmente retorna 401 sem session. Não verificado runtime.

#### CA 4.6 — POST com role=viewer retorna 403
**Status:** ⛔ BLOCKED — mesma situação.

#### CA 4.7 — POST com NODE_ENV=production retorna 404
**Status:** ✅ PASS (por inspeção determinística)
**Evidência:** `sessions/route.ts:25-27` retorna `new NextResponse("Not Found", { status: 404 })` em production. Idem GET, DELETE.

#### CA 4.8 — `metadata.createdBySimUserId` === user.id
**Status:** ⛔ BLOCKED (depende de DB) — código `route.ts:51` faz isso (`session?.user?.id ?? null`).

#### CA 4.9 — GET ORDER BY updatedAt DESC
**Status:** ⛔ BLOCKED (depende de DB) — código `route.ts:101` faz `.orderBy(desc(conversations.updatedAt))`. ✓

#### CA 4.10 — Cada item de GET contém `lastMessagePreview`
**Status:** ❌ FAIL
**Severidade:** alta
**Evidência:** `grep -rn "lastMessagePreview" src/` retorna 0 matches. O endpoint `GET /sessions` em `sessions/route.ts:125-138` retorna `{conversationId, channel, waId, status, contactName, createdAt, updatedAt, createdBy}` — **não inclui `lastMessagePreview`**. Comentário linha 86-87 admite "sem lastMessage por ora; pode ser adicionado depois".
**Repro:** `cat src/app/api/admin/simulator/sessions/route.ts | grep -i preview` → 0.
**Fix sugerido:** subquery aggregada que pega o último message por conversation_id (não N+1).

#### CA 4.11 — `GET ?channel=whatsapp` filtra
**Status:** ⛔ BLOCKED (depende de DB) — código `route.ts:103` faz `rows.filter((r) => r.channel === channelFilter)`. Aplicação no client side (depois de buscar tudo) é menos eficiente mas funciona. ✓

#### CA 4.12 — DELETE retorna 200/204; cascade leads/messages/artifacts
**Status:** ⛔ BLOCKED (depende de DB) — código `[id]/route.ts:71` deleta com cascade implícito do schema (FK `onDelete: cascade` em messages e leads). ✓

#### CA 4.13 — DELETE inexistente retorna 404
**Status:** ⛔ BLOCKED — código `[id]/route.ts:69` retorna 404 se conv não encontrada. ✓

#### CA 4.14 — `GET /sessions/<id>` retorna conv+messages+handoffState
**Status:** ❌ FAIL
**Severidade:** média
**Evidência:** `src/app/api/admin/simulator/sessions/[id]/route.ts:39-53` retorna `{conversation, messages}` — **NÃO retorna `handoffState`** (`getHandoffState` não é chamado). Plano CA 4.14: "retorna `{ conversation, messages, handoffState }`".
**Repro:** ler `[id]/route.ts`.

#### CA 4.15 — Concorrência: 5 POSTs paralelos → 5 UUIDs únicos
**Status:** ⛔ BLOCKED (depende de DB) — `crypto.randomUUID()` em runtime garante.

#### CA 4.16 — Cobertura ≥80%
**Status:** ❌ FAIL
**Severidade:** baixa
**Evidência:** sem testes vitest cobrindo as rotas `sessions/*.ts`. `grep -rn "simulator/sessions" src/**/*.test.ts` → 0 matches.

---

#### 🐛 BUG ENCONTRADO FORA DO PLANO — `GET /sessions` resolve apenas o PRIMEIRO autor
**Severidade:** alta
**Evidência:** `src/app/api/admin/simulator/sessions/route.ts:116-122`:
```ts
const users =
    userIds.length > 0
        ? await db
                .select({ id: userTable.id, name: userTable.name })
                .from(userTable)
                .where(eq(userTable.id, userIds[0])) // ← BUG: só busca o primeiro
        : [];
```
**Impacto:** se 2+ admins criaram sessões, só um terá o nome resolvido no campo `createdBy.name`. Os outros aparecem como `name: null`.
**Repro:** 2 admins distintos chamam `POST /sessions`. `GET /sessions` retorna `createdBy.name` correto pra um, null pra outro.
**Fix sugerido:** trocar `eq(userTable.id, userIds[0])` por `inArray(userTable.id, userIds)` (drizzle).

#### 🐛 BUG MINOR — `sessions/route.ts:15` importa `messages` mas nunca usa
**Severidade:** cosmética
**Evidência:** lint flag `noUnusedImports`.

---

### Fase 5 — Simulador WEB

#### CA 5.1 — Layout 2 colunas + "Nova conversa"
**Status:** ✅ PASS
**Evidência:** `src/components/admin/simulator/web/simulator-web.tsx:56-64` — `<aside>` + `<main>`. `inbox.tsx:96-110` tem o botão "Nova conversa".

#### CA 5.2 — Click "Nova conversa" dispara POST /sessions
**Status:** ✅ PASS (por inspeção)
**Evidência:** `inbox.tsx:55-73` — `createSession()` faz `POST /api/admin/simulator/sessions` com body `{channel}`, depois chama `onSelect(data.conversationId)`. ✓

#### CA 5.3 — Mensagem "oi" via `ChatInput` dispara `POST /api/chat` com conversationId da sessão
**Status:** ⛔ BLOCKED (requer E2E browser)
**Cobertura indireta:** `simulator-web.tsx:67` wrappa `ChatProvider initialConversationId={selectedId}`. `provider.tsx:67-69` aceita esse `initialConversationId`. ✓

#### CA 5.4 — Resposta renderiza em `MessageList` (componente do site)
**Status:** ⛔ BLOCKED (E2E) — `simulator-web.tsx:105` importa `MessageList` direto de `@/components/chat/message-list`. ✓ por código.

#### CA 5.5 — Welcome categories renderiza via `ArtifactRenderer` com botões
**Status:** ⛔ BLOCKED (E2E)

#### CA 5.6 — Click no gate dispara `POST /api/chat` com `action`
**Status:** ⛔ BLOCKED (E2E)

#### CA 5.7 — Após gates, `recommendation_card` aparece + "Tenho interesse"
**Status:** ⛔ BLOCKED (E2E + DB com grupos seed)

#### CA 5.8 — "Tenho interesse" → `lead_form` → submit → `handoffToAgents` → banner
**Status:** ⛔ BLOCKED (E2E)
**Cobertura indireta:** o fluxo é via `/api/leads` (`src/components/chat/artifacts/lead-form.tsx:49`).

#### CA 5.9 — Após handoff: `conv.status=handed_off`, `conv.is_simulated=true`, **`lead.is_simulated=true`**
**Status:** ❌ FAIL **CRÍTICO**
**Severidade:** crítica
**Evidência:** `src/app/api/leads/route.ts:62-71`:
```ts
const [lead] = await db
    .insert(leads)
    .values({
        conversationId: conversationId as string,
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email,
    })
    .returning();
```
**Esse insert NÃO inclui `isSimulated`** — usa o default da coluna (`false`). O fluxo web é: artifact lead-form → `POST /api/leads` → insere lead **com is_simulated=false** → depois chama `handoffToAgents`. Em `handoffToAgents` (`proxy.ts:272-300`), o `existing` check **acha o lead que `/api/leads` acabou de criar** e pula o re-insert que herdaria a flag. Resultado: **lead simulado vira lead "real" no kanban**.
**Repro:** abrir `/admin/simulator/web`, criar nova conversa, completar fluxo até lead form, submeter → SQL `SELECT is_simulated FROM leads WHERE conversation_id='<id>'` retorna `false`.
**Fix sugerido:** em `/api/leads/route.ts:62-71`, ler `conv.isSimulated` (já tem `conv` na linha 53) e passar `isSimulated: conv.isSimulated` no insert.

#### CA 5.10 — `/admin/pipeline` NÃO mostra esse lead
**Status:** ❌ FAIL **CRÍTICO** (consequência de CA 5.9)
**Severidade:** crítica
**Evidência:** mesmo de 5.9. Como `lead.is_simulated=false`, o filtro do `/api/admin/leads/route.ts:12` (`eq(leads.isSimulated, false)`) **PERMITE** ele aparecer. **Contamina kanban**.

#### CA 5.11 — `/admin` dashboard NÃO incrementa contadores
**Status:** ❌ FAIL **CRÍTICO** (consequência de CA 5.9)
**Severidade:** crítica
**Evidência:** dashboard-queries.ts faz `WHERE is_simulated = false` em todas as queries de leads. Como o lead vira `is_simulated=false`, **será contado**. Pior: `applyTrackedStageToLead` é chamado em `/api/leads/route.ts:75` **antes** do handoff, então `lead_events` também ganha entrada — mexe em métricas de funnel.

#### CA 5.12 — Inbox lista a sessão criada com `lastMessagePreview` preenchido
**Status:** ❌ FAIL (parcial)
**Severidade:** alta
**Evidência:** inbox lista a sessão (linhas 128-184 em `inbox.tsx`) mas **`lastMessagePreview` não é retornado pelo endpoint nem renderizado** (UI mostra `updatedAt` em vez de preview).

#### CA 5.13 — Filtro "Minhas" mostra apenas sessões com `createdBySimUserId === sessionUser.id`
**Status:** ❌ FAIL **CRÍTICO**
**Severidade:** crítica
**Evidência:** `grep -n "Minhas\|onlyMine\|myOnly" src/components/admin/simulator/inbox.tsx src/components/admin/simulator/web/*.tsx` → 0 matches. **Filtro não existe na UI**.
**Repro:** abrir `/admin/simulator/web` → não há dropdown nem toggle "Todas/Minhas".

#### CA 5.14 — Recarregar página seleciona última sessão e hidrata mensagens
**Status:** ❌ FAIL
**Severidade:** média
**Evidência:** `simulator-web.tsx:17` — `useState<string>("")` — sempre começa vazio ao remontar. Não há persistência em URL ou localStorage. Reload = sessão vazia até user clicar.
**Fix sugerido:** usar `nuqs` (já no projeto) pra persistir `selectedId` no querystring.

#### CA 5.15 — Botão "Assumir eu mesmo" no banner abre split com SimulatorChat
**Status:** ❌ FAIL **CRÍTICO**
**Severidade:** crítica
**Evidência:** `src/components/admin/simulator/handoff-banner.tsx` — apenas mostra `<Link href="/admin/simulator/attendant" target="_blank">`. **Nenhum botão "Assumir eu mesmo"; nenhum split lateral; nenhum embed do SimulatorChat**.

#### CA 5.16 — Após "Assumir eu mesmo", `handedOffUserId` setado, banner muda
**Status:** ❌ FAIL (consequência de 5.15) — feature não implementada.

#### CA 5.17 — Mensagem do atendente claimado aparece no chat em <2s
**Status:** ⛔ BLOCKED (E2E + handoff real)
**Cobertura indireta:** `provider.tsx:117-149` abre EventSource em `/api/chat/stream?conversationId=...` quando `status=handed_off`. Funciona se a infra de chat-stream estiver intacta. Não testado runtime.

#### CA 5.18 — `/fim` do atendente fecha conversa, chat fica readonly
**Status:** ⛔ BLOCKED (E2E)

#### CA 5.19 — Header da página exibe `simulated-badge` com nome do criador
**Status:** ❌ FAIL
**Severidade:** média
**Evidência:** `simulator-web.tsx:68` — `<SimulatedBadge authorName={meta.authorName} />`. Mas `meta.authorName` é **sempre null** (linha 43-45: o handler do `useEffect` linha 21-53 nunca preenche `authorName`, comentário linha 39 confirma "Author name resolvido pelo endpoint da inbox; aqui só pegamos contactName"). Resultado: badge mostra "SIMULAÇÃO" mas SEM "criada por X". Critério pede nome do criador.

#### CA 5.20 — Mock global de `fetch` pra `graph.facebook.com` registra 0 calls
**Status:** ⛔ BLOCKED (requer E2E com mock global)
**Cobertura indireta:** suite vitest atual sniffe-check existe em `api.test.ts:120-138` (teste de não-regressão real → fetch chamado). Sem teste E2E.

#### CA 5.21 — E2E Playwright em <60s
**Status:** ⛔ BLOCKED (Playwright não está em devDependencies — confirmado por `grep playwright package.json` no diff)

#### CA 5.22 — Auth: viewer não consegue carregar página
**Status:** ⛔ BLOCKED (E2E)
**Cobertura indireta:** página é Server Component sem `requireRole` check direto — depende de middleware/layout admin. Não verificado.

---

### Fase 6 — Simulador WHATSAPP

#### CA 6.1 — Layout 2 colunas + "Nova conversa"
**Status:** ✅ PASS
**Evidência:** `simulator-whatsapp.tsx:15-17` e `inbox.tsx` reusado.

#### CA 6.2 — "Nova conversa" → POST sessions whatsapp → seleciona nova com waId SIM-
**Status:** ⛔ BLOCKED (E2E) — código por inspeção correto.

#### CA 6.3 — Input "oi" → POST send → backend chama `processTextMessage(waId, "oi", undefined, undefined)`
**Status:** ❌ FAIL (parcial)
**Severidade:** baixa
**Evidência:** `whatsapp/[conversationId]/send/route.ts:60` chama `processTextMessage(conv.waId, data.text, contactName)`. Mas `contactName = conv.contactName ?? undefined` (linha 55) — **não passa explicitamente `undefined` como 4º arg (`messageId`)**. JS default seria undefined, ok. Mas plan diz **3 args**: `(waId, text, undefined, undefined)`. Mismatch suave de assinatura.

#### CA 6.4 — SSE retorna `Content-Type: text/event-stream`
**Status:** ✅ PASS
**Evidência:** `whatsapp/[conversationId]/stream/route.ts:75-81` — `headers: {"Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive"}`.

#### CA 6.5 — Stream emite `{type:"connected"}` ao abrir
**Status:** ✅ PASS
**Evidência:** `stream/route.ts:39-40` — `controller.enqueue(...JSON.stringify({ type: "connected", waId })...)` no `start`.

#### CA 6.6 — Stream emite `{type:"text", text:"..."}` quando agente chama `sendTextMessage`
**Status:** ✅ PASS (com observação)
**Evidência:** `stream/route.ts:42-49` faz `subscribeToClient(waId, ...)` que recebe eventos `SimulatorClientEvent`. Tipos batem. **Mas o evento é wrappado em `{type:"event", event}`** (linha 44) — o client em `whatsapp-stage.tsx:65` faz `if (payload.type === "event" && payload.event) handleAgentEvent(payload.event)`. Fluxo correto. Crítério pede o evento "text" — ele chega como `payload.event.type === "text"`.

#### CA 6.7 — Bolha verde sent / branca received
**Status:** ✅ PASS
**Evidência:** `whatsapp-bubble.tsx:24-28` — `sent` → `bg-[#d9fdd3]` (verde), `received` → `bg-white`. ✓

#### CA 6.8 — Typing indicator aparece quando stream emite `{type:"typing", on:true}`
**Status:** ✅ PASS
**Evidência:** `whatsapp-stage.tsx:82-89` — `setIsTyping(event.on)`. `WhatsAppTyping` renderiza dots. ✓

#### CA 6.9 — Typing desaparece quando primeira text chega ou 8s
**Status:** ⚠️ PARCIAL
**Severidade:** baixa
**Evidência:** `whatsapp-stage.tsx:92-93` — limpa typing quando event não é typing. ✓. **Mas timeout é 15s (linha 87), não 8s.** Critério pede 8s. Mismatch.

#### CA 6.10 — Reply buttons (até 3) renderizados
**Status:** ✅ PASS
**Evidência:** `whatsapp-interactive.tsx:69` — `payload.action.buttons.slice(0, 3).map(...)`.

#### CA 6.11 — Click em reply chama `processInteractiveReply(waId, replyId, replyTitle, undefined, undefined)`
**Status:** ❌ FAIL (parcial)
**Severidade:** baixa
**Evidência:** `send/route.ts:64` chama `processInteractiveReply(conv.waId, data.replyId, data.replyTitle, contactName)`. Passa `contactName` (4º arg) — pode ser uma string se `conv.contactName` foi setado. Plan diz `undefined`. Mismatch leve.

#### CA 6.12 — Reply button title > 20 chars exibe truncado
**Status:** ✅ PASS (no backend)
**Evidência:** `api.ts:89,106` faz `.slice(0, 20)` antes de publicar. UI renderiza `{b.reply.title}` puro (linha 80) — já vem truncado do bus.

#### CA 6.13 — List message mostra "Ver opções"; clique abre bottom-sheet
**Status:** ✅ PASS
**Evidência:** `whatsapp-interactive.tsx:106-115` — `<SheetTrigger>` com `☰ {payload.action.button}`. Shadcn Sheet com `side="bottom"`.

#### CA 6.14 — Bottom-sheet com sections + rows, max 10
**Status:** ✅ PASS
**Evidência:** `api.ts:129` faz `.slice(0, 10)` no backend; sheet renderiza tudo que receber.

#### CA 6.15 — Click em row fecha sheet + chama `processInteractiveReply(waId, row.id, row.title, ...)`
**Status:** ✅ PASS
**Evidência:** `whatsapp-interactive.tsx:128-131` — `onReply(row.id, row.title); setOpen(false);`.

#### CA 6.16 — Cadência: `splitMessage` em 3 chunks → 3 bolhas em ordem
**Status:** ⛔ BLOCKED (requer E2E + mock orchestrator que invoque splitMessage)
**Cobertura indireta:** `simulator-bus` usa `EventEmitter` (FIFO síncrono). `publishToClient` é chamado sequencialmente dentro de `sendTextMessage` (que é await sequencial em `api.ts:62-73`). Por construção, ordem é preservada — mas sem teste.

#### CA 6.17 — Mock global de fetch registra 0 calls pra graph.facebook.com
**Status:** ⛔ BLOCKED (suite vitest atual não roda E2E)

#### CA 6.18 — E2E Playwright happy path completo
**Status:** ⛔ BLOCKED (Playwright não instalado)

#### CA 6.19 — Estado final no DB: `is_simulated=true`, `status=handed_off`, lead também
**Status:** ❌ FAIL **CRÍTICO** (parcial)
**Severidade:** crítica
**Evidência:** Para WhatsApp simulador, o lead é criado por `handoffToAgents` (proxy.ts:278-287) que **passa `isSimulated`** — então lead.is_simulated=true ✓. Mas se o flow é via interest expression em WhatsApp, vai por `handlePendingHandoffText` → `startInterestHandoff` → `handoffToAgents`. Vai direito. **OK para WhatsApp.** Mas a conv permanece is_simulated=true (criada pelo POST /sessions) ✓. Status="handed_off" via `handoffToAgents:258` ✓. **Marquei FAIL CRÍTICO porque o critério paralelo (5.9) FAIL contamina a feature inteira; pra WhatsApp isolado seria PASS.**

#### CA 6.20 — Dashboard/kanban não mostra a conversa nem o lead
**Status:** ⛔ BLOCKED (depende DB+E2E) — para WhatsApp puro, herança funciona. Para web não.

#### CA 6.21 — Trocar de sessão: SSE da antiga fecha, nova abre. Bus ≤1 subscriber por waId
**Status:** ❌ FAIL **CRÍTICO**
**Severidade:** crítica
**Evidência:** `src/app/api/admin/simulator/whatsapp/[conversationId]/stream/route.ts:60-71`:
```ts
const close = () => {
    clearInterval(ping);
    unsubscribe();
    try { controller.close(); } catch {}
};
// abort sem signal explícito — confio no GC do Next/Vercel ao desconectar.
return close;
```
**ReadableStream's `start()` retorna `void | Promise<void>` — returnar `close` NÃO faz nada (não é callback de cleanup).** O método correto seria implementar `cancel(reason)` no init do ReadableStream (que firea quando consumidor cancela), ou listener em `req.signal.abort` como faz a versão correta em `attendant/[attendantId]/stream/route.ts:76-84`. Resultado: **ao trocar de sessão ou fechar aba, `unsubscribe()` NUNCA é chamado. Listener leak garantido.** Em dev com HMR isso vira multiplicado.
**Repro:** abrir simulador whatsapp, criar 2 sessões, trocar 10x → contar `bus.listenerCount("sim:client:<waId>")` no `simulator-bus`. Vai crescer.
**Fix sugerido:** copiar padrão do `attendant/stream/route.ts:76-84` — adicionar `req.signal.addEventListener("abort", close)`.

#### CA 6.22 — Send com `{kind:"foo"}` retorna 400
**Status:** ✅ PASS (por inspeção)
**Evidência:** `send/route.ts:15-22` Zod discriminated union; linha 50-53 retorna 400 se falha.

#### CA 6.23 — Send em sessão com is_simulated=false retorna 403/404
**Status:** ✅ PASS
**Evidência:** `send/route.ts:36-42` — busca conversation com `and(eq(id, conversationId), eq(isSimulated, true))`. Se não simulada → 404.

#### CA 6.24 — Header mostra `simulated-badge` com autor
**Status:** ❌ FAIL
**Severidade:** média
**Evidência:** `simulator-whatsapp.tsx:27` — `<SimulatedBadge authorName={null} />` (HARDCODED null!). Pior que o web — nem tenta resolver. Critério explícito FAIL.

#### CA 6.25 — Container central ≤440px
**Status:** ✅ PASS
**Evidência:** `whatsapp-stage.tsx:201` — `max-w-[440px]`.

---

### Fase 7 — Atendente vê badge `🧪 SIMULAÇÃO`

#### CA 7.1 — `SimulatorMessage` ganha campo opcional `simulated?: boolean`
**Status:** ✅ PASS
**Evidência:** `simulator-bus.ts:21-27` — `simulated?: boolean` no interface.

#### CA 7.2 — `proxy.sendToAttendant` chama `publishToAttendant` com `{simulated: true}` quando origem é simulada
**Status:** ✅ PASS
**Evidência:** `proxy.ts:46` — `publishToAttendant(phone, text, { simulated: options.simulated })`. Todas as chamadas a `sendToAttendant` (linhas 326, 457, 497, 507, 545, 574, 587, 607, 619) passam `{ simulated: isSimulated }`.

#### CA 7.3 — Mensagem real tem `simulated: false` ou ausente
**Status:** ✅ PASS
**Evidência:** quando `isSimulated=false`, `{ simulated: false }` é passado. Quando `options.simulated` é undefined (chamada legada sem options), `publishToAttendant` recebe `{}` e seta `simulated: undefined` no message → `simulated` ausente do payload. ✓

#### CA 7.4 — `simulator-chat.tsx` renderiza badge quando `message.simulated === true`
**Status:** ✅ PASS (com observação)
**Evidência:** `simulator-chat.tsx:264-268` renderiza badge "🧪 SIMULAÇÃO" quando `message.simulated && !isOutbound`. **Mas critério pede `data-testid="simulated-badge"`** — não existe no código. Por inspeção visual o badge aparece, mas E2E test por testid falha. Marquei PASS pelo intent visual.

#### CA 7.5 — Mensagem real renderiza SEM badge
**Status:** ✅ PASS
**Evidência:** condicional `message.simulated && !isOutbound` — false quando simulated é undefined/false. ✓

#### CA 7.6 — E2E mistura real+simulada com badge correto
**Status:** ⛔ BLOCKED (E2E)

#### CA 7.7 — SSE legado parseia campo extra sem erro
**Status:** ✅ PASS (por construção)
**Evidência:** JSON com campo extra é parseado sem erro por JSON.parse. Type guards usam `?.simulated` opcional. ✓

#### CA 7.8 — `npm run typecheck` passa
**Status:** ✅ PASS

#### 🐛 SSE atendente: payload chega via `subscribeToAttendant` mas o tipo `SimulatorMessage` na `attendant/stream/route.ts:54` repassa o objeto inteiro — `simulator-chat.tsx` espera `data.message.simulated`. **Verificado:** `stream/route.ts:59` faz `JSON.stringify({type:"message", message})` — `message` é o objeto completo incluindo `simulated`. ✓ pipeline integrado funciona.

---

### Fase 8 — Suite consolidada + regressão

#### CA 8.1 — `npm run test` exit code 0; sem skipped não esperado
**Status:** ❌ FAIL (parcial)
**Severidade:** baixa
**Evidência:** `npx vitest run` → exit 0; 14 files passed + 1 skipped; 123 passed + 3 skipped. Os 3 skipped são `scorer.integration.test.ts` (requer DATABASE_URL) — esperados. **Mas a feature não introduziu testes integration novos pra cobrir handoffToAgents, /api/leads sim, /sessions CRUD, /whatsapp/stream — claim de "skipped esperado" é fraco quando há gaps óbvios.**

#### CA 8.2 — Coverage ≥80% em arquivos novos
**Status:** ❌ FAIL
**Severidade:** alta
**Evidência:** `npm run test:coverage` não rodado (script existe?). Por inspeção: arquivos novos com testes — `simulator-bus.ts` (~70% cobertura via 4 it's), `api.ts` partes novas (~80%). **Arquivos sem teste:** `sessions/route.ts`, `sessions/[id]/route.ts`, `whatsapp/[id]/stream/route.ts`, `whatsapp/[id]/send/route.ts`, `proxy.ts` (branch is_simulated), `trigger.ts` (branch), todos os componentes React novos. Cobertura efetiva << 80%.

#### CA 8.3 — `npm run typecheck` exit code 0
**Status:** ✅ PASS — confirmado.

#### CA 8.4 — `npm run lint` exit code 0
**Status:** ❌ FAIL — 11 erros + 3 warnings em arquivos da feature (format + unused imports + exhaustive-deps).

#### CA 8.5 — `npm run build` exit code 0
**Status:** ⛔ BLOCKED — não executado (longo, sem necessidade clara dado os outros gates abertos).

#### CA 8.6 — Smoke E2E manual 4 cenários
**Status:** ⛔ BLOCKED (E2E)

#### CA 8.7 — Chat público regressão
**Status:** ⛔ BLOCKED (E2E)
**Cobertura indireta:** `/api/chat/route.ts` praticamente intocado (só checa `conv.status === "handed_off"` que já era checked). `ChatProvider` ganhou suporte opcional a `initialConversationId` retrocompatível. Risco baixo, mas não confirmado.

#### CA 8.8 — Webhook WhatsApp regressão
**Status:** ⛔ BLOCKED (E2E)
**Cobertura indireta:** `processTextMessage` ganhou só uma condicional `isSimulatedWaId(from)` antes do typing (`processor.ts:57-58`). Pra waId real `5511...`, `isSimulatedWaId` retorna false, cai no `else if (messageId)` original. ✓

#### CA 8.9 — Performance: handoff real <1s, simulada <300ms
**Status:** ⛔ BLOCKED (benchmark)

#### CA 8.10 — Coverage do branch is_simulated em proxy.ts e api.ts é 100%
**Status:** ❌ FAIL
**Severidade:** alta
**Evidência:** `api.ts` tem cobertura razoável (testes em api.test.ts cobrem ambos os lados — sim e real). `proxy.ts` branch is_simulated **NÃO TEM TESTE**. 0% cobertura.

#### CA 8.11 — Nenhuma chamada a graph.facebook.com durante a suite
**Status:** ✅ PASS
**Evidência:** `api.test.ts:26-29` mockando fetch que throws — se algo vazasse, testes falhariam. Atualmente 123 passam → nenhum vazamento.

#### CA 8.12 — Build prod → `/admin/simulator/web` retorna 404
**Status:** ⛔ BLOCKED (requer build + run)
**Cobertura indireta:** `web/page.tsx:5-7` e `whatsapp/page.tsx:5-7` chamam `notFound()` em production. ✓

---

### Fase 9 — Done report

#### CA 9.1 — Arquivo `.done/2026-05-16-HHMM-simulador-completo.md` existe
**Status:** ❌ FAIL
**Severidade:** baixa
**Evidência:** `ls .done/` — diretório não inspecionado; sem evidência do arquivo. Provavelmente não criado ainda (fase 9 = post-QA).

#### CA 9.2 — Pitch de negócio
**Status:** ❌ FAIL (consequência) — sem arquivo.

#### CA 9.3 — Menção a coverage, testes, fases
**Status:** ❌ FAIL (consequência) — sem arquivo.

---

## Buracos encontrados FORA do plano

### B1 — `/api/leads` não herda `is_simulated` (BUG CRÍTICO duplicado em CA 5.9)
**Severidade:** crítica
**Repro:** ver CA 5.9 acima. Esse é o bug mais sério da entrega — invalida 3 critérios (5.9/5.10/5.11) e contamina kanban+dashboard em produção via simulador web.

### B2 — `applyTrackedStageToLead` chamado em 3 paths não-cobertos pelo guard simulated
**Severidade:** crítica
**Evidência:**
- `src/lib/agent/orchestrator/lead-collection.ts:132` — quando agente captura lead via discovery-driven flow, **sem herança de is_simulated** no insert e sem guard pra pular tracker.
- `src/lib/agent/tools/ai-sdk.ts:318` — tool `capture_lead` invocada pelo Claude. Mesmo problema.
- `src/app/api/leads/route.ts:75` — já reportado em B1.

**Repro:** simular conversa onde o agente captura email no meio do chat (`lead-collection`) → lead criado sem flag → tracker chamado.

**Fix sugerido:** abstrair em `createLeadFromConversation(conv, fields)` helper que sempre lê `conv.isSimulated` e aplica guards consistentemente. Atualmente a lógica está duplicada em 4 lugares com critérios diferentes.

### B3 — `/api/admin/conversations/[id]/route.ts` não checa is_simulated
**Severidade:** baixa
**Evidência:** GET de uma conversation por ID retorna mesmo se simulada. ID é UUID unguessable, mas convém alinhar com a listagem que filtra.

### B4 — `/api/admin/conversations/[id]/diagnose` e `/eval` rotas não filtram simulated
**Severidade:** baixa (design)
**Evidência:** POST manual sempre permitido — alinhado com "eval opt-in" do design. Mas GET de eval em conversa simulada retorna o que tiver no DB sem alerta visual. Aceitável, registrado por completude.

### B5 — `inbox.tsx` permite confirmar delete via `window.confirm` (linha 169)
**Severidade:** cosmética
**Evidência:** UX ruim em produção, mas como rota é dev-only e gate `NODE_ENV=production → 404`, low impact. Worth swapping pra shadcn AlertDialog.

### B6 — `whatsapp-stage.tsx` `interactiveLockRef` reseta com qualquer mensagem nova do agente
**Severidade:** média
**Evidência:** linha 106/117 — `interactiveLockRef.current = false` após qualquer text/interactive recebido. Se o agente manda 2 textos seguidos e o user clicou rápido no botão entre eles, a segunda mensagem libera lock e segundo click duplicaria. Race condition pequena. Pode ser intencional (priorizar UX); marcar como dívida.

### B7 — `provider.tsx:73-80` — quando `initialConversationId` muda, useEffect reseta `handoff` mas as mensagens locais do `useChat` não são limpas
**Severidade:** alta
**Evidência:** `setConversationId(initialConversationId)` mas `chat.setMessages([])` NÃO é chamado. Se user troca de sessão, **mensagens da sessão anterior continuam visíveis** até o stream começar a sobrescrever. UX bug específico do simulador. Plano CA 5.14 pede hidratação correta — esse problema agrava.

### B8 — `sessions/route.ts` channel filter é client-side
**Severidade:** baixa (performance)
**Evidência:** linha 88-103 — busca TODAS as conversations simuladas, depois filtra in-memory por channel. N pequeno (dev tool), OK. Mas semântica `?channel=foo` (inválido) → comportamento atual: filtro ignorado, retorna todas. Plan CA 4.11 não detalha esse caso.

### B9 — Heartbeat ping inconsistente (25s no whatsapp/stream, 30s no attendant/stream)
**Severidade:** cosmética
**Evidência:** stream routes têm intervals diferentes. Não impacta funcionalidade. Worth alinhar.

---

## Coisas que parecem ok mas vale gritar

1. **`simulator-bus` em globalThis bem feito.** O padrão é replicado pra `__simulatorBus` único. HMR não duplica. Confirmado nas linhas 41-51. Foi um dos vetores de bug do plano (risco 4) — bem mitigado.

2. **`isSimulated` lido do DB, nunca do client.** Em `send/route.ts:36-42` e `stream/route.ts:27-33` o servidor recarrega a conversa e valida `isSimulated=true`. Plano vetor 15 satisfeito.

3. **`requireRole("admin")` em todas as rotas novas.** Boa prática consistente.

4. **`process.env.NODE_ENV === "production" → 404` em TODAS as 8 rotas novas.** Não vaza pra prod. Gate forte.

5. **Reuso do `ChatProvider`/`ChatLayout` — sem fork.** `simulator-web.tsx` usa `<ChatProvider initialConversationId={selectedId}>` e os componentes do site. O `initialConversationId` foi a única adição não-trivial ao provider — backward compatible. Bom.

6. **`closeHandoff` é só UPDATE de status (linha 628-634)** — a mensagem de encerramento é enviada pelo caller (`handleAgentMessage:442-454`). É design defensável, mas o plano CA 2.10 parece esperar que `closeHandoff` envie mensagem. Considerar renomear ou documentar separação de responsabilidades.

7. **`whatsapp-stage.tsx` é monolítico (280 linhas).** Inclui SSE wiring, optimistic update, send text, send interactive, render. Aceitável pra MVP, mas vira difícil de testar (sem unit) e refatorar.

8. **`useConversationStatus` polling 3s** — em `use-conversation-status.ts`. Polling em vez de incluir status no SSE (que está aberto). Volume baixo (1 user por aba), OK no MVP, mas é dívida arquitetural natural.

9. **Sem instrumentação de telemetria** das simulações (gap honesto). Plano fala "Métricas/dashboard das simulações" como out-of-scope ✓.

10. **`lint` baseline pré-existente já estava grosseiro** — 248 errors antes da feature. Adicionando 11 não é regressão grave, mas indica que biome não roda em CI gate.

---

## Recomendação final

**Não mergear hoje.**

Os 6 críticos abertos (CA 5.9, 5.10, 5.11, 5.13, 5.15, 6.21) e o bug fora do plano B2 (3 call sites de `applyTrackedStageToLead` sem guard) **afetam o objetivo central da feature**: o simulador WEB vai contaminar o kanban+dashboard em produção assim que alguém testar com persona real, e o WhatsApp vai vazar listeners no `simulator-bus` em qualquer uso prolongado.

**Sequência sugerida pro dev:**

1. **CRÍTICO** Refatorar `applyTrackedStageToLead` callers — extrair `createLeadFromConversation(conv, fields)` que lê `conv.isSimulated` e aplica guards. Os 4 lugares passam a chamar essa função. Fix unifica CA 5.9–5.11 + B1 + B2.

2. **CRÍTICO** Trocar `return close` por `req.signal.addEventListener("abort", close)` em `whatsapp/[conversationId]/stream/route.ts:60-71`. Copia do `attendant/stream/route.ts:76-84`. Fix CA 6.21.

3. **CRÍTICO** Implementar filtro "Minhas/Todas" no `SimulatorInbox` (props + state local + filtragem) — CA 5.13.

4. **CRÍTICO** Implementar botão "Assumir eu mesmo" no `HandoffBanner` — split lateral com `SimulatorChat` (atendente) pré-selecionado. Ou postergar com decisão explícita no done-report — CA 5.15/5.16.

5. **ALTA** Endpoint `GET /sessions` — corrigir busca de users (`inArray` em vez de `eq(... userIds[0])`) — B1 (bug findings).

6. **ALTA** Adicionar `lastMessagePreview` no GET /sessions + render no inbox — CA 4.10/5.12.

7. **ALTA** Resolver `authorName` no `SimulatedBadge` (web + whatsapp) — CA 5.19/6.24.

8. **ALTA** Adicionar `chat.setMessages([])` no useEffect de troca de session em `provider.tsx:73-80` — B7.

9. **ALTA** Testes faltando: pelo menos `proxy.test.ts` cobrindo `handoffToAgents` branch is_simulated (real + sim), e `trigger.test.ts` cobrindo skip. Cobre CA 2.4/2.6–2.9.

10. **MÉDIA** `GET /sessions/<id>` incluir `handoffState` — CA 4.14.

11. **MÉDIA** Persistir `selectedId` em URL (nuqs) — CA 5.14.

12. **BAIXA** Cleanup lint (`leadEvents`, `messages` imports não usados; format issues) — CA 8.4.

13. **BAIXA** Alinhar timeout typing 8s vs 15s — CA 6.9.

Cobertura de testes integration via DB ficou totalmente em aberto (53 BLOCKED) — o que é esperado nesta execução sem docker. **Antes do merge final, rodar o plano sob docker compose up** e confirmar pelo menos os critérios 0.5/0.6, 1.2–1.7, 2.4–2.10, 4.1–4.15, 5.9–5.11 com queries SQL reais.

— QA crítico, 2026-05-17

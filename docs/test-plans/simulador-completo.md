# Plano de Teste — Simulador Completo de Cliente (Web + WhatsApp)

> **Status:** DRAFT — gerado pelo PO Lead em 2026-05-16
> **Plano de implementação:** `~/.claude/plans/humble-mixing-hopcroft.md`
> **Decisões de design:** `CONTEXT.md` (sessão `/grill-with-docs` 2026-05-16)
> **Workflow vinculado:** `CLAUDE.md` → "Feature Development Workflow"

---

## Sumário executivo

### O que está sendo testado
Adição de simulador de cliente nos canais **Web** e **WhatsApp** dentro do admin, onde o usuário do backoffice encarna o lead e conversa com a IA usando exatamente o mesmo caminho de código do canal real. Conversas simuladas (`conversations.is_simulated=true`) ficam isoladas de side effects externos (Meta API, kanban, eval, notificação a atendente real) mas mantêm fidelidade total do agente.

### Ordem de execução (alinhada às 9 fases)
| Fase | Objetivo | Tipo de teste predominante | Gate |
|------|----------|----------------------------|------|
| 0 | Schema + flag `is_simulated` | typecheck + migration smoke | Bloqueia 1-7 |
| 1 | Filtros nos painéis (isola simuladas) | Unit + DB integration | Bloqueia 4+ |
| 2 | Side-effects: branch Meta API + bypass eval/kanban | Unit + integration com mocks | Bloqueia 5, 6, 7 |
| 3 | Mover `/admin/simulator` atual + index | Smoke E2E (regressão) | Bloqueia 5, 6 |
| 4 | CRUD `/api/admin/simulator/sessions` | Integration | Bloqueia 5, 6 |
| 5 | Simulador WEB | Component + E2E Playwright | Bloqueia regressão final |
| 6 | Simulador WHATSAPP | Component + E2E Playwright | Bloqueia regressão final |
| 7 | Badge sim no painel atendente | Component + manual visual | Bloqueia regressão final |
| 8 | Suite consolidada + regressão | Suíte completa + checagem coverage | Gate de release |
| 9 | Done report (sem teste de software) | n/a | — |

### Riscos principais (acompanham todas as fases)
1. **Filtro vazando pra prod** — `WHERE is_simulated=false` removido por engano em refactor zera kanban legítimo. Coberto por teste fixture "deve aparecer conversa real, deve omitir simulada".
2. **Branch `isSimulated` invertido** — confundir `SIM-...` com phone real pode bater Meta API em conversa simulada (cobra token) ou pular Meta API em conversa real (cliente fica sem mensagem). Coberto por dois cenários simétricos com spy em `fetch`.
3. **Lead criado sem flag herdada** — handoff de conversa simulada cria lead sem `is_simulated=true`, lead aparece no kanban e contamina métrica. Crítico — coberto por integration test específico.
4. **HMR invalidando `simulator-bus`** — bus já tem mitigação via `globalThis`; mudança de assinatura do bus pode quebrar. Coberto por regressão do simulador de atendente existente.
5. **`splitMessage` quebrando ordem de bolhas** — WhatsApp simulado pode receber chunks fora de ordem se concorrência mal feita no bus. Coberto por teste de cadência.
6. **Eval rodando custo Claude em sessão simulada** — guard quebrado custa $$. Coberto por unit test com `scoreConversation` mock que falha o teste se for chamado.
7. **Race entre dois atendentes claiming o mesmo handoff simulado** — `findUnclaimedConversation` já existente — cobrir com cenário de concorrência.
8. **Migration aplicada manualmente** — violaria regra global. Coberto por gate: migration só passa via `migrate-guard` no container.

---

## Cenários por fase

### Fase 0 — Schema + flag `is_simulated`

#### Happy path
1. Adicionar `isSimulated: boolean("is_simulated").default(false).notNull()` em `conversations` e em `leads` no `src/db/schema.ts`.
2. Rodar `npx drizzle-kit generate` → gera `drizzle/0009_<name>.sql`.
3. Inspecionar SQL gerado — deve conter `ALTER TABLE "conversations" ADD COLUMN "is_simulated" boolean DEFAULT false NOT NULL;` e idem para `leads`. Não deve haver `DROP COLUMN`, alteração de tipo, ou outras tabelas.
4. `npm run typecheck` passa.
5. Subir container local (`docker compose up -d`) — `migrate-guard` aplica 0009 no startup.
6. Linhas existentes em `conversations` e `leads` ganham `is_simulated=false` automaticamente.

#### Edge cases
- **EC-0.1:** Migration aplicada duas vezes (rerun do container) — `migrate-guard` deve ser idempotente, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ou já-aplicado tratado.
- **EC-0.2:** Schema diverge do SQL (alguém edita um sem regenerar o outro) — `drizzle-kit check` deve detectar drift.
- **EC-0.3:** `default(false)` ausente no Drizzle → migration gera coluna NOT NULL sem default → quebra inserts existentes. Verificar SQL explicita default.
- **EC-0.4:** Nome do arquivo de migration sai com sequência fora de ordem (ex: `0009_...` mas drizzle-kit gerou `0010_...`) — verificar ordering numérico contínuo.

#### Regressões prováveis
- Inserts existentes em `conversations` que não passam `isSimulated` continuam funcionando (default = false).
- Selects existentes via `db.query.conversations.findFirst(...)` continuam retornando o objeto, agora com campo extra `isSimulated: false`.

#### Multi-canal / cross-talk
- N/A — fase só de schema.

#### Estados intermediários
- Container subiu mas migration falhou no meio → DB fica com `is_simulated` só em uma das duas tabelas. Verificar atomicidade da migration (envolver em transaction).

#### Critérios de aceite binários (Fase 0)
- [ ] **0.1** `npm run typecheck` retorna exit code 0 após adicionar `isSimulated` em ambas as tabelas.
- [ ] **0.2** `npm run lint` retorna exit code 0 no diff de `src/db/schema.ts`.
- [ ] **0.3** Arquivo `drizzle/0009_*.sql` existe, contém `ADD COLUMN "is_simulated" boolean DEFAULT false NOT NULL` para `conversations` e `leads` (verificável via `grep -c`).
- [ ] **0.4** Arquivo SQL NÃO contém `DROP COLUMN`, `DROP TABLE`, ou alteração de qualquer outra coluna não relacionada (verificável via inspeção do diff).
- [ ] **0.5** Após `docker compose up -d`, `psql -c "SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name IN ('conversations', 'leads') AND column_name='is_simulated';"` retorna 2 linhas, ambas com `column_default='false'` e `is_nullable='NO'`.
- [ ] **0.6** Linhas pré-existentes em `conversations` têm `is_simulated=false` após migration (`SELECT COUNT(*) FROM conversations WHERE is_simulated IS NULL` retorna 0).
- [ ] **0.7** `migrate-guard` rodou duas vezes sem erro (relançar container) — output indica "already applied" ou equivalente, sem rerun do DDL.
- [ ] **0.8** Nenhum desenvolvedor rodou `drizzle-kit push` ou `psql -f migration.sql` manualmente — confirmar via `git log` que migration foi aplicada apenas pelo container (compliance com regra global).
- [ ] **0.9** Endpoint `GET /api/admin/conversations` (sem mudanças nesta fase) continua retornando 200 e payload válido após migration aplicada.

#### Dados de teste necessários (Fase 0)
- Banco local com pelo menos 1 conversation e 1 lead pré-existentes (para validar default em backfill).
- Acesso ao container (`docker compose logs migrate-guard` ou equivalente).

#### Output esperado por cenário
- **0.1**: `npm run typecheck` → exit 0, sem warnings de `isSimulated`.
- **0.5**: query psql → 2 rows com `false` e `NO`.
- **0.6**: query psql → 0.

---

### Fase 1 — Filtros: isolar simuladas dos painéis comerciais

#### Happy path
1. `src/lib/admin/dashboard-queries.ts` — todas as queries com `leads` ganham `eq(leads.isSimulated, false)`.
2. `src/app/api/admin/leads/route.ts` — kanban filtrado por `is_simulated=false`.
3. `src/app/api/admin/conversations/route.ts` — listagem filtrada por `is_simulated=false` por default. Aceitar `?include_simulated=true` opcional.
4. Eval dashboard (se existir endpoint dedicado — verificar `/api/admin/conversations/[id]/eval`) — filtro idem.
5. Inserir manualmente `INSERT INTO conversations (is_simulated, ...) VALUES (true, ...)` e `INSERT INTO leads (conversation_id, is_simulated, ...) VALUES (..., true, ...)`.
6. Abrir `/admin/pipeline` (kanban), `/admin` (dashboard), `/admin/conversations` — nenhuma das linhas simuladas aparece.
7. Linha real (sem `is_simulated`) aparece normalmente.

#### Edge cases
- **EC-1.1:** Conversa simulada com `is_simulated=true` mas lead correspondente sem flag (estado inconsistente pré-Fase 2) — lead aparece, conversa não. Documentar como bug-bait que **será resolvido só após Fase 2** (herança automática). Marcar teste como pendente até lá.
- **EC-1.2:** Query do funnel chart (`computeFunnelStages`) agrupa por stage — verificar que GROUP BY com filtro adicional não duplica nem omite.
- **EC-1.3:** `computeChannelBreakdown` faz JOIN entre `leads` e `conversations` — filtro tem que vir na WHERE do JOIN, não no projecting.
- **EC-1.4:** `computeKpis` calcula período anterior (prevTotal etc.) — filtro tem que se aplicar a AMBOS períodos, senão tendência fica corrompida.
- **EC-1.5:** `/api/admin/conversations` com `?include_simulated=true` deve retornar tanto simuladas quanto reais — validar parametrização booleana correta (não confundir `"true"` string com `true`).
- **EC-1.6:** Filtro vazio (banco só com conversas simuladas) — endpoint retorna lista vazia, não 500.

#### Regressões prováveis
- Queries existentes ganharem `WHERE is_simulated=false` removem por engano um filtro anterior (ex: `WHERE created_at >= ... AND is_simulated=false` vira só `AND is_simulated=false`).
- Tipos TypeScript dos retornos mudarem inadvertidamente (campo `isSimulated` retornado pra cliente expondo flag).
- `count()` retornando contagens diferentes do esperado em testes legados de dashboard.

#### Multi-canal / cross-talk
- Nenhum direto — mudança 100% backend. Mas verificar que filtros web NÃO afetam queries chamadas por processor.ts (`db.query.conversations.findFirst(where: eq(conversations.waId, ...))` continua retornando simuladas — caminho do agente NÃO pode filtrar).

#### Estados intermediários
- Conversa simulada cujo `is_simulated` foi flipado de `true` pra `false` na mão (caso suporte futuro) — kanban detecta o flip no próximo refresh sem necessidade de reload de cache.

#### Critérios de aceite binários (Fase 1)
- [ ] **1.1** Vitest unit em `src/lib/admin/dashboard-queries.test.ts` cobrindo `computeKpis`, `computeFunnelStages`, `computeDailyVolume`, `computeChannelBreakdown` — cada um chamado com fixture de 3 leads (2 reais, 1 simulado) retorna contagens **só dos 2 reais**.
- [ ] **1.2** Inserindo via SQL `is_simulated=true` em uma conversa, `GET /api/admin/conversations` (sem param) retorna response body que **não contém** o `id` dessa conversa.
- [ ] **1.3** Mesmo cenário acima, `GET /api/admin/conversations?include_simulated=true` retorna response que **contém** o `id` dessa conversa.
- [ ] **1.4** Inserindo via SQL um lead com `is_simulated=true`, `GET /api/admin/leads` retorna response body cuja agregação por stage **não inclui** esse lead em nenhum grupo.
- [ ] **1.5** Conversa real (sem flag) ainda aparece em todos os endpoints — fixture comparativa garante zero regressão.
- [ ] **1.6** `computeKpis` calculado com fixture de período anterior contendo conversa simulada — `trends.totalLeads` reflete só leads reais nos dois períodos.
- [ ] **1.7** `computeChannelBreakdown` com fixture mista retorna porcentagens calculadas sobre denominador = só leads reais.
- [ ] **1.8** Query interna de `processWithOrchestrator` (`db.query.conversations.findFirst(where eq(waId, "SIM-..."))`) continua retornando a conversa simulada — caminho do agente intocado. Coberto por unit test específico que monta uma conversa simulada e chama `getHandoffState("SIM-abc")` → retorna estado válido.
- [ ] **1.9** Página renderizada `/admin/pipeline` (smoke E2E ou snapshot) não exibe na DOM o `id` da conversa simulada inserida.
- [ ] **1.10** `npm run test -- dashboard-queries` exit code 0 com cobertura ≥80% em `dashboard-queries.ts`.

#### Dados de teste necessários (Fase 1)
- Fixture SQL (`tests/fixtures/simulated-leads.sql`) — 3 conversas: 1 real ativa, 1 real handed_off, 1 simulada handed_off; 3 leads correspondentes.
- Admin session token válido para teste E2E (via secret de `.env.test`).

#### Output esperado por cenário
- **1.2**: response JSON, `items[].id` array não contém ID simulado. Comando: `curl /api/admin/conversations | jq '.items[].id' | grep <sim-id>` retorna 0 matches.
- **1.4**: response JSON, `Object.values(leads).flat().map(l => l.id)` não contém ID do lead simulado.
- **1.5**: cenário pareado — chamar mesmo endpoint sem o filtro contra fixture só com lead real → contagem idêntica antes/depois da feature.

---

### Fase 2 — Side-effects: interceptar Meta API e bypassar eval/kanban

#### Happy path
1. Estender `simulator-bus.ts` com `publishToClient(waId, event)` / `subscribeToClient(waId, cb)` e tipo `SimulatorClientEvent`.
2. `whatsapp/api.ts` ganha helper `isSimulatedWaId(to)` e branch em todos os senders (`sendTextMessage`, `sendReplyButtons`, `sendListMessage`, `sendInteractiveMessage`, `sendTypingIndicator`, `markAsRead`).
3. `whatsapp/proxy.ts` — `handoffToAgents` carrega conversa antes do UPDATE, lê `isSimulated`. Se true:
   - Lead criado herda `isSimulated: true`.
   - Pula `applyTrackedStageToLead`.
   - Pula `triggerEvalScoring`.
   - `sendToAttendant` ganha overload `{ simulated }` — não bate Meta quando origem é simulada.
4. `closeHandoff`, `relayUserToAgent`, `relayWebUserToAgent` — todos verificam `isSimulated` da conversa.
5. `eval/trigger.ts` — `triggerEvalScoring` carrega conversa, early return se `isSimulated`.
6. Rodar fluxo: criar conversation com `is_simulated=true`, `waId=SIM-abc`, chamar `processTextMessage("SIM-abc", "oi")` → agente responde via `sendTextMessage("SIM-abc", "...")` → branch publica no bus, `fetch` mock nunca é chamado.

#### Edge cases
- **EC-2.1:** `isSimulatedWaId("")` (web handoff usa `userWaId=""`) — não pode crashar nem classificar como simulado. Retorna `false`.
- **EC-2.2:** `isSimulatedWaId("SIM-")` (vazio depois do prefixo) — retorna `true` (qualquer waId começando com SIM- é sim).
- **EC-2.3:** `isSimulatedWaId("simulado-abc")` (caso lowercase ou variante) — retorna `false`. Prefixo exato `SIM-` case-sensitive.
- **EC-2.4:** Conversa simulada, mas `sendTextMessage` chamado com phone de atendente real (que é número Meta válido). Branch deve verificar **origem** (conversa), não destino. `sendToAttendant` precisa receber `{ simulated: true }` explicitamente.
- **EC-2.5:** `triggerEvalScoring` chamado com conversation que não existe — early return sem crash.
- **EC-2.6:** `triggerEvalScoring` chamado manualmente (futuro endpoint admin "rodar eval") — deve respeitar opt-in: aceitar flag `forceSimulated` ou similar pra contornar guard.
- **EC-2.7:** `relayUserToAgent` simulada — não chama `sendTextMessage` pro phone real do atendente, apenas publica no bus do atendente.
- **EC-2.8:** Conversa real `handoffToAgents` continua chamando Meta normalmente — branch não vaza.

#### Regressões prováveis
- `sendTextMessage` ganhar branch dispara consequência em testes integração existentes que mockam `fetch` — ajustar mocks.
- `proxy.sendToAttendant` mudar de assinatura (overload) — chamadas antigas têm que continuar funcionando (default `simulated: false`).
- `triggerEvalScoring` ganhar carregamento de conversa adiciona round-trip DB — perfil de performance do handoff cresce em ms. Aceitável mas medir.
- Branch `if (isSimulated)` espalhado em 6+ lugares — alta chance de inconsistência. Centralizar em helper único.

#### Multi-canal / cross-talk
- Conversa simulada **web** (`waId=null`, `channel=web`) — `isSimulatedWaId` não cobre. Verificar que branch em `relayWebUserToAgent` usa `conversation.isSimulated` direto do DB, não tenta inferir do waId.
- Conversa simulada **whatsapp** com waId `SIM-abc` e conversa real com waId `5511999999999` rodando em paralelo no mesmo processo — bus tem que ter namespaces isolados.
- Conversa simulada chama `handoffToAgents` enquanto atendente real está respondendo conversa real — mensagens não se cruzam (validar via cenário simultâneo).

#### Estados intermediários
- Conversa pré-existente sem `isSimulated` (NULL antes da migration) — após Fase 0, default deveria garantir false. Mas inserts via raw SQL podem ter pulado default. Garantir leitura defensiva: `conv.isSimulated === true` (não `!conv.isSimulated`).
- Race: dois `processTextMessage("SIM-abc", ...)` simultâneos pra mesma conversa simulada — orchestrator é stateless por turno, ok. Mas se ambos disparam handoff ao mesmo tempo, lead pode duplicar — já existe `existing` check, manter.
- `sendTextMessage("SIM-abc", ...)` chamado SEM o branch implementado (regressão futura) — bate Meta com phone inválido, retorna erro 400, registra log de erro. Cobertura mínima: log de erro Meta = falha de teste em pipeline.

#### Critérios de aceite binários (Fase 2)
- [ ] **2.1** Unit test `isSimulatedWaId`: `isSimulatedWaId("SIM-abc") === true`, `isSimulatedWaId("5511999999999") === false`, `isSimulatedWaId("") === false`, `isSimulatedWaId("sim-abc") === false`, `isSimulatedWaId("SIM-") === true`.
- [ ] **2.2** Unit test com `vi.mock` em global `fetch`: chamada de `sendTextMessage("SIM-abc", "oi")` → spy de `fetch` é chamado **0 vezes** (verificável via `expect(fetch).not.toHaveBeenCalled()`).
- [ ] **2.3** Mesmo cenário, evento aparece no bus: `subscribeToClient("SIM-abc", cb)` recebe `{type:"text", text:"oi"}` (cb chamado 1 vez).
- [ ] **2.4** Integration test: conversation com `is_simulated=true` chama `handoffToAgents(...)` → mock global de `fetch` é chamado **0 vezes** (atendentes não recebem Meta API), `applyTrackedStageToLead` mock é chamado **0 vezes**, `triggerEvalScoring` (ou `scoreConversation`) mock é chamado **0 vezes**.
- [ ] **2.5** Mesmo cenário acima, lead criado tem `is_simulated=true` no DB (`SELECT is_simulated FROM leads WHERE conversation_id=<id>` retorna `t`).
- [ ] **2.6** Integration test contrário (não-regressão): conversation com `is_simulated=false`, `handoffToAgents(...)` → `fetch` é chamado N vezes (1 por atendente + 1 pro user), `applyTrackedStageToLead` chamado 1 vez, `triggerEvalScoring` chamado 1 vez.
- [ ] **2.7** `relayUserToAgent("SIM-abc", "ola")` com conversa handed_off simulada → `fetch` chamado 0 vezes, bus de atendente recebe evento com payload contendo `simulated: true` (Fase 7 valida UI).
- [ ] **2.8** `relayWebUserToAgent(<id>, "texto", "Nome")` com conversation simulada handed_off → `fetch` chamado 0 vezes (atendente não notificado via Meta), bus de atendente recebe evento.
- [ ] **2.9** `triggerEvalScoring(<id>, "handoff")` com conversation simulada → log `[eval-trigger:handoff] skipped <id>: simulated` E `scoreConversation` mock é chamado 0 vezes.
- [ ] **2.10** `closeHandoff(<id>)` com conversa simulada → conversa muda para status `closed`, mas mensagem de "encerrado" pro user simulado vai pro bus, não pra Meta.
- [ ] **2.11** Branch não vaza: conversation real chamando qualquer função tem mocks chamados como antes — coberto por suite de regressão atual rodando sem falha (`npm run test -- proxy`).
- [ ] **2.12** Spy de `publishToClient`: chamado 1x por `sendTextMessage(SIM-..., ...)`, com `{type:"text", text:"..."}` exato.
- [ ] **2.13** Spy de `publishToClient`: chamado 1x por `sendReplyButtons(SIM-..., body, [{id,title}])` com `{type:"interactive", interactive:{type:"button", body:..., action:{buttons:[...]}}}`.
- [ ] **2.14** Spy de `publishToClient`: chamado 1x por `sendListMessage(SIM-..., body, btn, sections)` com `{type:"interactive", interactive:{type:"list", ...}}`.
- [ ] **2.15** `sendTypingIndicator` recebendo messageId associado a conversa simulada → publica `{type:"typing", on:true}` no bus do waId correspondente.
- [ ] **2.16** `markAsRead(messageId)` para mensagem de conversa simulada → no-op (não bate Meta), retorna `{ messageId: "sim-..." }` ou similar.
- [ ] **2.17** Performance: `handoffToAgents` em conversa simulada completa em <300ms (sem chamada Meta, ganho líquido em latência).

#### Dados de teste necessários (Fase 2)
- Fixture: 2 conversations no DB (1 real, 1 simulada com `waId=SIM-fixture`), 1 atendente ativo com `phone=5511888888888`.
- Mock global `fetch` configurado em `tests/setup.ts` registrando todas as chamadas.
- Vitest spy em `publishToClient`, `publishToAttendant`, `scoreConversation`, `applyTrackedStageToLead`.

#### Output esperado por cenário
- **2.2**: `expect(global.fetch).not.toHaveBeenCalled()` passa.
- **2.4**: 3 asserções `not.toHaveBeenCalled()` para `fetch`, `applyTrackedStageToLead`, `scoreConversation`.
- **2.5**: query `SELECT is_simulated FROM leads WHERE conversation_id='<fixture-id>'` via `db` direto → resultado `[{ is_simulated: true }]`.
- **2.9**: `console.log` capturado contém string `simulated` e mock spy de `scoreConversation` registra `toHaveBeenCalledTimes(0)`.

---

### Fase 3 — Mover `/admin/simulator` atual e criar index

#### Happy path
1. Mover arquivo `src/app/admin/(dashboard)/simulator/page.tsx` → `src/app/admin/(dashboard)/simulator/attendant/page.tsx` (conteúdo idêntico).
2. Mover `src/app/api/admin/simulator/[attendantId]/` → `src/app/api/admin/simulator/attendant/[attendantId]/`.
3. Mover `src/components/admin/simulator/simulator-chat.tsx` → `src/components/admin/simulator/attendant/simulator-chat.tsx`.
4. Atualizar TODOS imports e URLs internas (`/api/admin/simulator/<id>/stream` → `/api/admin/simulator/attendant/<id>/stream`).
5. Criar novo `src/app/admin/(dashboard)/simulator/page.tsx` → index com 3 `<Link>` cards (`/admin/simulator/whatsapp`, `/admin/simulator/web`, `/admin/simulator/attendant`). Pelo menos um título + descrição por card.
6. `src/components/admin/app-sidebar.tsx` — adicionar item "Simulador" no grupo "Aplicacoes" com ícone `FlaskConicalIcon` apontando `/admin/simulator`.
7. Acessar `/admin/simulator/attendant` → comportamento idêntico ao antigo `/admin/simulator`.

#### Edge cases
- **EC-3.1:** Link interno em outro arquivo que ainda aponta pro path antigo `/admin/simulator` esperando o componente atendente — quebra. Buscar todas referências (`grep -r "/admin/simulator"`).
- **EC-3.2:** URL externa (bookmark de dev) `/admin/simulator` agora mostra index — comportamento esperado, comunicar no done report.
- **EC-3.3:** Acesso direto `/admin/simulator/web` ou `/admin/simulator/whatsapp` antes de Fase 5/6 — deve retornar 404 (Next.js sem page = 404).
- **EC-3.4:** Sidebar abre na collapsed mode (`Sidebar collapsible="icon"`) — ícone do simulador aparece com tooltip "Simulador".
- **EC-3.5:** Active state da sidebar: navegando `/admin/simulator/attendant` deve highlightar item "Simulador" (via `pathname.startsWith("/admin/simulator")`).

#### Regressões prováveis
- `EventSource("/api/admin/simulator/<id>/stream")` no client (`simulator-chat.tsx`) precisa migrar para `/attendant/<id>/stream` — esquecimento = simulador atual quebra.
- `fetch("/api/admin/simulator/<id>/reply")` no client idem.
- Testes existentes referenciando path antigo precisam atualizar.

#### Multi-canal / cross-talk
- Funcionalidade do simulador atendente (in-flight handoff de conversa real) continua funcionando — coberto pelo smoke da Fase 3.

#### Estados intermediários
- Refactor em duas etapas: move + cria index. Se commit intermediário entrar em CI sem index, `/admin/simulator` 404 pode quebrar smoke. Garantir commit atômico ou ordem: cria novo path atendente → cria index → remove antigo (mover é tudo-em-um na prática).

#### Critérios de aceite binários (Fase 3)
- [ ] **3.1** Arquivo `src/app/admin/(dashboard)/simulator/attendant/page.tsx` existe e exporta o componente que antes era `simulator/page.tsx`.
- [ ] **3.2** Arquivo `src/app/admin/(dashboard)/simulator/page.tsx` existe e renderiza 3 `<Link>` com hrefs `/admin/simulator/whatsapp`, `/admin/simulator/web`, `/admin/simulator/attendant` (verificável via render snapshot).
- [ ] **3.3** Arquivo `src/app/api/admin/simulator/attendant/[attendantId]/stream/route.ts` existe; `src/app/api/admin/simulator/[attendantId]/stream/route.ts` **NÃO** existe mais.
- [ ] **3.4** Arquivo `src/app/api/admin/simulator/attendant/[attendantId]/reply/route.ts` existe; idem para o antigo (removido).
- [ ] **3.5** `grep -r "/api/admin/simulator/" src` — todas as ocorrências apontam para o novo path com `/attendant/` no meio (zero referências ao path antigo).
- [ ] **3.6** Sidebar admin (`app-sidebar.tsx`) tem item adicional `Simulador` com `href="/admin/simulator"` no grupo "Aplicacoes".
- [ ] **3.7** Acessar `/admin/simulator/attendant` no browser local → vê seleção de atendente + área de chat idêntica ao antigo (snapshot visual ou DOM diff).
- [ ] **3.8** Acessar `/admin/simulator` → vê 3 cards. Clicar no card "Atendente" navega pra `/admin/simulator/attendant`.
- [ ] **3.9** SSE de atendente continua funcionando: disparar handoff manual (fixture) → simulador recebe mensagem no novo path em <2s.
- [ ] **3.10** `npm run typecheck` passa após renames.
- [ ] **3.11** `npm run lint` passa.
- [ ] **3.12** Item da sidebar tem `isActive=true` quando pathname começa com `/admin/simulator`.

#### Dados de teste necessários (Fase 3)
- 1 atendente real (`role=attendant`, `is_active=true`, `phone=5511777777777`).
- 1 conversa em status `handed_off` pendente de claim.

#### Output esperado por cenário
- **3.5**: `grep -rn "/api/admin/simulator/" src | grep -v "/attendant/"` retorna 0 linhas.
- **3.7**: render de página tem `<Select>` com lista de atendentes (mesmo placeholder textual).

---

### Fase 4 — Backend CRUD `/api/admin/simulator/sessions`

#### Happy path
1. Criar `src/app/api/admin/simulator/sessions/route.ts`:
   - `POST { channel: "web" | "whatsapp" }` → insere `conversations` com `is_simulated=true`, `channel`, `waId=SIM-<uuid>` se whatsapp, `metadata: { createdBySimUserId: <user.id> }`. Retorna `{ conversationId, waId, channel, createdAt }`.
   - `GET` → lista conversas `is_simulated=true` ORDER BY `updatedAt DESC`. Cada item: `{ conversationId, channel, waId, createdAt, updatedAt, createdBy: { id, name }, status, contactName, lastMessagePreview }`. Aceita `?channel=web|whatsapp`.
2. Criar `src/app/api/admin/simulator/sessions/[id]/route.ts`:
   - `DELETE` → apaga (cascade leads/messages/artifacts).
   - `GET` → estado completo (conversation + messages + handoffState).
3. Todas as rotas: `process.env.NODE_ENV === "production" → 404` + `requireRole("admin")`.

#### Edge cases
- **EC-4.1:** `POST` com `channel` inválido (`"sms"`) → 400 com payload Zod-like.
- **EC-4.2:** `POST` sem body → 400.
- **EC-4.3:** `POST` com `channel=web` → `waId` é null (web nunca tem waId).
- **EC-4.4:** `POST` com `channel=whatsapp` → `waId` começa com `SIM-` e é UUID v4 válido (regex `/^SIM-[0-9a-f-]{36}$/i`).
- **EC-4.5:** Usuário não-admin chama POST → 403.
- **EC-4.6:** Não autenticado → 401.
- **EC-4.7:** `NODE_ENV=production` → 404 em todos os métodos.
- **EC-4.8:** `GET` sem nenhuma conversa simulada → `{ items: [] }`.
- **EC-4.9:** `GET ?channel=whatsapp` filtra; `?channel=foo` ignora filtro ou retorna 400 (decidir — sugestão: ignora silenciosamente, igual `/api/admin/conversations`).
- **EC-4.10:** `DELETE /sessions/<id-inexistente>` → 404.
- **EC-4.11:** `DELETE` cascade: confirma que leads, messages, artifacts e leadEvents associados foram deletados.
- **EC-4.12:** `GET /sessions/<id>` retorna `messages` ordenadas ASC por `createdAt`.
- **EC-4.13:** `lastMessagePreview` truncado em 80 chars; conversa sem mensagem retorna `null` ou `""`.
- **EC-4.14:** `createdBy` referencia `user` deletado (user removido depois de criar sessão) → preview retorna `null` ou string fallback, não 500.
- **EC-4.15:** Dois admins criando sessões simultaneamente → ambas as conversas criadas com UUIDs distintos, sem race.

#### Regressões prováveis
- `requireRole` retornando `{ error: NextResponse, session: null }` — nova rota tem que checar `error` antes de continuar.
- Cascade de DELETE depende de `onDelete: "cascade"` em FKs — confirmar todas as FKs em `schema.ts`.
- `metadata` jsonb mal validado pode receber chave estranha; usar Zod no parse.

#### Multi-canal / cross-talk
- Sessões web e whatsapp coexistem no mesmo endpoint sem confusão — filtragem por `?channel` testada.

#### Estados intermediários
- POST falha após insert (ex: insert ok, retorno falha por algum hook) → conversa fica órfã. Aceitável (gerenciar manualmente).
- DELETE inicia mas falha no meio (cascade trava em algum trigger) → sessão pode ficar parcialmente apagada. Cobrir com transaction explícita.

#### Critérios de aceite binários (Fase 4)
- [ ] **4.1** `POST /api/admin/simulator/sessions` com body `{"channel":"web"}` retorna 200, body com `conversationId` (uuid), `channel:"web"`, `waId: null`, `createdAt`.
- [ ] **4.2** Mesmo POST insere row em `conversations` com `is_simulated=true` (verificável via SQL).
- [ ] **4.3** `POST` com `{"channel":"whatsapp"}` retorna `waId` matching `/^SIM-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.
- [ ] **4.4** `POST` com `{"channel":"sms"}` retorna 400.
- [ ] **4.5** `POST` sem auth retorna 401.
- [ ] **4.6** `POST` com user role=viewer retorna 403.
- [ ] **4.7** `POST` com `NODE_ENV=production` retorna 404.
- [ ] **4.8** `metadata.createdBySimUserId` na row inserida === ID do usuário admin autenticado (`SELECT metadata->>'createdBySimUserId' FROM conversations WHERE id=<new-id>`).
- [ ] **4.9** `GET /api/admin/simulator/sessions` retorna `{ items: [...] }` com todas conversas `is_simulated=true` ORDER BY `updatedAt DESC` (verificar order com fixture de 3 sessões em timestamps diferentes).
- [ ] **4.10** Cada item de `GET` contém: `conversationId`, `channel`, `waId`, `createdAt`, `updatedAt`, `createdBy: { id, name }`, `status`, `contactName`, `lastMessagePreview`.
- [ ] **4.11** `GET ?channel=whatsapp` retorna apenas sessões whatsapp.
- [ ] **4.12** `DELETE /sessions/<id>` retorna 200 ou 204; row some de `conversations`; mensagens/leads/artifacts relacionados também (verificar via SELECT COUNT pré e pós).
- [ ] **4.13** `DELETE /sessions/<id-inexistente>` retorna 404.
- [ ] **4.14** `GET /sessions/<id>` retorna `{ conversation, messages, handoffState }` — `messages` em ordem cronológica ASC, `handoffState` matching shape do `getHandoffState`.
- [ ] **4.15** Concorrência: chamada paralela de 5 POSTs simultâneos resulta em 5 conversas distintas (UUIDs únicos) — coberto por integration test com Promise.all.
- [ ] **4.16** Vitest cobertura ≥80% nesses 2 endpoints.

#### Dados de teste necessários (Fase 4)
- Usuário admin (`role=admin`) e usuário viewer (`role=viewer`) seedados em test DB.
- Helper `createAdminSession()` que devolve cookie/token válido pra requests.

#### Output esperado por cenário
- **4.2**: `SELECT id, is_simulated, channel, wa_id FROM conversations WHERE id='<returned-id>'` → 1 row com `is_simulated=t`.
- **4.12**: `SELECT COUNT(*) FROM messages WHERE conversation_id='<deleted-id>'` retorna 0.

---

### Fase 5 — Simulador WEB

#### Happy path
1. Nova página `src/app/admin/(dashboard)/simulator/web/page.tsx` (server component) — busca sessões via `GET /api/admin/simulator/sessions?channel=web`, passa props pra client component.
2. Novos componentes em `src/components/admin/simulator/web/`:
   - `simulator-web.tsx` — layout 2 colunas (sidebar inbox + main chat).
   - `simulator-inbox.tsx` — lista conversas web simuladas + "Nova conversa" + dropdown filtro (todas/minhas).
   - `simulator-web-chat.tsx` — wrappa `ChatProvider` com `conversationId` da sessão, reusa `ChatLayout`, `MessageList`, `ChatInput`, `ArtifactRenderer` do site.
   - `handoff-banner.tsx` — quando `status === "handed_off"`, mostra alert + botão "Assumir eu mesmo".
   - `simulated-badge.tsx` — header fixo "🧪 Simulada por @autor".
3. Reusa `POST /api/chat` (backend já lê `is_simulated` do DB).
4. Cenário end-to-end: admin abre `/admin/simulator/web` → "Nova conversa" → mensagem "quero comprar carro" → agente responde → preenche gates (welcome → experience → credit → timeframe → lance) → recomendação aparece → clica "Tenho interesse" → form de lead → submit → handoff dispara, banner aparece, lead criado com `is_simulated=true`.

#### Edge cases
- **EC-5.1:** "Nova conversa" criada mas sem mensagem ainda — aparece na inbox com `lastMessagePreview=null`.
- **EC-5.2:** Selecionar sessão antiga retoma estado: `ChatProvider` recebe `conversationId`, hidrata mensagens via API existente (`/api/conversations/<id>` ou similar — verificar se existe).
- **EC-5.3:** Sessão "Solo Dev" — botão "Assumir eu mesmo" lazy-create um atendente sintético "Solo Dev" com `is_active=true, role=attendant`. MVP simplifica usando QUALQUER atendente cadastrado.
- **EC-5.4:** Filtro "minhas" — só mostra conversas com `metadata.createdBySimUserId === sessionUserId`.
- **EC-5.5:** Dropdown sem nenhuma "minha" — mensagem "Você ainda não criou nenhuma. Clique em Nova conversa."
- **EC-5.6:** Sessão deletada via outra aba — refresh da página remove da lista; tentativa de selecionar ID inexistente mostra erro graceful.
- **EC-5.7:** Mensagem submetida com texto vazio (apenas whitespace) — não envia (já protegido em `ChatInput`?).
- **EC-5.8:** Network drop no meio do streaming — `useChat` reconecta automaticamente; comportamento idêntico ao site real.
- **EC-5.9:** Usuário fecha aba durante handoff em curso — conversa fica `handed_off` no DB; ao reabrir, banner aparece imediatamente.
- **EC-5.10:** "Assumir eu mesmo" clicado, mas nenhum atendente cadastrado no DB → mostra erro "Cadastre um atendente primeiro" e link pra `/admin/attendants`.
- **EC-5.11:** Race: 2 admins simulando ao mesmo tempo, ambas as conversas isoladas (waId distintos / conversationIds distintos).

#### Regressões prováveis
- `ChatProvider`/`ChatLayout` recebendo prop não esperado quebra render.
- `POST /api/chat` ganhar comportamento condicional baseado em `is_simulated` (não deveria, mas pode ser tentação de "otimizar") — bloquear via teste de regressão garantindo paridade de payload com chat real.
- Filtros do `lastMessagePreview` indo a campo pesado (full message load) podem causar N+1 — usar subquery ou window function.

#### Multi-canal / cross-talk
- Sessão web simulada NÃO deve aparecer no `/admin/simulator/whatsapp/` (filtro `?channel=web`).
- Mensagens persistem em `messages` table — visíveis em `/admin/conversations` SE `include_simulated=true` (futuro debug); por default NÃO.

#### Estados intermediários
- Conversa simulada em `status=handed_off` com `handedOffUserId=null` (pendente claim) — banner mostra "Aguardando atendente" + botão "Assumir eu mesmo".
- Após "Assumir eu mesmo", `handedOffUserId` setado, banner muda pra "Atendido por [nome]".
- `/fim` digitado pelo atendente assumido fecha conversa: `status=closed`, banner some, chat fica readonly.

#### Critérios de aceite binários (Fase 5)
- [ ] **5.1** `/admin/simulator/web` renderiza layout 2 colunas (sidebar + main); sidebar contém botão "Nova conversa".
- [ ] **5.2** Click em "Nova conversa" dispara `POST /api/admin/simulator/sessions` com `{channel:"web"}` e abre o chat vazio com a nova `conversationId`.
- [ ] **5.3** Mensagem "oi" submetida via `ChatInput` dispara `POST /api/chat` com payload contendo o `conversationId` da sessão simulada.
- [ ] **5.4** Resposta do agente é renderizada em `MessageList` (usar exatamente o componente do site, verificável via testid).
- [ ] **5.5** Welcome categories (gate) renderiza via `ArtifactRenderer` com botões clicáveis.
- [ ] **5.6** Click em botão de gate dispara o action correto (categoria, experience, credit, timeframe, lance) — verificado via spy no `POST /api/chat` body.
- [ ] **5.7** Após gates completados, artifact `recommendation_card` aparece; botão "Tenho interesse" presente.
- [ ] **5.8** Click em "Tenho interesse" → `lead_form` artifact aparece; submit do form chama `POST /api/leads` que dispara `handoffToAgents`; banner de handoff aparece.
- [ ] **5.9** Após handoff, `conversation.status === "handed_off"` no DB E `conversation.is_simulated === true` E `lead.is_simulated === true`.
- [ ] **5.10** `/admin/pipeline` (em outra aba ou ré-render) NÃO mostra esse lead.
- [ ] **5.11** `/admin` dashboard NÃO incrementa contadores de lead.
- [ ] **5.12** Inbox lista a sessão criada com `lastMessagePreview` preenchido.
- [ ] **5.13** Filtro dropdown "Minhas" mostra apenas sessões com `createdBySimUserId === sessionUser.id`.
- [ ] **5.14** Recarregar página seleciona última sessão e hidrata mensagens corretamente.
- [ ] **5.15** Botão "Assumir eu mesmo" no banner abre split lateral com `SimulatorChat` (componente atendente) pré-selecionado.
- [ ] **5.16** Após "Assumir eu mesmo", `handedOffUserId` setado no DB; banner muda pra mostrar atendente claimado.
- [ ] **5.17** Mensagem enviada pelo atendente claimado aparece no chat do simulador web em <2s (via stream/refetch).
- [ ] **5.18** `/fim` enviado pelo atendente fecha conversa (`status=closed`); chat fica readonly.
- [ ] **5.19** Header da página exibe `simulated-badge` com nome do criador.
- [ ] **5.20** Mock global de `fetch` para `graph.facebook.com` registra 0 calls durante todo o fluxo (sniffer no test setup).
- [ ] **5.21** E2E Playwright executando happy path completo em <60s.
- [ ] **5.22** Auth: usuário não-admin não consegue carregar a página (`/admin/simulator/web` redireciona para login OU retorna 403 — alinhar com padrão atual do admin).

#### Dados de teste necessários (Fase 5)
- Usuário admin seeded.
- Pelo menos 1 atendente ativo (para "Assumir eu mesmo").
- Persona "concierge" + 1 specialist por categoria ativos no DB.
- Grupos de fixture suficientes pra orchestrator retornar recommendation_card.

#### Output esperado por cenário
- **5.9**: query SQL `SELECT is_simulated FROM conversations WHERE id='<id>'` → `t`; query `SELECT is_simulated FROM leads WHERE conversation_id='<id>'` → `t`.
- **5.10**: response do `GET /api/admin/leads` parsed JSON — array de leads não contém o `id`.
- **5.20**: `expect(fetchSpy.mock.calls.filter(c => c[0].includes("graph.facebook.com"))).toHaveLength(0)`.

---

### Fase 6 — Simulador WHATSAPP

#### Happy path
1. Nova página `src/app/admin/(dashboard)/simulator/whatsapp/page.tsx` (server component) — busca sessões `?channel=whatsapp`.
2. Novas rotas API em `src/app/api/admin/simulator/whatsapp/[conversationId]/`:
   - `stream/route.ts` — GET SSE, lê `conversations.waId`, `subscribeToClient(waId, cb)`, emite eventos `{type:"text"|"interactive"|"typing"|"connected"|"ping"}`.
   - `send/route.ts` — POST `{ kind:"text", text }` ou `{ kind:"interactive", replyId, replyTitle }` → chama `processTextMessage` / `processInteractiveReply` (do `processor.ts`). Retorna 204.
3. Novos componentes em `src/components/admin/simulator/whatsapp/`:
   - `simulator-whatsapp.tsx` — layout 2 col.
   - `simulator-inbox.tsx` — variante whatsapp.
   - `whatsapp-stage.tsx` — container 440px.
   - `whatsapp-header.tsx`, `whatsapp-background.tsx`, `whatsapp-message-bubble.tsx`, `whatsapp-typing-indicator.tsx`, `whatsapp-interactive-buttons.tsx`, `whatsapp-interactive-list.tsx`, `whatsapp-input.tsx`.
4. Reusa `simulated-badge.tsx` e `handoff-banner.tsx` da Fase 5.
5. Cenário E2E: "Nova conversa" → digita "oi" → vê bolhas com texto + botões nativos de categoria → clica "🚗 Automóvel" → fluxo de gates roda como WhatsApp real → list message com bottom-sheet pra faixa → seleciona → segue até "fechado" → handoff banner.

#### Edge cases
- **EC-6.1:** Input vazio → não envia.
- **EC-6.2:** Mensagem muito longa (5000 chars) → `splitMessage` divide em duas bolhas em ordem.
- **EC-6.3:** Reply buttons com mais de 3 — só renderiza primeiros 3 (paridade com WhatsApp).
- **EC-6.4:** Reply button com título > 20 chars — trunca igual `whatsapp/api.ts`.
- **EC-6.5:** List message com mais de 10 rows por section — só renderiza primeiras 10.
- **EC-6.6:** List sem rows → não crashar, mostrar lista vazia.
- **EC-6.7:** Typing indicator aparece ANTES da primeira bolha; some após chegada (timeout 8s fallback).
- **EC-6.8:** Cadência: bolhas chegam UMA por UMA (não todas de uma vez), respeitando ordem do `splitMessage`.
- **EC-6.9:** Clique em reply button dispara `POST .../send {kind:"interactive", replyId, replyTitle}` — verificável via spy.
- **EC-6.10:** Clique em list row dispara `POST .../send {kind:"interactive", replyId:<row.id>, replyTitle:<row.title>}`.
- **EC-6.11:** Botão decorativo (anexo, microfone, emoji) não tem `onClick` ativo (apenas visual).
- **EC-6.12:** Header mostra avatar + nome "Helena · Aja Agora" + status "online".
- **EC-6.13:** Double-check ticks aparecem em mensagens enviadas pelo simulador (azul ou cinza, fixo — não precisa lógica de read receipt).
- **EC-6.14:** Background pattern visível, escala correta.
- **EC-6.15:** SSE reconnect após network drop — `EventSource` retoma sem perder ordem.
- **EC-6.16:** SSE listener vaza ao trocar de sessão — `useEffect` cleanup garante unsubscribe (verificar via teste de leak: trocar sessão 10x e contar listeners no bus, deve ser sempre <=1 ativo).
- **EC-6.17:** HMR no dev: salvar arquivo do bus não duplica subscribers (já tem mitigação `globalThis` — regressão).
- **EC-6.18:** Bottom-sheet do list message abre como modal centrado (mobile-feel); fechar via X ou clique fora.
- **EC-6.19:** Clique em row do bottom-sheet fecha o sheet automaticamente.

#### Regressões prováveis
- `splitMessage` mudou ordem porque `bus.emit` é síncrono mas pub/sub pode reorderar — confirmar que `EventEmitter` é FIFO e que `publishToClient` é chamado seguidamente (não em `Promise.all`).
- `processInteractiveReply` esperando phone real (regex `5511...`) quebra com `SIM-...` — verificar branches em `dispatchInteractiveReply`.
- Memory leak: SSE não fecha ao navegar fora → bus acumula listeners (regressão de Fase 7 ou refactor).
- `processTextMessage` chamado direto via API; precisa lidar com `contactName=undefined` para conversas simuladas sem nome.

#### Multi-canal / cross-talk
- Dois devs simulando WhatsApp simultaneamente em waIds diferentes — não há colisão (waId é namespace de bus).
- Mesmo dev abre duas abas pra mesma sessão simulada → ambas recebem stream (bus permite múltiplos subscribers no mesmo evento). Validar que ambas as abas refletem o mesmo estado.

#### Estados intermediários
- Mensagem enviada, agente está respondendo (typing+stream), usuário fecha aba — backend continua processando, mensagens vão pro bus sem consumidor (descartadas). Ao reabrir, sessão é hidratada via histórico (não stream); última mensagem perdida pode aparecer porque foi persistida em `messages` table.
- Race: usuário clica reply button 2x rapidamente — dois `processInteractiveReply` simultâneos. Deve ser idempotente ou último vence. Validar no teste que o segundo clique não trava o orchestrator (já existe no canal real, mesma robustez).
- `/reset` digitado no input simulado → deleta conversa atual. Inbox refletir (auto-refresh ou prompt "conversa apagada, criar nova?").

#### Critérios de aceite binários (Fase 6)
- [ ] **6.1** `/admin/simulator/whatsapp` renderiza layout 2 colunas; sidebar com "Nova conversa".
- [ ] **6.2** "Nova conversa" → `POST /sessions {channel:"whatsapp"}` → seleciona nova sessão com `waId` matching `/^SIM-/`.
- [ ] **6.3** Input "oi" → `POST /api/admin/simulator/whatsapp/<id>/send {kind:"text", text:"oi"}` → backend chama `processTextMessage(waId, "oi", undefined, undefined)` (verificável via spy).
- [ ] **6.4** SSE `GET /api/admin/simulator/whatsapp/<id>/stream` retorna `Content-Type: text/event-stream`.
- [ ] **6.5** Stream emite evento `{type:"connected"}` ao abrir.
- [ ] **6.6** Stream emite evento `{type:"text", text:"<resposta agente>"}` quando agente chama `sendTextMessage(waId, ...)`.
- [ ] **6.7** Bolha verde (sent) renderiza para mensagem do user; bolha branca (received) para mensagem do agente. Verificável via classes Tailwind ou testid.
- [ ] **6.8** Typing indicator (3 dots) aparece quando stream emite `{type:"typing", on:true}`.
- [ ] **6.9** Typing indicator desaparece quando primeira `{type:"text"}` chega ou após 8s.
- [ ] **6.10** Reply buttons (até 3) renderizados quando stream emite `{type:"interactive", interactive:{type:"button", ...}}`.
- [ ] **6.11** Click em reply button chama `processInteractiveReply(waId, replyId, replyTitle, undefined, undefined)` (verificável via spy).
- [ ] **6.12** Reply button com title > 20 chars exibe truncado (≤20 chars).
- [ ] **6.13** List message com `{type:"interactive", interactive:{type:"list", ...}}` mostra botão "Ver opções"; clique abre bottom-sheet.
- [ ] **6.14** Bottom-sheet exibe sections + rows com title + description, max 10 rows.
- [ ] **6.15** Click em row do sheet fecha sheet + chama `processInteractiveReply(waId, row.id, row.title, ...)`.
- [ ] **6.16** Cadência preservada: mensagem longa que `splitMessage` divide em 3 chunks → 3 bolhas chegam EM ORDEM (não invertidas) — coberto por teste com mock que envia 3 textos seguidos e verifica ordem na DOM.
- [ ] **6.17** Mock global de `fetch` registra **0 chamadas** para `graph.facebook.com` durante toda a simulação.
- [ ] **6.18** E2E Playwright happy path completo: nova conversa → "oi" → welcome buttons → categoria "🚗 Automóvel" → experience → credit (list) → timeframe → lance → recommendation → "tenho interesse" → handoff banner.
- [ ] **6.19** No DB ao final: `conversation.is_simulated=true`, `conversation.status='handed_off'`, `lead.is_simulated=true`, `lead.phone` é null ou normalizado (waId `SIM-...` produz phone null pelo `normalizeWaIdToPhone`).
- [ ] **6.20** Dashboard/kanban não mostra a conversa nem o lead.
- [ ] **6.21** Trocar de sessão na inbox: SSE da sessão antiga é fechada (cleanup do useEffect), nova SSE aberta. Bus tem 1 subscriber por waId no máximo.
- [ ] **6.22** Send com body inválido (`{kind:"foo"}`) retorna 400.
- [ ] **6.23** Send em sessão com `is_simulated=false` retorna 403 ou 404 (esse endpoint é só pra simuladas — gate explícito).
- [ ] **6.24** Header da página mostra `simulated-badge` com autor.
- [ ] **6.25** Container central tem largura ≤ 440px.

#### Dados de teste necessários (Fase 6)
- Mesmas fixtures da Fase 5 + verificação extra dos formatters (`groupCardToWhatsApp` etc.).
- Mock de SSE/EventSource para testes unitários (jsdom não tem nativo — usar `eventsource` polyfill).

#### Output esperado por cenário
- **6.6**: cliente em browser DevTools "Network" → conexão `stream/` mostra eventos com `data: {"type":"text","text":"..."}`.
- **6.11**: spy `expect(processInteractiveReplySpy).toHaveBeenCalledWith("SIM-abc", "category_auto", "🚗 Automóvel", undefined, undefined)`.
- **6.17**: `fetchSpy.mock.calls.find(c => String(c[0]).includes("graph.facebook.com"))` é `undefined`.
- **6.19**: 3 queries SQL conferem estado final.

---

### Fase 7 — Atendente vê badge `🧪 SIMULAÇÃO`

#### Happy path
1. `src/components/admin/simulator/attendant/simulator-chat.tsx` ganha lógica: quando mensagem do bus contém `simulated: true`, renderiza badge `🧪 SIMULAÇÃO` no header do bloco.
2. `simulator-bus.ts` — `publishToAttendant` aceita payload opcional `simulated: boolean`; preenchido pelo `proxy.sendToAttendant` quando origem é conversa simulada.
3. Cenário: dispara handoff de conversa simulada → mensagem chega no painel atendente com badge.

#### Edge cases
- **EC-7.1:** Mensagem do bus sem campo `simulated` (legado, antes da feature) — badge não aparece (`simulated !== true`).
- **EC-7.2:** Mistura de mensagens reais e simuladas na mesma sessão do atendente — cada bolha rende seu próprio badge.
- **EC-7.3:** Badge não estiliza mensagem de sucesso interna do painel (ex: "Você assumiu o atendimento de X") — só mensagens de cliente.
- **EC-7.4:** Atendente claima conversa simulada → bridge bidirecional funciona; resposta volta pro simulator-web/whatsapp do cliente com badge ausente no lado cliente (badge é só pro atendente).
- **EC-7.5:** Conversa simulada terminou (`/fim`) — última mensagem (encerramento) também flagged simulated.

#### Regressões prováveis
- `SimulatorMessage` type ganhar campo opcional — payloads existentes continuam válidos.
- Mensagens reais perderem flag automaticamente (default false) — verificar que sem `simulated` no payload, comportamento atual preservado.

#### Multi-canal / cross-talk
- Atendente está em uma sessão real **e** simulada simultaneamente (raro mas possível) — badges aparecem só nas simuladas.

#### Estados intermediários
- Migração de payload do bus (campo novo opcional) — testar que SSE stream continua sendo parseável por client antigo (no-op no campo extra).

#### Critérios de aceite binários (Fase 7)
- [ ] **7.1** Tipo `SimulatorMessage` em `simulator-bus.ts` ganha campo opcional `simulated?: boolean`.
- [ ] **7.2** `proxy.sendToAttendant` quando origem é conversa simulada chama `publishToAttendant(phone, text, { simulated: true })` (ou equivalente — assinatura definida pela implementação).
- [ ] **7.3** Mensagem real (não simulada) — bus payload tem `simulated: false` ou ausente.
- [ ] **7.4** `simulator-chat.tsx` renderiza badge "🧪 SIMULAÇÃO" próximo à bolha quando `message.simulated === true` (verificável via testid `data-testid="simulated-badge"`).
- [ ] **7.5** Mensagem real renderiza SEM badge.
- [ ] **7.6** E2E manual: 1 conversa real handoff + 1 conversa simulada handoff → painel atendente exibe ambas, só a simulada com badge.
- [ ] **7.7** SSE legado (client antigo) ainda parseia mensagem com campo extra sem erro (ignore graceful).
- [ ] **7.8** `npm run typecheck` passa após mudança do tipo.

#### Dados de teste necessários (Fase 7)
- 1 atendente ativo.
- 1 conversa real handoff + 1 conversa simulada handoff (criadas pelas Fases anteriores).

#### Output esperado por cenário
- **7.4**: DOM tem elemento com `data-testid="simulated-badge"`.
- **7.5**: DOM **NÃO** tem esse elemento na bolha real.

---

### Fase 8 — Suíte consolidada + regressão

#### Happy path
1. Rodar `npm run test` — todos vitest passam.
2. Rodar `npm run test:coverage` — coverage geral >= 80% em arquivos novos (`simulator-bus.ts`, `api.ts` partes novas, `dashboard-queries.ts`, sessions routes).
3. Rodar `npm run typecheck` e `npm run lint`.
4. Smoke manual end-to-end: web + whatsapp + atendente em 3 abas, verificar isolamento contra `/admin/pipeline`.
5. Regressão: chat público do site (`/`) continua funcionando idêntico (não é admin, não é simulador).
6. Regressão: webhook real do WhatsApp (`/api/whatsapp/webhook`) continua roteando para `processTextMessage` com phones reais — não interceptado pelo simulador.

#### Edge cases
- **EC-8.1:** Browser console errors durante happy path — devem ser 0 (sem warning de React key, sem 404).
- **EC-8.2:** `npm run build` (production build) **falha** ou aceita? Decisão: build deve passar; rotas com `process.env.NODE_ENV==="production" → 404` devem ser compatíveis com build. Verificar que página `/admin/simulator/web` e `/whatsapp` não rebenta em build.
- **EC-8.3:** Eslint/biome novos arquivos passam (`npm run lint`).
- **EC-8.4:** No prod (smoke pós-deploy), acessar `/admin/simulator/web` retorna 404 (gating funcionou).
- **EC-8.5:** Eval dashboard (`/admin/conversations` com filtro `?has_eval=true`) continua funcionando sem simuladas.

#### Regressões prováveis
- Cobertura cai abaixo do baseline atual.
- Algum teste integration legacy quebra por causa do mock global do `fetch` adicionado.
- Tipo `ConversationMetadata` ganhou campo `createdBySimUserId` — compatibilidade com leituras existentes.

#### Critérios de aceite binários (Fase 8)
- [ ] **8.1** `npm run test` exit code 0; nenhum teste skipped/todo não esperado.
- [ ] **8.2** `npm run test:coverage` arquivos novos têm cobertura ≥80% (statements, branches, functions, lines).
- [ ] **8.3** `npm run typecheck` exit code 0.
- [ ] **8.4** `npm run lint` exit code 0.
- [ ] **8.5** `npm run build` exit code 0 (production build não quebra com novas rotas).
- [ ] **8.6** Smoke E2E manual: 4 cenários (`/admin/simulator/web`, `/admin/simulator/whatsapp`, claim no `/admin/simulator/attendant`, isolamento em `/admin/pipeline`) executados sem erro de console.
- [ ] **8.7** Chat público (`/`) regressão: criar conversa, mandar mensagem, receber resposta — funciona idêntico ao pré-feature (smoke).
- [ ] **8.8** Webhook WhatsApp real (`/api/whatsapp/webhook`) regressão: simular payload Meta com waId real `5511777777777` → `processTextMessage` chamado, NÃO classificado como simulado, `fetch` para Meta chamado normalmente.
- [ ] **8.9** Performance: handoff de conversa real continua em <1s; handoff de conversa simulada em <300ms (sem chamada Meta).
- [ ] **8.10** Coverage do branch `is_simulated` em `proxy.ts` e `api.ts` é 100% (cada `if` testado ambos os lados).
- [ ] **8.11** Nenhuma chamada a `graph.facebook.com` durante toda a suíte (cobertura global de mock + assert no `tests/setup.ts`).
- [ ] **8.12** Acessar `/admin/simulator/web` em build prod local (`npm run build && NODE_ENV=production npm start`) retorna 404.

#### Dados de teste necessários (Fase 8)
- Banco limpo seedado pelas migrations + fixtures comuns.
- `.env.test` configurado com credenciais admin.

#### Output esperado por cenário
- **8.1**: `npm run test 2>&1 | grep "Test Files" | grep -E "[0-9]+ failed"` retorna 0 matches.
- **8.6**: lista visual de 4 capturas (Playwright screenshots) sem texto "Error" no DOM.

---

### Fase 9 — Done report

Não há teste de software. Critério é cumprir formato:

- [ ] **9.1** Arquivo `.done/2026-05-16-HHMM-simulador-completo.md` existe.
- [ ] **9.2** Conteúdo é pitch de negócio (não técnico) destacando arquitetura, qualidade entregue, gaps honestos (encarnar lead real postergado, mockup iPhone fora de escopo, etc.).
- [ ] **9.3** Inclui menção a coverage final, número de testes adicionados, fases executadas.

---

## Dados de teste necessários (consolidado)

### Fixtures SQL
- `tests/fixtures/simulated-baseline.sql`:
  - 1 admin user (`role=admin`, com session válida para tests autenticados).
  - 1 viewer user (`role=viewer`) — para testar 403.
  - 2 atendentes ativos com phones distintos (`5511888888888`, `5511777777777`).
  - 3 conversas reais (1 active, 1 handed_off, 1 closed) + 3 leads correspondentes.
  - 2 conversas simuladas (1 web sem mensagens, 1 whatsapp em status active) + 1 lead simulado.

### Mocks
- Global `fetch` mockado em `tests/setup.ts` registrando todas as URLs chamadas. Helper `assertNoMetaCalls()` exposto pra todos os testes.
- Spy em `publishToClient`, `publishToAttendant`, `scoreConversation`, `applyTrackedStageToLead`, `transitionLeadStage`.
- Mock de `EventSource` em testes de componente WhatsApp (jsdom não tem).
- Mock de `crypto.randomUUID` quando ordem determinística é necessária (raro).

### Personas + grupos
- Persona "concierge" ativa.
- 1 persona specialist por categoria (`imovel`, `auto`, `servicos`) ativa.
- Grupos suficientes em `consorcio_groups` (ou equivalente) pra orchestrator retornar `recommendation_card`.

### Setup de auth pra E2E
- Helper `loginAsAdmin(page)` no Playwright reaproveitando cookies de `.env.test`.

---

## Pontos de falha conhecidos do domínio

### Vetores de bug históricos
1. **`findUnclaimedConversation` ordering** — antes do `orderBy desc(updatedAt)`, atendentes claimavam conversas estagnadas em vez da fresh. Garantir que a ordenação não regride com filtro `is_simulated=false` adicionado.
2. **HMR + `simulator-bus`** — bus já está em `globalThis` (vide `simulator-bus.ts:21-31`). Extensão para `publishToClient` precisa do mesmo padrão; senão dev save invalida subscribers do simulador cliente.
3. **`splitMessage` quebrando ordem** — `whatsapp/api.ts` envia `sendTextMessage` chunks em série; bus `EventEmitter` é síncrono FIFO. Mas se branch `isSimulated` usar `Promise.all` ou `setTimeout`, ordem pode quebrar. Garantir await sequencial.
4. **`handed_off` com `handedOffUserId=null`** — estado de "pending claim" é legítimo, mas `findUnclaimedConversation` precisa ignorar conversas simuladas se atendente real é quem está claimando E não quiser ver simuladas. Decisão de design: `claimUnclaimed` em painel atendente PODE pegar simulada (vira QA bench). Validar e documentar.
5. **`relayWebUserToAgent` com conversation simulada** — função usa `conversation.handedOffUserId` direto; se atendente real claimou conversa simulada, mandar mensagem dele NÃO deve cair na Meta. Cobertura crítica.
6. **Cascade de DELETE** — `leadEvents`, `leadInsights`, `conversationEvaluations` referenciam `leads`/`conversations`. Confirmar `onDelete: "cascade"` em todas. Senão DELETE sessão deixa lixo.
7. **`is_simulated` herdado** — lead criado em `handoffToAgents` deve herdar. Sem `is_simulated=true` no lead, kanban filtra conversa mas não filtra lead → metric corrompida. **Cobertura crítica** (CA 2.5).
8. **`process.env.NODE_ENV` check** — `/admin/simulator/attendant/page.tsx` original tem; novas rotas precisam do mesmo gate. Auditar.
9. **`requireRole("admin")`** — nas sessões routes; viewer não pode criar/deletar.
10. **Bus listener leak** — trocar sessão no inbox deve `unsubscribe` da anterior. Sem cleanup → memory leak + mensagens duplicadas.
11. **Race claim** — 2 atendentes vendo handoff simulado podem clicar simultaneamente. Lógica atual de `findUnclaimedConversation` + UPDATE `handedOffUserId` é first-write-wins; verificar que mensagem "já foi atendido por X" aparece corretamente pro segundo (CA herdada do behavior atual).
12. **`POST /api/chat` em conversa handed_off** — código atual route.ts:95-126 trata como relay para atendente. Para simulada handed_off, mesmo branch funciona, mas `relayWebUserToAgent` precisa pular Meta.
13. **`/reset` enviado pelo simulador WhatsApp** — apaga conversa do DB. Inbox precisa refletir (ou prompt "criar nova?"). Cobertura recomendada.
14. **`getHandoffState(waId)` com `SIM-...`** — função usa `eq(conversations.waId, waId)`. Para `SIM-abc`, retorna a conversa simulada — comportamento esperado. Mas painel comercial NÃO deve consultar esse caminho — garantir separação.
15. **Backend NÃO confiar em input do client** — payload do `POST /api/chat` ou `POST /sessions/<id>/send` não pode aceitar `is_simulated=true` do client. Backend sempre lê do DB. Cobertura: tentar enviar payload manipulado, garantir que conversa real continua real.
16. **Performance N+1 em `lastMessagePreview`** — `GET /sessions` retorna N sessões; cada uma com preview. Precisa subquery agregada, não N queries. Cobertura: 50 sessões fixture, query count <=3.

### Anti-padrões a vigiar em PR review
- `if (waId.startsWith("SIM"))` sem hífen — colide com qualquer waId começando com "SIM" (improvável mas possível).
- Lógica de bypass espalhada — centralizar em `isSimulatedConversation(conv)` helper.
- Filtro `is_simulated=false` adicionado em query do agent (não pode! agente precisa ver conversa simulada).
- Cookies/headers compartilhados entre admin e public — confirm que admin auth está separado.

---

## Plano de execução do QA crítico

### Ordem de execução (gates rígidos)

```
┌─────────────────────────────────────────────────────────┐
│ Gate 1: Fase 0 verde                                    │
│   → typecheck + migration smoke + migrate-guard rerun   │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Gate 2: Fase 1 verde                                    │
│   → unit dashboard-queries + integration                │
│      filtros endpoints + smoke `/admin/pipeline`        │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Gate 3: Fase 2 verde                                    │
│   → unit isSimulatedWaId + integration handoff branch   │
│      + cobertura 100% nos ifs is_simulated              │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Gate 4: Fase 3 verde                                    │
│   → smoke `/admin/simulator/attendant` (regressão)      │
│      + render snapshot do index                         │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Gate 5: Fase 4 verde                                    │
│   → integration sessions CRUD + concurrency Promise.all │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Gate 6: Fase 5 verde                                    │
│   → component tests sim-web + E2E Playwright happy path │
│      + verificação SQL pós-handoff (is_simulated=true)  │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Gate 7: Fase 6 verde                                    │
│   → component tests sim-whatsapp + E2E Playwright +     │
│      cadência de bolhas + cobertura interactive replies │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Gate 8: Fase 7 verde                                    │
│   → cenário misto real+simulada no painel atendente     │
│      (badge presente em uma, ausente na outra)          │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Gate 9: REGRESSÃO COMPLETA (Fase 8)                     │
│   → npm run test (todos), build, lint, typecheck,       │
│     smoke público + webhook real, performance,          │
│     coverage thresholds, no graph.facebook.com calls    │
└────────────────────┬────────────────────────────────────┘
                     ▼
                 RELEASE OK
```

### Tipos de teste por fase

| Fase | Unit | Integration | Component | E2E Playwright | Manual smoke |
|------|------|-------------|-----------|----------------|--------------|
| 0 | — | migration | — | — | container rerun |
| 1 | ✅ dashboard-queries | ✅ endpoints | — | — | `/admin/pipeline` |
| 2 | ✅ isSimulatedWaId, api.ts | ✅ handoff branch | — | — | — |
| 3 | — | smoke routes | render snapshot | — | painel atendente |
| 4 | — | ✅ CRUD | — | — | curl POST/DELETE |
| 5 | — | smoke `/api/chat` sim | ✅ sim-web | ✅ happy path | full flow |
| 6 | ✅ formatters | smoke send/stream | ✅ sim-whatsapp | ✅ happy path | full flow + reply buttons |
| 7 | — | bus payload sim | ✅ badge render | — | painel atendente misto |
| 8 | regressão | regressão | regressão | regressão | 4-tab smoke |

### Comandos canônicos

```bash
# Por fase:
npm run typecheck                                      # após qualquer fase
npm run lint                                           # após qualquer fase
npm run test -- src/lib/admin/dashboard-queries.test  # Fase 1
npm run test -- src/lib/whatsapp                       # Fase 2 + 6
npm run test -- src/app/api/admin/simulator           # Fase 4

# E2E (após Playwright instalado):
npx playwright test --grep "simulador-web"            # Fase 5
npx playwright test --grep "simulador-whatsapp"       # Fase 6

# Regressão final (Fase 8):
npm run test
npm run test:coverage
npm run build
NODE_ENV=production npm start &
curl -I http://localhost:3000/admin/simulator/web  # esperar 404
```

### Regras do QA crítico (de comportamento)

1. **Rigor adversarial:** assumir que o desenvolvedor passou apenas no happy path. Tentar quebrar com inputs malformados, ordem inversa, race, network drop.
2. **Evidência sempre:** cada falha reportada com (a) query SQL, (b) response HTTP, (c) screenshot, (d) log linha, ou (e) snippet de teste failed.
3. **Sem benefício da dúvida:** "tá funcionando" ≠ "passou". Critério escrito explicitamente; sem critério → não foi testado.
4. **Reabrir se incerto:** se a evidência é ambígua, pedir refazer.
5. **Não negociar:** critério é binário. Não aceitar "vou abrir um ticket pra depois".
6. **Rodar tudo:** suite completa antes de cada gate, mesmo se "só toquei na Fase X" — feature feature pode regredir suite anterior.

### Quando rodar regressão completa do projeto
- Após Fase 2 (branch toca core paths).
- Após Fase 3 (move arquivos amplos).
- Após Fase 8 (gate de release).
- Sempre antes de mergear PR final.

---

## Ambiguidades a resolver com PO (antes da Fase 5/6)

Itens marcados no plano mas com decisão postergada — registro como TODO. **Sem essas decisões, critérios de aceite ficam abertos.**

1. **Atendente sintético "Solo Dev"** vs. usar qualquer atendente real disponível para "Assumir eu mesmo" (Fase 5, EC-5.3). Plano sugere MVP simplificado mas implica buscar primeiro atendente da lista — qual lógica? Primeiro `is_active=true`? Mesmo user logado se ele tem `role=attendant`?
2. **`GET /api/admin/conversations?include_simulated=true`** — sintaxe do param confirmada? `"true"` string ou boolean? Comportamento se ausente vs `false` explícito?
3. **`POST /api/admin/simulator/sessions` autoship**: deve setar `contactName` automaticamente (ex: nome do admin que criou) ou deixar `null` até primeira interação? Plano não fala.
4. **`metadata.createdBySimUserId`** persistido na conversation: pode ser usado pra autorização ("só dono pode deletar") ou apenas display? Decisão: por enquanto display (inbox compartilhada).
5. **`/reset` no simulador WhatsApp** — apaga conversa atual. Após apagar, frontend cria nova automaticamente ou mostra "Sessão apagada"?
6. **Coverage threshold** — confirmar 80% como gate ou aceitar 70%? Pipeline atual está em quanto?
7. **Playwright** — não está em `devDependencies` ainda. Decisão de instalar agora ou pular E2E pra fase posterior? Sem Playwright, CA 5.21, 6.18 ficam "manual".
8. **Endpoint `/api/admin/conversations/[id]/eval`** — deve ganhar filtro `is_simulated=false` ou aceitar simuladas (afinal eval opt-in pode rodar manualmente)? Plano fala "Filtro de eval dashboard" → presumir que listagem omite, mas POST manual a `/eval` aceita simuladas.
9. **`sendToAttendant` overload** — assinatura `sendToAttendant(phone, text, { simulated })`. Confirmar se `simulated` é prop do caller ou inferida de `conversation.isSimulated` antes da chamada.
10. **Sessions API: ownership** — todo admin pode deletar sessão de outro admin (inbox compartilhada) ou só o criador? Decisão default: todos podem (alinhado com "compartilhada"), mas registrar.

---

## Checklist de aprovação do plano

Para o desenvolvedor (TDD) começar:
- [ ] PO Lead revisou e marcou como `PUBLISHED`.
- [ ] Kairo aprovou (gate humano).
- [ ] Ambiguidades acima resolvidas ou explicitamente postergadas.
- [ ] Fixtures definidas em código (`tests/fixtures/`).
- [ ] Mock global de `fetch` em `tests/setup.ts` configurado.

Para o QA crítico começar:
- [ ] Implementação completa (todas as fases do plano executadas pelo dev).
- [ ] Dev marcou cada CA como "alegado verde" (não significa que está verde — significa que dev acha que está).
- [ ] QA tem acesso a banco local fresh, fixtures, e este documento.

---

*Documento autoritativo. Critério não listado aqui = critério não validado.*

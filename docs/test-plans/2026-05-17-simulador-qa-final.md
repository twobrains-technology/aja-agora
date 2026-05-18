# Plano de Teste — Simulador Admin (QA Final E2E)

**Data:** 2026-05-17
**Autor:** PO Lead (Opus 4.7)
**Escopo:** **Apenas** o Simulador Admin em `/admin/simulator` e sub-rotas. NÃO cobre features do produto (landing, persona, comparador, etc.).
**Antecessores:**
- `.done/2026-05-17-0033-simulador-cliente-web-whatsapp.md` (done report da feature)
- `docs/test-plans/simulador-completo.md` (plano v1, 120 CAs — abrangente, 53 BLOCKED)
- `docs/test-plans/simulador-completo-qa-report.md` (QA report v1 — 6 críticos abertos no DRAFT, hoje todos corrigidos no `develop`)
- `docs/test-plans/2026-05-17-consolidated-v2.md` (F-02 = "Simulador smoke E2E")
**Tempo esperado de execução:** ~20 min via Playwright + DB queries
**Modo de execução:** servidor local (`npm run dev` / `docker compose up`) + browser real
**Branch base:** `develop` (último commit `65acc1e`)

---

## 1. Propósito do Simulador

O simulador admin é uma **ferramenta interna de dev/QA** que permite ao time "**encarnar um cliente**" (Web ou WhatsApp) ou "**encarnar um atendente humano**" dentro do próprio painel admin — testando o agente IA ponta a ponta sem precisar de celular real, sem deixar lead falso no kanban, sem disparar mensagem real pelo Meta API.

**Quem usa:** PO Lead, devs em TDD de prompt/tool/persona, QA, time fazendo demo pra stakeholder.

**Por que importa:**
- Reduz o ciclo de validação de prompt/persona de "abrir celular, conversar em zap, esperar" pra "abrir painel, digitar, ver" (~10x mais rápido).
- Reprodução de bug específico (que era praticamente impossível) vira "1 clique de retomar".
- Demo controlável: rodar fluxo completo num ambiente "produto" sem medo de criar lead no kanban ou disparar zap pra equipe.
- **Painel comercial intocado:** flag `is_simulated=true` em `conversations` + `leads` garante que kanban, dashboard de eval e funnel só veem dado real.

**Garantia central que estamos validando:** "qualquer simulação que rolar nesse painel é INVISÍVEL pros painéis comerciais E pro Meta API". Se essa invariante quebrar, a feature perde valor.

---

## 2. Inventário de Superfícies

### Páginas (Next.js App Router, todas dev-only — 404 em production)

| Path | Arquivo | Função |
|---|---|---|
| `/admin/simulator` | `src/app/admin/(dashboard)/simulator/page.tsx` | Hub com 3 cards de modo |
| `/admin/simulator/web` | `src/app/admin/(dashboard)/simulator/web/page.tsx` | Cliente Web (reusa `ChatProvider` + `MessageList` + `ChatInput` do site) |
| `/admin/simulator/whatsapp` | `src/app/admin/(dashboard)/simulator/whatsapp/page.tsx` | Cliente WhatsApp (UI fake-zap, mesmo `processTextMessage` que webhook real) |
| `/admin/simulator/attendant` | `src/app/admin/(dashboard)/simulator/attendant/page.tsx` | Atendente (encarna vendedor recebendo handoff) |

### Componentes principais

| Componente | Caminho | Função |
|---|---|---|
| `SimulatorWeb` | `src/components/admin/simulator/web/simulator-web.tsx` | Layout 2-col (inbox + chat) usando `ChatProvider` |
| `SimulatorWhatsapp` | `src/components/admin/simulator/whatsapp/simulator-whatsapp.tsx` | Layout 2-col (inbox + WhatsAppStage) |
| `WhatsAppStage` | `src/components/admin/simulator/whatsapp/whatsapp-stage.tsx` | Render fiel WhatsApp (bolhas, typing, interactive) + SSE wire |
| `SimulatorInbox` | `src/components/admin/simulator/inbox.tsx` | Lista compartilhada de sessões, toggle "Todas/Minhas", deletar |
| `SimulatedBadge` | `src/components/admin/simulator/simulated-badge.tsx` | Header "SIMULAÇÃO — criada por X" |
| `HandoffBanner` | `src/components/admin/simulator/handoff-banner.tsx` | Banner amarelo + botão "Assumir eu mesmo" (Sheet lateral) |
| `SimulatorChat` (atendente) | `src/components/admin/simulator/attendant/simulator-chat.tsx` | Chat embebido do atendente |

### API Routes envolvidas (`src/app/api/admin/simulator/`)

| Endpoint | Arquivo | Método | Função |
|---|---|---|---|
| `/api/admin/simulator/sessions` | `sessions/route.ts` | `POST` | Cria conversation `is_simulated=true` (channel web ou whatsapp, gera waId `SIM-<uuid>` pra whatsapp) |
| `/api/admin/simulator/sessions` | `sessions/route.ts` | `GET` | Lista sessões simuladas (filtros `channel`, `mine`) com `lastMessagePreview` |
| `/api/admin/simulator/sessions/:id` | `sessions/[id]/route.ts` | `GET` | Retorna `{conversation, handoffState, messages}` |
| `/api/admin/simulator/sessions/:id` | `sessions/[id]/route.ts` | `DELETE` | Apaga sessão simulada (cascade) |
| `/api/admin/simulator/whatsapp/:id/stream` | `whatsapp/[conversationId]/stream/route.ts` | `GET` (SSE) | Stream de eventos do agente pro cliente whatsapp (text/typing/interactive) |
| `/api/admin/simulator/whatsapp/:id/send` | `whatsapp/[conversationId]/send/route.ts` | `POST` | Encaminha msg do user simulado pro `processTextMessage`/`processInteractiveReply` |
| `/api/admin/simulator/attendant/:attendantId/stream` | `attendant/[attendantId]/stream/route.ts` | `GET` (SSE) | Stream pro atendente simulado |
| `/api/admin/simulator/attendant/:attendantId/reply` | `attendant/[attendantId]/reply/route.ts` | `POST` | Resposta do atendente pro cliente |

### Rotas indiretas que o simulador exercita (mas não são "do simulador")
- `/api/chat` (chat web): consumido pelo `ChatProvider` no simulador web
- `/api/chat/stream` (chat web SSE): handoff streaming
- `/api/leads`: lead-form artifact submit
- Webhook `processTextMessage`/`processInteractiveReply` (`src/lib/whatsapp/processor.ts`): chamados pelo `/send`

### Auth
- Better Auth, login em `/admin/login`
- Credenciais em `.env.local`: `ADMIN_EMAIL` / `ADMIN_PASSWORD` (definidos pelo dev localmente — ver `.env.example`)
- Guard em todas as rotas: `requireRole("admin")` + `NODE_ENV==="production" → 404`

---

## 3. Cenários Críticos (Smoke + Golden Path)

**Total: 15 cenários** — 9 P0 (blocker), 4 P1 (importante), 2 P2 (nice).

> **Convenção:** cada cenário tem ID único `SIM-XX`, severidade, GIVEN/WHEN/THEN binário, e instruções específicas de **como provar pass/fail** (não "veja se aparece" — diga onde clicar, qual selector, qual query SQL, qual `network request`).
>
> **Dependências comuns implícitas:** servidor rodando em `http://localhost:3010` (ou whatever `APP_HOST_PORT`), Postgres acessível com migrations `0001..0012` aplicadas, `ANTHROPIC_API_KEY` válido no `.env.local`.

---

### SIM-01 — Auth admin: login funciona e leva a /admin

**Severidade:** P0 (blocker) — sem auth, nada do simulador roda.
**Dependências:** `.env.local` com `ADMIN_EMAIL`/`ADMIN_PASSWORD` carregados; tabela `user` populada com o admin (criada via seed/Better Auth no boot).

- **GIVEN** servidor em `http://localhost:<APP_HOST_PORT>` rodando e `/admin/login` acessível
- **WHEN** Playwright navega pra `/admin/login`, preenche email `${ADMIN_EMAIL}` e senha `${ADMIN_PASSWORD}` (do `.env.local`), clica em "Entrar"
- **THEN** URL final é `/admin` (ou `/admin/*`); cookie de sessão Better Auth está setado; **não** vê tela "Acesso negado" nem 401

**Como validar:**
- `await page.goto("/admin/login")`
- `await page.fill('[name="email"], input[type="email"]', process.env.ADMIN_EMAIL!)`
- `await page.fill('input[type="password"]', process.env.ADMIN_PASSWORD!)`
- `await page.click('button[type="submit"]')`
- `await page.waitForURL(/\/admin/, { timeout: 5000 })`
- Verificar que `page.url()` começa com `/admin` e NÃO contém `/login`

**Evidência exigida:** screenshot `01-admin-logged.png` mostrando `/admin` autenticado.

---

### SIM-02 — Hub /admin/simulator renderiza 3 cards corretos

**Severidade:** P0 (blocker) — entrada da feature.
**Dependências:** SIM-01.

- **GIVEN** admin autenticado
- **WHEN** navega pra `/admin/simulator`
- **THEN** vê **exatamente 3 cards** com títulos: "Cliente no WhatsApp", "Cliente no Site", "Atendente Humano"
- **AND** cada card é um `<a href="/admin/simulator/whatsapp">`, `<a href="/admin/simulator/web">`, `<a href="/admin/simulator/attendant">` respectivamente
- **AND** o título da página (h1) é "Simulador"

**Como validar:**
- `await page.goto("/admin/simulator")`
- `await expect(page.getByRole("heading", { name: "Simulador", level: 1 })).toBeVisible()`
- `await expect(page.getByText("Cliente no WhatsApp")).toBeVisible()`
- `await expect(page.getByText("Cliente no Site")).toBeVisible()`
- `await expect(page.getByText("Atendente Humano")).toBeVisible()`
- Verificar `href` dos 3 links: `page.locator('a[href="/admin/simulator/whatsapp"]')`, etc.

**Evidência exigida:** screenshot `02-hub.png`.

---

### SIM-03 — Cliente Web: criar sessão dispara POST /sessions e mostra inbox + chat vazio

**Severidade:** P0 (blocker).
**Dependências:** SIM-02. DB acessível.

- **GIVEN** admin em `/admin/simulator/web`
- **WHEN** Playwright clica no botão "Nova conversa"
- **THEN** request `POST /api/admin/simulator/sessions` é disparado com body `{"channel":"web"}`; response 201 com `{conversationId, channel:"web", waId:null}`
- **AND** a sessão aparece na lista da inbox e fica selecionada (visual highlight)
- **AND** o painel direito mostra `ChatInput` (input com placeholder do chat) e o badge "SIMULAÇÃO"

**Como validar:**
- `const responsePromise = page.waitForResponse(r => r.url().includes("/api/admin/simulator/sessions") && r.request().method() === "POST")`
- `await page.click('button:has-text("Nova conversa")')`
- `const response = await responsePromise`
- `expect(response.status()).toBe(201)`
- `const body = await response.json()` → `expect(body.channel).toBe("web")` e `expect(body.waId).toBeNull()`
- `await expect(page.getByText("SIMULAÇÃO")).toBeVisible()`
- `await expect(page.getByPlaceholder(/digite|escreva|mensagem/i)).toBeVisible()` (placeholder genérico do `ChatInput`)

**Evidência exigida:** screenshot `03-web-new-session.png` + log da response 201.

---

### SIM-04 — Cliente Web: enviar "oi" recebe resposta streamed do agente

**Severidade:** P0 (blocker) — golden path.
**Dependências:** SIM-03; `ANTHROPIC_API_KEY` válido. Pode levar até 10s (LLM).

- **GIVEN** sessão web simulada criada e selecionada
- **WHEN** digita "oi" no input e pressiona Enter (ou clica em enviar)
- **THEN** DOM passa a exibir bolha do user com texto "oi"
- **AND** em até **10s**, surge ao menos UMA mensagem do `role="assistant"` com texto não-vazio (resposta do agente)
- **AND** `network` registra `POST /api/chat` (não `graph.facebook.com`)
- **AND** em hipótese alguma há requisição pra `graph.facebook.com` durante essa interação

**Como validar:**
- Coletar todas as network requests via `page.on("request", ...)` durante o cenário
- `await page.locator("textarea, input[type='text']").fill("oi")`
- `await page.keyboard.press("Enter")`
- `await expect(page.getByText("oi").first()).toBeVisible({ timeout: 2000 })` (mensagem do user)
- `await page.waitForFunction(() => document.querySelectorAll('[data-role="assistant"], .message-assistant, [class*="assistant"]').length > 0, { timeout: 10_000 })` — adapter ao selector real do `MessageList`
- Ao fim, assert `requests.filter(r => r.url.includes("graph.facebook.com")).length === 0`

**Evidência exigida:** screenshot `04-web-agent-reply.png` + lista de URLs de todas requests feitas no cenário.

---

### SIM-05 — Cliente Web: artifact (welcome categories) clicável aparece e responde a click

**Severidade:** P0 (blocker) — valida que `ChatProvider` real está plugado.
**Dependências:** SIM-04 (mesma sessão).

- **GIVEN** sessão web ativa, agente acabou de mandar primeira resposta
- **WHEN** o agente entrega um artifact (esperado: `welcome_categories` com 4 botões — Imóvel/Carro/Moto/Eletrodomésticos)
- **THEN** DOM contém ao menos 3 botões clicáveis dentro de uma `card` ou similar; nenhum desabilitado
- **AND** clicar em "Imóvel" (ou primeiro card) faz aparecer nova mensagem do user no chat e nova resposta do agente em até 10s

**Como validar:**
- `await page.waitForSelector('button:has-text("Imóvel"), button:has-text("Carro"), button:has-text("Moto")', { timeout: 8000 })`
- Contar botões de categoria: `await page.locator('button:has-text("Imóvel"), button:has-text("Carro"), button:has-text("Moto"), button:has-text("Eletrodom")').count()` ≥ 3
- `await page.click('button:has-text("Imóvel")')`
- Aguardar nova mensagem assistant: snapshot do count antes/depois

**Evidência exigida:** screenshot `05-web-artifact.png` mostrando os botões + screenshot `05b-web-after-click.png` mostrando a resposta.

**Nota:** se o welcome NÃO veio no primeiro turno do agente (variabilidade de prompt), aceitar como pass se QUALQUER artifact clicável apareceu nos 3 primeiros turnos. O cenário não é sobre o conteúdo específico — é sobre o ciclo "agente envia interactive → user clica → fluxo continua".

---

### SIM-06 — Cliente WhatsApp: criar sessão gera waId SIM-<uuid> e abre stage com SSE conectado

**Severidade:** P0 (blocker).
**Dependências:** SIM-02.

- **GIVEN** admin em `/admin/simulator/whatsapp`
- **WHEN** clica "Nova conversa"
- **THEN** request `POST /api/admin/simulator/sessions` com `{"channel":"whatsapp"}`; response 201 contém `waId` que **inicia com `SIM-`** seguido de UUID v4 (`/^SIM-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`)
- **AND** o stage do WhatsApp renderiza (header verde, input rounded, área de bolhas)
- **AND** EventSource conecta em `/api/admin/simulator/whatsapp/:id/stream` e recebe `{"type":"connected"}` em até 2s (verificar via network panel, response = `text/event-stream`)

**Como validar:**
- Mesmo padrão de SIM-03 pra capturar response
- Regex no `body.waId`: `expect(body.waId).toMatch(/^SIM-[0-9a-f-]{36}$/)`
- `await expect(page.locator('[class*="bg-[#"]:has-text("@")), header[class*="whatsapp"], div:has-text("online"), div:has-text("digitando")').first()).toBeVisible()` — qualquer pista de UI WhatsApp
- Pra SSE: `page.waitForResponse(r => r.url().includes("/stream") && r.headers()["content-type"]?.includes("event-stream"))`

**Evidência exigida:** screenshot `06-whatsapp-stage.png` + body da response do POST sessions.

---

### SIM-07 — Cliente WhatsApp: enviar "oi" via /send, recebe resposta via SSE, ZERO fetch a graph.facebook.com

**Severidade:** P0 (blocker) — CORE da feature. Invariante "nunca vaza pro Meta".
**Dependências:** SIM-06.

- **GIVEN** sessão whatsapp simulada criada
- **WHEN** digita "oi" no input do WhatsApp stage e envia
- **THEN** request `POST /api/admin/simulator/whatsapp/<id>/send` com `{"kind":"text","text":"oi"}`; response 204
- **AND** em até 10s, ao menos uma bolha "received" (branca, agente) aparece no stage com texto não-vazio
- **AND** em **NENHUM** momento desse cenário há request HTTP pra `graph.facebook.com` (verificar via `page.on("request")` global da sessão de teste)

**Como validar:**
- Stub network: instalar `page.on("request", req => { if (req.url().includes("graph.facebook.com")) leakedUrls.push(req.url()); })`
- Fluxo igual a SIM-04 mas no input do whatsapp stage
- Ao fim do cenário, `expect(leakedUrls).toEqual([])` — **se vazar, falha hard**.
- Verificar bolhas: `await page.waitForSelector('[class*="bg-white"], div:not(.text-right):has-text(/.+/)')` — qualquer indicador de mensagem recebida

**Evidência exigida:** screenshot `07-whatsapp-reply.png` + log "leakedUrls=[]" + lista de todas as URLs requested.

**Esse é o cenário que justifica TODA a feature. Falhar aqui = BLOCKER absoluto.**

---

### SIM-08 — Cliente WhatsApp: trocar de sessão fecha SSE da antiga (sem listener leak)

**Severidade:** P0 (blocker — bug histórico CA 6.21).
**Dependências:** SIM-06.

- **GIVEN** sessão whatsapp A criada e selecionada (SSE A conectado)
- **WHEN** cria uma sessão B nova e clica nela na inbox
- **THEN** o EventSource da sessão A é fechado (DevTools network mostra connection canceled / closed)
- **AND** o EventSource da sessão B é aberto
- **AND** mandar uma mensagem na sessão B NÃO aparece também na sessão A (se voltar pra ela depois)

**Como validar:**
- Capturar `requestId` do SSE de A via `page.on("response")`
- Após trocar pra B, navegar de volta pra A — não deve duplicar mensagens
- Alternativa server-side: log do `simulator-bus` mostra "unsubscribe" quando troca de sessão (vide `console.log` em `simulator-bus.ts:84-87`/`:124-127`). QA pode tailar stdout do servidor.

**Evidência exigida:** screenshot `08-switch-session.png` + entrada no log `[simulator-bus] unsubscribe client waId=SIM-...` correspondendo à sessão A.

**Por que P0:** versão anterior tinha listener leak garantido (CA 6.21 FAIL crítico). Hoje corrigido com `req.signal.addEventListener("abort", ...)` em `whatsapp/[conversationId]/stream/route.ts:64-72`. Re-validar.

---

### SIM-09 — Isolamento: conversa simulada NÃO aparece em /admin/pipeline nem /admin/leads

**Severidade:** P0 (blocker — invariante regulatória/comercial).
**Dependências:** SIM-04 (sessão web com pelo menos 1 mensagem).

- **GIVEN** sessão simulada criada com conversationId X (capturar via SIM-03/SIM-04)
- **WHEN** Playwright navega pra `/admin/pipeline` (ou `/admin/leads` se for o path do kanban) e `/admin/dashboard`
- **THEN** o ID X **não aparece** em nenhum lugar do DOM dessas páginas
- **AND** query DB direta: `SELECT id, is_simulated FROM conversations WHERE id = '<X>'` retorna `is_simulated=true`
- **AND** se houve lead criado nessa conversa: `SELECT id, is_simulated FROM leads WHERE conversation_id = '<X>'` retorna `is_simulated=true`

**Como validar:**
- `await page.goto("/admin/pipeline")` — `await expect(page.locator(`text=${conversationId}`)).toHaveCount(0)`
- `await page.goto("/admin/dashboard")` — `await expect(page.locator(`text=${conversationId}`)).toHaveCount(0)`
- Query SQL via `psql` ou via endpoint debug se existir — preferir SQL: `docker exec aja-pg-<workspace> psql -U postgres -d aja_agora -c "SELECT is_simulated FROM conversations WHERE id = '<X>';"`

**Evidência exigida:** output do `psql` mostrando `is_simulated | t` + screenshot do `/admin/pipeline` (mesmo que vazio).

---

### SIM-10 — Persistência: F5 (reload) mantém a sessão selecionada com mensagens

**Severidade:** P1 (importante — UX da feature).
**Dependências:** SIM-04 (sessão web com 1+ mensagens) ou SIM-07 (whatsapp).

- **GIVEN** sessão simulada com ≥2 mensagens no chat
- **WHEN** Playwright faz `page.reload()`
- **THEN** ao recarregar `/admin/simulator/web` (ou `/whatsapp`), a inbox lista a sessão; a sessão pode ou não estar pré-selecionada (depende da implementação atual — verificar comportamento)
- **AND** ao clicar na sessão na inbox, as mensagens anteriores são hidratadas (não vazio)
- **AND** `GET /api/admin/simulator/sessions/<id>` retorna `messages: [...]` com ao menos as mensagens prévias

**Como validar:**
- Reload via `page.reload()`
- Clicar na sessão (se não pré-selecionada): `page.locator(`text=${sessionPreview}`).first().click()`
- `await expect(page.getByText(/oi/i).first()).toBeVisible({ timeout: 5000 })`
- Direta na API: `const res = await page.request.get('/api/admin/simulator/sessions/' + id)`; `expect((await res.json()).messages.length).toBeGreaterThan(0)`

**Evidência exigida:** screenshot `10-after-reload.png` + dump da response do GET sessions/:id.

**Nota:** se a feature NÃO persiste a seleção (selectedId começa vazio após reload), aceitar como pass se as mensagens hidratam ao clicar manualmente. Não pedir nuqs nesse plano — gap conhecido (CA 5.14).

---

### SIM-11 — Limpeza: deletar sessão simulada retira da inbox e cascade nas messages/leads

**Severidade:** P1 (importante — higiene do dev tool).
**Dependências:** SIM-03 (sessão criada).

- **GIVEN** sessão simulada existente; conversationId X capturado
- **WHEN** Playwright hover na linha da sessão na inbox, clica no ícone de lixeira (`Trash2Icon`), confirma o `window.confirm`
- **THEN** request `DELETE /api/admin/simulator/sessions/<X>` retorna 204
- **AND** a sessão some da inbox (DOM)
- **AND** query DB: `SELECT COUNT(*) FROM conversations WHERE id = '<X>'` retorna 0
- **AND** query DB: `SELECT COUNT(*) FROM messages WHERE conversation_id = '<X>'` retorna 0 (cascade)

**Como validar:**
- `page.on("dialog", dialog => dialog.accept())` antes do click pra autoconfirmar o `window.confirm`
- Hover é necessário pq o botão tem `opacity-0 group-hover:opacity-100`: `await page.locator("li").filter({ hasText: sessionLabel }).hover()`
- Click no botão (aria-label="Apagar"): `await page.locator('button[aria-label="Apagar"]').first().click()`
- `psql` ou `db.query` pra confirmar cascade

**Evidência exigida:** output `SELECT COUNT(*)` retornando 0 antes/depois.

---

### SIM-12 — Inbox: toggle "Todas / Minhas" filtra por createdBySimUserId

**Severidade:** P1 (importante — bug histórico CA 5.13).
**Dependências:** SIM-03 + um segundo admin no DB (ou skip se só houver 1).

- **GIVEN** existem ≥2 sessões simuladas no DB: uma criada pelo admin corrente, outra com `metadata.createdBySimUserId` diferente (pode ser inserida via SQL pra setup)
- **WHEN** Playwright clica em "Minhas" no toggle da inbox
- **THEN** request `GET /api/admin/simulator/sessions?channel=web&mine=true`
- **AND** apenas a sessão criada pelo admin corrente fica visível
- **AND** ao clicar "Todas", ambas voltam a aparecer

**Como validar:**
- Setup via SQL antes do teste:
  ```sql
  INSERT INTO conversations (id, channel, wa_id, is_simulated, metadata, status)
  VALUES (gen_random_uuid(), 'web', NULL, true, '{"createdBySimUserId":"fake-user-id"}'::jsonb, 'active');
  ```
- Contar items antes do toggle, clicar "Minhas", contar de novo
- `await page.click('button:has-text("Minhas")')`
- Verificar via fetch direto: `page.request.get('/api/admin/simulator/sessions?channel=web&mine=true')` retorna apenas as do user atual

**Evidência exigida:** screenshot `12-mine-toggle.png` com contagem diferente das 2 abas.

**Por que P1 e não P0:** menos crítico do que isolamento (SIM-09), mas era FAIL crítico no QA report v1. Re-validar que foi corrigido.

---

### SIM-13 — Atendente: receber handoff de sessão simulada com badge 🧪 SIMULAÇÃO

**Severidade:** P1 (importante).
**Dependências:** SIM-04 + capacity de chegar até handoff no fluxo do agente (pode levar 30-60s de conversa OU usar atalho se houver tool admin pra forçar handoff).

- **GIVEN** sessão simulada (web ou whatsapp) ativa e usuário levou conversa até pedir handoff (ex: enviou "fechado" ou completou lead form)
- **WHEN** abre `/admin/simulator/attendant` em segunda aba
- **THEN** a conversa simulada aparece na lista do atendente
- **AND** ao clicar nela, vê o histórico com badge "🧪 SIMULAÇÃO" em CADA mensagem recebida do "user simulado"
- **AND** mensagens reais (de outras conversas, se houver) NÃO têm o badge
- **AND** ao responder, a resposta aparece no chat do user simulado (SIM-04 ou SIM-07) em até 5s
- **AND** ZERO fetch a `graph.facebook.com` nesse cenário

**Como validar:**
- Usar `page.context()` pra abrir segunda aba
- Verificar badge: `await expect(page.locator('text=/🧪.*SIMULA/i')).toHaveCount.greaterThan(0)`
- Resposta do atendente → aparece no chat user em segunda aba do simulator web/whatsapp
- Capturar todas as requests da sessão, assert sem graph.facebook.com

**Evidência exigida:** screenshot `13-attendant-badge.png` + screenshot `13b-user-receives-reply.png`.

**Nota de variabilidade:** se chegar até handoff via chat for difícil (LLM-dependent), QA pode forçar via SQL: `UPDATE conversations SET status='handed_off', handed_off_at=NOW() WHERE id='<X>';` e mandar mensagem do user pra disparar relay. O cenário valida o RELAY simulado, não o ato de entrar em handoff.

---

### SIM-14 — Build production: rota /admin/simulator/* retorna 404

**Severidade:** P1 (importante — gate de segurança).
**Dependências:** ability to run `NODE_ENV=production npm run build` and serve.

- **GIVEN** server rodando com `NODE_ENV=production`
- **WHEN** Playwright (ou curl) acessa `/admin/simulator`, `/admin/simulator/web`, `/admin/simulator/whatsapp`, `/admin/simulator/attendant`
- **THEN** todas retornam status 404 (`notFound()` chamado na page)
- **AND** APIs `/api/admin/simulator/sessions` (POST e GET) também retornam 404

**Como validar:**
- Opcional dado tempo: pode ser skip se inviável no smoke (~20min) — registrar como TODO
- Se rodar: `NODE_ENV=production npm run build && NODE_ENV=production PORT=3011 npm start &`
- `curl -i http://localhost:3011/admin/simulator` → primeira linha `HTTP/1.1 404 Not Found`
- `curl -X POST http://localhost:3011/api/admin/simulator/sessions -H "Content-Type: application/json" -d '{"channel":"web"}'` → 404

**Evidência exigida:** output do `curl -i` com status 404.

**Skip OK se:** o setup do production build for inviável no tempo disponível. Marcar como BLOCKED nesse caso.

---

### SIM-15 — Auth: não autenticado em /admin/simulator é redirecionado pra /admin/login

**Severidade:** P2 (nice — gate de segurança secundário).
**Dependências:** browser limpo sem cookie.

- **GIVEN** browser sem cookie de sessão (novo `page.context()`)
- **WHEN** Playwright tenta `page.goto("/admin/simulator")`
- **THEN** URL final é `/admin/login` ou `/login` (depende do middleware)
- **AND** o conteúdo do hub (3 cards) NÃO é renderizado
- **AND** `POST /api/admin/simulator/sessions` sem cookie retorna 401 ou 403

**Como validar:**
- `const context = await browser.newContext()` (sem auth)
- `const page = await context.newPage(); await page.goto("/admin/simulator")`
- `await expect(page.url()).toMatch(/login/)`
- `const res = await page.request.post("/api/admin/simulator/sessions", { data: { channel: "web" } }); expect([401, 403]).toContain(res.status())`

**Evidência exigida:** screenshot mostrando login page + status code da request.

---

## 4. Anti-Regressão

Cenários derivados de bugs específicos encontrados em rounds anteriores do simulador. **Cada um vinculado a um FAIL crítico do QA report v1.**

### REG-01 — `/api/leads` herda is_simulated (era CA 5.9 FAIL CRÍTICO no v1)

- **GIVEN** sessão simulada web; user chegou até o `lead_form` artifact e submeteu nome/telefone/email
- **WHEN** submit chama `POST /api/leads` com `conversationId` da sessão simulada
- **THEN** query DB: `SELECT is_simulated FROM leads WHERE conversation_id = '<X>'` retorna `t` (true)
- **AND** o lead NÃO aparece em `/admin/pipeline` nem em `/admin/leads`
- **AND** dashboard de KPIs (`/admin/dashboard`) não incrementa contador de "leads gerados" por essa criação

**Por que é regressão:** versão pré-merge do feature criava lead com `is_simulated=false` por default, contaminando kanban. Fix em `/api/leads/route.ts` faz herança da conv. Re-validar que o fix permanece.

**Severidade:** P0 (blocker se quebrar).

---

### REG-02 — `simulator-bus` SSE WhatsApp não vaza listener ao trocar sessão (era CA 6.21 FAIL CRÍTICO no v1)

Já coberto por **SIM-08** acima. Listar aqui pra reforçar.

---

### REG-03 — `GET /sessions` resolve TODOS os autores (não só o primeiro — bug fora do plano v1)

- **GIVEN** ≥2 sessões simuladas no DB, criadas por usuários distintos (`metadata.createdBySimUserId` diferentes)
- **WHEN** `GET /api/admin/simulator/sessions?channel=web`
- **THEN** cada item tem `createdBy.name` correto (não-null pra usuários que existem na tabela `user`)

**Por que é regressão:** versão pré-merge tinha `eq(userTable.id, userIds[0])` no lookup — só o primeiro autor resolvia. Fix usa `inArray(userTable.id, userIds)`. Re-validar.

**Como validar:** setup via SQL similar a SIM-12; chamar API; inspecionar JSON.

**Severidade:** P1.

---

### REG-04 — Mensagem do atendente claimado aparece no chat user simulado (era CA 7.x)

Já coberto pela parte "AND ao responder, a resposta aparece no chat do user simulado" do **SIM-13**. Listar aqui pra reforçar — é a invariante de roundtrip end-to-end via `simulator-bus`.

**Severidade:** P1.

---

### REG-05 — Eval scoring NÃO dispara em conversa simulada (custo Claude zero, era CA 2.9)

- **GIVEN** sessão simulada que entrou em handoff (status=handed_off)
- **WHEN** verifica logs do servidor durante o handoff
- **THEN** log NÃO contém entrada `[eval-trigger] scoring conversation...` pra essa conversa
- **AND** query DB: `SELECT COUNT(*) FROM evaluations WHERE conversation_id = '<X>'` retorna 0 (assumindo schema atual; ajustar nome da tabela se diferente)

**Por que é regressão:** se eval disparar em simulada, gasta token Claude à toa e contamina dashboard de eval.

**Como validar:** durante SIM-13, tail logs do servidor (`docker logs aja-app-<workspace> -f` ou stdout do `npm run dev`); grep `scoring|eval`.

**Severidade:** P1.

---

## 5. Gates pro QA Crítico Sonnet (Pass/Fail)

**Lista binária. Sem ambiguidade. PARTIAL = FAIL.**

Pra liberar como "VERDE" (merge-ready / claim-de-feature-completa), TODOS os gates abaixo devem ser PASS com evidência. Qualquer FAIL ou BLOCKED bloqueia o GO.

### Gates P0 — TODOS obrigatórios (9 + 1 regressão crítica = 10 gates)

- [ ] **G-01:** SIM-01 PASS — login admin funciona com `${ADMIN_EMAIL}`/`${ADMIN_PASSWORD}` do `.env.local` e leva a `/admin`
- [ ] **G-02:** SIM-02 PASS — hub `/admin/simulator` renderiza 3 cards com hrefs corretos
- [ ] **G-03:** SIM-03 PASS — `POST /sessions` `{channel:"web"}` retorna 201 com `waId=null`; UI atualiza
- [ ] **G-04:** SIM-04 PASS — chat web responde "oi" em ≤10s com mensagem assistant; zero fetch a graph.facebook.com
- [ ] **G-05:** SIM-05 PASS — artifact clicável aparece e click dispara fluxo
- [ ] **G-06:** SIM-06 PASS — POST `/sessions` `{channel:"whatsapp"}` retorna 201 com `waId` matching `/^SIM-[uuid-v4]$/`; SSE conecta
- [ ] **G-07:** SIM-07 PASS — WhatsApp envia/recebe via /send e SSE; **ZERO fetch a graph.facebook.com** em todo o cenário
- [ ] **G-08:** SIM-08 PASS — troca de sessão fecha SSE antigo (log de `unsubscribe` ou conexão canceled no DevTools)
- [ ] **G-09:** SIM-09 PASS — conversa simulada NÃO aparece em `/admin/pipeline` nem `/admin/dashboard`; SQL confirma `is_simulated=true`
- [ ] **G-10:** REG-01 PASS — lead criado via `/api/leads` em fluxo web simulado tem `is_simulated=true` no DB

### Gates P1 — obrigatórios mas tolerância de PARTIAL com justificativa

- [ ] **G-11:** SIM-10 PASS — F5 mantém sessão acessível com mensagens (PARTIAL aceitável se reload começa sem pré-seleção, desde que clicar hidrate)
- [ ] **G-12:** SIM-11 PASS — DELETE remove sessão da inbox + cascade no DB
- [ ] **G-13:** SIM-12 PASS — toggle "Minhas/Todas" filtra corretamente (PARTIAL se houver só 1 admin no DB; setup via SQL deve ser tentado)
- [ ] **G-14:** SIM-13 PASS — atendente vê badge 🧪 + relay funciona (PARTIAL se chegar até handoff for inviável; usar SQL pra forçar status=handed_off então)
- [ ] **G-15:** REG-03 PASS — `createdBy.name` resolve todos os autores no GET /sessions
- [ ] **G-16:** REG-05 PASS — eval não dispara em conversa simulada

### Gates P2 — não-blocker, mas tem que reportar

- [ ] **G-17:** SIM-14 PASS ou BLOCKED — production build retorna 404 (BLOCKED aceitável se inviável no tempo, marcar como TODO)
- [ ] **G-18:** SIM-15 PASS — não autenticado é bloqueado/redirecionado

### Gates globais (não-cenário)

- [ ] **GG-01:** `npm run test` exit 0 (não introduzir regressão na suite de 408+ testes)
- [ ] **GG-02:** `npx tsc --noEmit` exit 0
- [ ] **GG-03:** Não foi necessário modificar código de produção pra fazer o smoke passar (testes só leem; mudanças = bug que precisa fix separado em commit `test+fix:`)
- [ ] **GG-04:** Toda evidência salva em `docs/test-plans/2026-05-17-simulador-qa-final-report.md` com screenshots referenciados em paths absolutos do projeto

### Critério final de GO

**Todos os 10 gates P0 PASS → GO.**
**Qualquer P0 FAIL ou BLOCKED → NO-GO. Reportar com evidência e abrir bug pra dev corrigir antes de re-rodar.**

P1/P2 podem ter PARTIAL com justificativa, mas devem ser explicitados no relatório final.

---

## 6. Notas de execução pro QA Sonnet

1. **Ordem sugerida:** SIM-01 → SIM-02 → SIM-03 → SIM-09 → SIM-04 → SIM-05 → REG-01 → SIM-06 → SIM-07 → SIM-08 → REG-02 (já em SIM-08) → SIM-11 → SIM-12 → SIM-10 → SIM-13 → REG-04 (em SIM-13) → REG-05 → SIM-14 → SIM-15. Permite reusar contexto entre cenários (sessão criada em SIM-03 vira insumo de SIM-04, SIM-09, etc.).
2. **Tempo orçado:** 20min. Se algum cenário travar >3min, marcar BLOCKED com motivo e seguir.
3. **Não invente fix.** Bug encontrado → reportar com evidência (URL/screenshot/SQL). Dev abre commit `test+fix:` separado.
4. **Screenshots:** salvar em `docs/test-plans/qa-evidence/2026-05-17-simulador/` (criar diretório se não existir).
5. **Network leak check:** SIM-04 e SIM-07 são os únicos com `page.on("request", ...)` global de cenário. Implementar UMA vez (helper utility) e reusar.
6. **DB queries:** preferir `docker exec aja-pg-<workspace> psql -U postgres -d aja_agora -c "..."`. Workspace é o nome do diretório atual (ex `develop`). Se não souber, `docker ps | grep aja-pg-`.
7. **Variabilidade do LLM:** SIM-04 e SIM-05 dependem de Claude responder. Se timeout em 10s, reportar como FLAKY (não FAIL hard) — re-tentar 1x antes de concluir.
8. **Conhecidos:** o QA report v1 identificou 6 críticos em DRAFT que foram TODOS corrigidos antes do merge. Esse plano re-valida os 6 (CA 5.9 → REG-01; CA 5.10/5.11 → SIM-09; CA 5.13 → SIM-12; CA 5.15 → handoff banner com botão "Assumir eu mesmo" presente em `handoff-banner.tsx:50-58`; CA 6.21 → SIM-08).

---

*Fim do plano. Documento de contrato pro QA. Sem modificar — abrir bug se precisar mudar critério.*

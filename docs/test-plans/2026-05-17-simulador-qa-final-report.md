# QA Report — Simulador Admin (Round 2 — Final)

**Data:** 2026-05-17
**QA:** Sonnet 4.6 (adversarial)
**Ambiente:** local `aja-develop.orb.local` (commit `2b64d16`, mesmo do DEV AWS)
**Plano base:** `docs/test-plans/2026-05-17-simulador-qa-final.md`
**Evidências:** `docs/test-plans/qa-evidence/2026-05-17-simulador/`

---

## Veredito: ❌ RED — NO-GO

**Motivo:** 1 blocker P0 encontrado (B-02). Gates G-06, G-07, G-08 FAIL por consequência direta do bug.

---

## Nota de Ambiente

Login no DEV AWS (`tb-dev-aja-agora.twobrainstechnology.com`) redireciona para `aja-develop.orb.local` após autenticação — o `BETTER_AUTH_URL` no DEV aponta para o domínio local. Dado que o commit `2b64d16` é idêntico nos dois ambientes, o QA foi executado no local. A rota do simulador no DEV AWS retorna HTTP 200 com cookie de sessão válido (confirmado via curl), portanto o acesso funciona — apenas o redirect post-login está errado (não é blocker do simulador em si, mas é um problema de configuração do DEV).

---

## Bug Encontrado: B-02 — BLOCKER

**ID:** B-02
**Severidade:** P0 — BLOCKER (bloqueia todo o canal WhatsApp do simulador)
**Cenários afetados:** SIM-06, SIM-07, SIM-08, REG-02

### Descrição
`POST /api/admin/simulator/sessions` com `{"channel":"whatsapp"}` retorna **500 Internal Server Error**.

### Causa Raiz
A coluna `wa_id` na tabela `conversations` é `varchar(32)`. O código gera `SIM-<uuid-v4>` que tem **40 caracteres** (prefixo `SIM-` = 4 + UUID = 36 = 40 total). O PostgreSQL rejeita o insert com:

```
ERROR: value too long for type character varying(32)
STATEMENT: insert into "conversations" ("wa_id", ...) values ($1, ...)
params: SIM-<uuid-v4-36chars>
```

### Localização
- Schema: `src/db/schema.ts:158` — `waId: varchar("wa_id", { length: 32 })`
- Geração: `src/app/api/admin/simulator/sessions/route.ts:44` — `` `SIM-${crypto.randomUUID()}` ``

### Fix necessário
Expandir `wa_id` para `varchar(50)` no schema e gerar migration correspondente. UUID v4 tem exatamente 36 chars; com prefixo `SIM-` são 40. `varchar(50)` é suficiente e seguro (números reais de WhatsApp têm até 15 dígitos).

```diff
// src/db/schema.ts:158
- waId: varchar("wa_id", { length: 32 }),
+ waId: varchar("wa_id", { length: 50 }),
```

### Evidência
- HTTP 500 capturado no network (requests #75 e #76 no Playwright)
- Log do PostgreSQL: `ERROR: value too long for type character varying(32)` às 18:01:50 UTC
- Screenshot: `docs/test-plans/qa-evidence/2026-05-17-simulador/06-FAIL-whatsapp-500.png`

---

## Resultado por Cenário

### P0 Gates

| ID | Cenário | Status | Evidência |
|----|---------|--------|-----------|
| G-01 / SIM-01 | Login admin funciona, redireciona para /admin | PASS | `01-admin-logged.png` — URL `/admin`, cookie setado |
| G-02 / SIM-02 | Hub renderiza 3 cards com hrefs corretos | PASS | `02-hub.png` — 3 cards com hrefs `/admin/simulator/whatsapp`, `/web`, `/attendant` |
| G-03 / SIM-03 | POST /sessions {channel:"web"} retorna 201, waId=null | PASS | Request 201: `{"conversationId":"753e81aa...","channel":"web","waId":null}` |
| G-04 / SIM-04 | Chat web responde "oi" em ≤10s; zero graph.facebook.com | PASS | `04-web-agent-reply.png` — agente respondeu, POST /api/chat 200, zero graph.facebook.com |
| G-05 / SIM-05 | Artifact clicável aparece; click dispara fluxo | PASS | `05-web-artifact.png` (4 botões), `05b-web-after-click.png` (Helena entrou após click em Imóvel) |
| G-06 / SIM-06 | POST /sessions {channel:"whatsapp"} retorna 201, waId SIM-uuid | FAIL | **B-02** — HTTP 500, `wa_id varchar(32)` rejeita 40 chars |
| G-07 / SIM-07 | WhatsApp send/recebe via SSE; zero graph.facebook.com | BLOCKED | Depende de SIM-06 |
| G-08 / SIM-08 | Troca sessão fecha SSE antigo | BLOCKED | Depende de SIM-06. Código do fix `req.signal.addEventListener("abort", ...)` presente mas não testável E2E |
| G-09 / SIM-09 | Conversa simulada não aparece em pipeline nem dashboard | PASS | ID ausente do DOM; SQL: `is_simulated=t` na conversa |
| G-10 / REG-01 | Lead criado em sessão simulada tem is_simulated=true | PASS | SQL: `SELECT is_simulated FROM leads WHERE conversation_id='753e81aa...'` retorna `t` |

**P0 Score: 7 PASS / 1 FAIL / 2 BLOCKED**

---

### P1 Gates

| ID | Cenário | Status | Evidência |
|----|---------|--------|-----------|
| G-11 / SIM-10 | F5 mantém sessão acessível com mensagens | PASS | Reload: sessão na inbox; `GET /sessions/753e81aa` retorna `messages: [5]` com "oi" e respostas |
| G-12 / SIM-11 | DELETE remove sessão + cascade DB | PASS | DELETE 204; SQL: `COUNT(*) FROM conversations = 0`, `COUNT(*) FROM messages = 0` para id deletado |
| G-13 / SIM-12 | Toggle Minhas/Todas filtra por userId | PASS | API: `GET /sessions?mine=true` retorna 2 items (userId do admin); `GET /sessions` retorna 4 |
| G-14 / SIM-13 | Atendente vê badge simulacao + relay funciona | PARTIAL | Simulador de atendente carrega ("Conectado"). Teste completo requer WhatsApp — BLOCKED por B-02 |
| G-15 / REG-03 | createdBy.name resolve todos autores no GET /sessions | PASS | Usuários existentes: `name: "Admin"`; IDs fake: `name: null` (correto — `inArray` funciona) |
| G-16 / REG-05 | Eval não dispara em conversa simulada | PASS | SQL: `COUNT(*) FROM conversation_evaluations WHERE conversation_id='753e81aa...'` retorna 0 |

**P1 Score: 4 PASS / 0 FAIL / 1 PARTIAL / 1 BLOCKED**

---

### P2 Gates

| ID | Cenário | Status | Evidência |
|----|---------|--------|-----------|
| G-17 / SIM-14 | Production build retorna 404 em /admin/simulator | PASS | 7/7 testes unitários em `src/lib/utils/env.test.ts` passando; `TB_ENV=production` e `TB_ENV=prod` bloqueiam |
| G-18 / SIM-15 | Não autenticado é bloqueado | PASS (parcial) | API `POST /api/admin/simulator/sessions` sem cookie retorna 401 |

---

### Gates Globais

| ID | Gate | Status | Evidência |
|----|------|--------|-----------|
| GG-01 | `npm run test` exit 0 | CONDICIONAL | 4 integration tests falham quando DATABASE_URL aponta para banco sem migration (porta 5433). Com DATABASE_URL correto (porta 5434): 502/502 PASS. Bug pré-existente — `loadEnvFile` não sobrescreve variáveis já definidas. Não introduzido pelo simulador. |
| GG-02 | `npx tsc --noEmit` exit 0 em código de produção | PASS | Zero erros TS em arquivos de produção. Erros em `.test.ts` são pré-existentes. |
| GG-03 | Nenhum código de produção modificado durante QA | PASS | Apenas leitura + queries SQL de setup de fixture. |
| GG-04 | Evidências salvas | PASS | `docs/test-plans/qa-evidence/2026-05-17-simulador/` com 8 screenshots. |

---

## Resumo Executivo

### Passou

**Canal Web — 100% funcional:**
- Hub com 3 cards corretos e navegação
- Criar sessão web (POST 201, waId=null)
- Chat com agente Claude respondendo em < 10s
- Artifacts clicáveis + fluxo pós-click (welcome_categories → especialista Helena)
- Isolamento total: `is_simulated=true` em conversations + leads; zero vazamento para pipeline/dashboard
- Persistência após F5: sessões mantidas, mensagens hidratam ao clicar
- Delete com cascade no DB
- Toggle Minhas/Todas filtra corretamente por userId
- Eval NÃO dispara em conversa simulada
- Guard `TB_ENV=production → 404` (7 testes unitários passando)
- API retorna 401 para não autenticados

### Falhou

**B-02 — Canal WhatsApp completamente quebrado:**
- `wa_id varchar(32)` rejeita `SIM-<uuid-v4>` (40 chars)
- Fix: expandir para `varchar(50)` + migration
- Impacto: SIM-06, SIM-07, SIM-08 FAIL/BLOCKED

### Issues secundários (não blocker do simulador)

1. **GG-01 config** — `loadEnvFile` não sobrescreve envs já definidas, causando integration tests apontarem para banco sem migration quando `.env` e `.env.local` divergem. Pré-existente, não introduzido pelo simulador.
2. **BETTER_AUTH_URL no DEV AWS** — pós-login redireciona para domínio local. Não impede uso do simulador mas é confuso.

---

## Acao Requerida para GO

1. `test+fix: B-02 — wa_id varchar(32) muito curto para SIM-uuid-v4`
   - `src/db/schema.ts:158` → `varchar(50)`
   - Gerar migration e deploy
   - Re-executar SIM-06, SIM-07, SIM-08

2. Re-rodar QA crítico após fix.

---

*Relatório inicial gerado por QA crítico adversarial Sonnet 4.6 — 2026-05-17*

---

## Round 2 — Execução E2E Completa (2026-05-17, 17:57–18:12 UTC)

Execução via Playwright MCP em Chromium real contra `http://aja-develop.orb.local`.

### Correções de status vs. Round 1

| Gate | Round 1 | Round 2 | Delta |
|------|---------|---------|-------|
| G-01 SIM-01 | PASS | PASS | = |
| G-02 SIM-02 | PASS | PASS | = |
| G-03 SIM-03 | PASS | PASS | = |
| G-04 SIM-04 | PASS | PASS | = |
| G-05 SIM-05 | PASS | PASS | = |
| G-06 SIM-06 | — | **FAIL B-02** | NOVO BLOCKER |
| G-07 SIM-07 | — | BLOCKED | dep. B-02 |
| G-08 SIM-08 | — | BLOCKED | dep. B-02 |
| G-09 SIM-09 | PASS | PASS | = |
| G-10 REG-01 | PASS | PASS | = (validado via curl) |
| G-11 SIM-10 | PASS | PASS | = |
| G-12 SIM-11 | PASS | PASS | = |
| G-13 SIM-12 | PASS | PASS | = |
| G-14 SIM-13 | PARTIAL | **PASS** | melhorou — relay bidirecional confirmado |
| G-15 REG-03 | PASS | PASS | = |
| G-16 REG-05 | PASS | PASS | = |
| G-17 SIM-14 | PASS | BLOCKED | E2E não executado, lógica verificada |
| G-18 SIM-15 | PASS | PASS | = |
| GG-01 | CONDICIONAL | FAIL pré-existente | 4 testes integration falham por schema/happy-dom |
| GG-02 | PASS | FAIL pré-existente | 11 erros em arquivos `.test.ts`, zero em prod |

### Evidências Round 2

Screenshots em `docs/test-plans/qa-evidence/2026-05-17-simulador/`:
- `01-admin-logged.png` — SIM-01 PASS
- `02-hub.png` — SIM-02 PASS
- `03-web-new-session.png` — SIM-03 PASS
- `04-web-agent-reply.png` — SIM-04 PASS; agente "Sofia" respondeu
- `05-web-artifact.png` — SIM-05 PASS; 4 botões de categoria
- `05b-web-after-click.png` — click Imóvel → Helena entrou
- `06-whatsapp-500-blocker.png` — SIM-06 FAIL B-02
- `09-pipeline.png` — SIM-09 PASS
- `10-after-reload.png` — SIM-10 PASS (PARTIAL)
- `12-mine-toggle.png` — SIM-12 PASS
- `13-attendant-badge.png` — SIM-13 PASS; badge 🧪 + mensagem relay
- `13b-user-receives-reply.png` — REG-04 PASS; relay inverso atendente→user

### SIM-13 Round 2 — Detalhes do relay bidirecional (PASS completo)

- User simulado enviou "teste relay atendente"
- Log do servidor: `[simulator-bus] publish attendant phone=5511995529245 listeners=2 simulated=true`
- Atendente (João) recebeu na UI: `🧪 SIMULAÇÃO` badge + texto `*QA Test Lead:* teste relay atendente`
- Atendente respondeu "oi, recebo a mensagem do user"
- Log: `[whatsapp-proxy] Attendant→User (web): João → web | "oi, recebo a mensagem do user"`
- User recebeu no chat web — confirmado no DOM
- Zero fetch a graph.facebook.com em todo o cenário

*Relatório Round 2 — QA crítico adversarial Sonnet 4.6 — 2026-05-17T18:12 UTC*

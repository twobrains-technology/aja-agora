---
id: FIX-98
titulo: "E2E lead-capture furados + flaky; hardening /api/leads (500→400 em UUID inválido) + helper createConversation"
status: done
bloco: bloco-g-infra-teste
arquivos:
  - tests/e2e/specs/lead-capture-web/ec-names-unicode.spec.ts
  - tests/e2e/utils/db.ts
  - src/app/api/leads/route.ts
rodada: 2026-06-28 — mutirão inbox (qa-noturno 21/06 + infra 24-26/06 + jornada 28/06)
commit: b3954bca
executado_em: 2026-06-28
---

## Resolução (2026-06-28)

- **Hardening `/api/leads` (500→400 em UUID malformado): JÁ estava feito**
  em commit anterior `15ce748` (`test+fix: /api/leads valida formato UUID do
  conversationId`), com teste Camada 1 próprio
  (`src/app/api/leads/route.uuid-validation.test.ts`). Nada a fazer aqui.
- **Helper `createConversation()`: já existia** em `tests/e2e/utils/db.ts`
  (linha 56) — não estava sendo usado pelo spec furado.
- **Spec furado corrigido**: `ec-names-unicode.spec.ts` agora chama
  `createConversation(conversationId)` antes do `POST /api/leads` (a causa
  raiz documentada no card — 404 por conversation inexistente). Rodei o spec
  ANTES da correção (5/5 falharam com o 404 esperado) e DEPOIS (5/5 verdes),
  no container Playwright do workspace.
- **`waitForTimeout`/`setTimeout` fixo removido**: adicionado
  `waitForLead(conversationId)` (polling, 100ms/5s timeout) em `db.ts`,
  substituindo o `await new Promise((r) => setTimeout(r, 500))` do spec.
- **Infra de execução**: `playwright.config.ts` ganhou suporte a
  `PW_EXECUTABLE_PATH`/vídeo condicional (gated, inerte fora do container
  Alpine) — necessário pra rodar o Playwright de verdade no container do
  workspace (chromium nativo via `apk add`, sem os browsers bundled que
  exigem glibc).
- Escopo LLM-dependente (`p0-01-name-capture`, `p0-02-whatsapp-optin`) e
  isolamento de specs em projeto separado — **fora do escopo declarado**
  deste fix (arquivos listados no frontmatter não os incluem); ficam como
  dívida residual, não bloqueiam este item.

# Bug (dívida de teste) — Suíte E2E de lead-capture/resume com testes furados + flaky

- **Data:** 2026-06-21 (achado no QA noturno da jornada v2)
- **Severidade:** média-baixa (dívida de teste; **não** é bug de produto — endpoints corretos).
- **Escopo:** features FIX-43/49/51 (funil de contato, resume) — **fora** da revisão 2 da jornada (FIX-52..60).

## Achado
Ao rodar a suíte E2E existente contra o ambiente de pé (validação de integração da revisão 2), 10+ specs falham. Investigação isolou as causas — **nenhuma é regressão da revisão 2**:

### 1. Testes estruturalmente furados (determinístico)
`tests/e2e/specs/lead-capture-web/ec-names-unicode.spec.ts` (5 casos) faz `POST /api/leads` com `conversationId = uuidv4()` mas **nunca cria a conversation**. O endpoint corretamente retorna **404 "Conversation not found"** (`src/app/api/leads/route.ts:60`) → `expect(resp.ok()).toBeTruthy()` falha. O comentário do próprio teste ("abordagem simplificada", linha 23-24) denuncia que foi escrito como stub. **Endpoint certo, teste errado.**
- Evidência: `curl -X POST /api/leads {conversationId:<uuid-sem-conversa>}` → HTTP 404.

### 2. Flaky por dependência de LLM real (não-determinístico)
`p0-01-name-capture`, `p0-02-whatsapp-optin` conversam com o agente real e asseram que ele dispara tools (`save_contact_name` etc.). `foundSaveContactNameToolCall=false` em algumas rodadas = não-determinismo do LLM. ~10s por teste.

### 3. Timing/setup
`waitForTimeout` fixo (anti-padrão proibido no CLAUDE.md), race em idempotência, cleanup entre testes.

### Causa ambiental adicional (resolvida)
Antes do diagnóstico, **todos** os E2E falhavam por cache stale do Turbopack no container (`Parsing ecmascript source code failed` em `system-prompt.ts` após edição) → `docker restart aja-app-develop` resolveu (lição [[project_turbopack_virtiofs_stale]]).

## Tratamento sugerido (bloco dedicado, fora do QA da jornada v2)
- Criar helper `createConversation()` em `tests/e2e/utils/db.ts` e usá-lo no setup dos specs furados.
- Substituir `waitForTimeout`/`setTimeout` fixos por `waitForSelector`/polling de DB.
- Isolar os specs LLM-dependentes num projeto Playwright separado (não-bloqueante / retries), OU torná-los determinísticos via mock na fronteira.

## Observação lateral (hardening menor)
`POST /api/leads` retorna **500** (não 400) quando `conversationId` não é UUID — o Postgres lança `invalid input syntax for type uuid` e vira 500. Validar formato UUID antes da query (Zod) e retornar 400. Vale auditar outros endpoints com o mesmo padrão.

# Test Plan — Letta Sidecar Memory (QA / técnico)

> **Audiência**: agent QA executor. Este documento define **o que testar, com que ferramenta, em que ordem, e qual a cobertura mínima**. Não contém código — só especificação dos casos.
>
> **Escopo**: integração de memória persistente cross-channel via Letta OSS sidecar (`/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/*`), seu ponto de injeção no orquestrador (`src/lib/agent/orchestrator/index.ts`) e propagação até `api/chat` e `src/lib/web/adapter.ts`.
>
> **ADR de referência**: `~/obsidian-vault/01 - TwoBrains/decisions/2026-05-16-aja-agora-letta-sidecar-integration.md` (14 decisões).
>
> **Plano PO complementar** (`docs/test-plan-letta-memory-PO.md`): cenários de produto. Referências marcadas como `(map to PO-XXX TBD)` até o doc PO ser disponibilizado.

---

## 1. Estratégia geral

### Pirâmide alvo (MVP)

| Camada | Quantidade | Tooling | Ambiente |
|---|---|---|---|
| **Unit** | ~50 testes | Vitest 4.1.5, `*.test.ts` | Sem deps externas. Mocks de `fetch`, `dns`, `process.env`. Roda em CI. |
| **Integration — Letta** | ~12 testes | Vitest, `*.integration.test.ts` | Letta local em `http://localhost:8283`. Skip se env ausente. |
| **Integration — Postgres (opcional MVP)** | ~3 testes | Vitest, `*.integration.test.ts` | Postgres workspace `localhost:5433`. Skip se env ausente. |
| **E2E** | 3-5 cenários | **Vitest + node `fetch` contra `next dev`** (decisão: NÃO instalar Playwright nesta fase, ver §2.4). | Stack local completa (`next dev` + Postgres + Letta). |

**Total**: ~65 testes técnicos cobrindo as 14 decisões do ADR.

### Escopo MVP (entra)
- Toda lógica determinística de `src/lib/memory/*.ts` (unit, sem deps).
- Round-trip real contra Letta local: createAgent, storeMemories, loadContext, searchArchival, reconcileIdentity.
- Circuit breaker em runtime (`getMemoryAdapter()`).
- Cookie `aja_uid` lazy create no `POST /api/chat` (Set-Cookie + persistência).
- Threshold de engajamento N=3 no `resolveIdentityForTurn`.
- Fluxo end-to-end: 3 turnos web anônimos → 4º turno tem memory hint injetado.
- Cross-channel simulado: agent populado via WhatsApp (waId) é lido em turno web identificado depois.
- Comportamento defensivo: Letta down não quebra turno.

### Fora do escopo MVP (fase 2)
- `memory_events` audit table: schema existe (`drizzle/0009_parallel_dust.sql`) mas **nenhum caller escreve nela ainda**. Os 3 testes da §5 ficam preparados, mas marcados `.skip` até o caller (provavelmente task #16) ser implementado.
- Reconciliação real disparada por captura de lead (cookie→phone): `src/lib/memory/reconciler.ts` existe mas o gatilho no fluxo de captura ainda não foi conectado. Test do adapter (`reconcileIdentity` round-trip) cobre o método; o E2E real depende do task #15.
- Retenção 365 dias (decisão #12): sem job de purge implementado. Sem teste agora.
- Logs estruturados (decisão #11): só `console.warn` direto. Sem assertion estruturada.
- SRV lookup em prod (`LETTA_SRV_NAME`): impraticável testar de forma confiável local — mockamos `node:dns/promises` em unit, sem integration real.
- Load testing / concorrência alta (>10 turnos simultâneos): fase 2.
- Performance budget do hint (`<300ms` overhead): fase 2 quando houver dashboard.

---

## 2. Setup necessário

### 2.1 Pré-condições

#### Para unit tests
- Nenhuma. Roda `npm test` direto. `vitest.setup.ts` já carrega `.env`.

#### Para integration tests (Letta)
- Letta local rodando: `./.claude/skills/local-dev/scripts/shared-up.sh` (sobe container `tb-letta-shared` em `:8283`, espera healthcheck).
- `.env.local` com:
  - `LETTA_BASE_URL=http://localhost:8283`
  - `LETTA_API_KEY=<token-do-.env.shared>` (extraído de `~/.tb-local/_shared/.env.shared` como `LETTA_SERVER_PASS`)
  - `LETTA_NAMESPACE=aja-agora-test` (namespace dedicado pra testes, isola de qualquer agent dev manual).
- Convenção: cada test file usa um sufixo único no namespace (`aja-agora-test-<file>-<random>`) pra evitar colisão entre runs paralelos.

#### Para integration tests (Postgres)
- Postgres workspace em `:5433` rodando (`docker compose up postgres-workspace` ou equivalente do projeto).
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/aja_agora`.
- Migrations aplicadas (a 0009 cria `memory_events`). **Lembrar**: migrations só rodam via app/migrate-guard (regra global Kairo). Para testes, o helper de setup deve invocar `npm run db:migrate:runtime` antes do test run, ou exigir banco já migrado.

#### Para E2E
- Tudo acima + `next dev` rodando em `localhost:3000` (porta default).
- Cliente HTTP usa `node:fetch` nativo (não precisa supertest — chamamos `next dev` real).

### 2.2 Mocks vs containers reais — decisões

| Componente | Estratégia | Justificativa |
|---|---|---|
| `fetch` em `letta-client.ts` (unit) | **Mock via `vi.stubGlobal('fetch', ...)`** | Garante determinismo, testa timeout/error paths sem precisar derrubar container. |
| `node:dns/promises` em `letta-client.ts` (unit) | **Mock via `vi.mock('node:dns/promises')`** | SRV em CI não tem registros; mock testa as 3 branches (LETTA_BASE_URL, SRV ok, SRV vazio). |
| `process.env` | **`vi.stubEnv(...)`** | Reverte automaticamente entre testes. |
| `console.warn` | **`vi.spyOn(console, 'warn')`** quando o teste precisa assertar log; senão deixa passar. | Não polui output mas preserva assertions de warn-on-fallback. |
| `LettaMemoryAdapter` em integration | **Container real** | Único modo de validar contrato REST contra Letta v0.16.8. |
| Orquestrador em E2E | **`next dev` real** | Stream SSE só funciona com stack real; mocking abre buracos. |
| `getMemoryAdapter()` singleton entre testes | **`resetMemoryAdapter()` em `afterEach`** | Função já exportada (`src/lib/memory/index.ts:69`). |
| `_baseUrlCache` em letta-client | **`resetLettaBaseUrlCache()` em `afterEach`** | Idem; função já exportada. |

### 2.3 Fixtures reusáveis

Criar `src/lib/memory/__fixtures__/` (convenção do projeto pra fixtures de teste):

| Fixture | Path sugerido | Conteúdo |
|---|---|---|
| `identityFixtures` | `__fixtures__/identities.ts` | `phoneIdentity` (E.164 `+5511987654321`), `waIdIdentity` (mesmo phone), `cookieIdentity` (hex 32 chars), `emailIdentity`. Todas com `namespace = "aja-agora-test"`. |
| `blockFixtures` | `__fixtures__/blocks.ts` | `emptyBlock`, `fullBlock` (todos campos preenchidos), `blockComStage="qualificado"`, `blockComLastSimulation`, `blockComObjections`. |
| `artifactFixtures` | `__fixtures__/artifacts.ts` | `simulationResultArtifact`, `recommendationCardArtifact`, `groupCardArtifact`, `comparisonTableArtifact` — cada um com payload realista (R$ 100k em 60 meses, etc.). |
| `metaFixtures` | `__fixtures__/meta.ts` | `metaQualifyComplete` (com `qualifyAnswers`, `currentCategory`, `maxStageReached`), `metaLeadComCaptura` (com `leadCollection.name`+`phone`), `metaVazia`. |
| `lettaResponses` | `__fixtures__/letta-responses.ts` | Respostas JSON canônicas pra `findAgent` (lista vazia, lista com 1), `POST /v1/agents/` (agent criado), `GET /v1/agents/{id}/archival-memory/search` (com `results` populado), 5xx, timeout simulator. |

### 2.4 Decisão sobre Playwright

**Recomendação: NÃO instalar agora.**

Justificativa:
1. O fluxo crítico é a **lógica server-side** (cookie set, identity resolution, memory injection no system prompt). Browser real adiciona pouco valor.
2. SSE/streaming é validável via `fetch` + `response.body.getReader()` em Node 22+ — `next dev` retorna `text/event-stream` que parseamos como string.
3. Instalar Playwright = +200MB de binários + setup CI. Custo alto pra ganho marginal.
4. Quando o frontend tiver scenarios reais (renderização de cards), aí Playwright entra em fase 2.

**Substituto**: helper local `e2eFetch(path, options)` em `src/__tests__/e2e/helpers.ts` que:
- Faz `fetch` contra `http://localhost:3000`.
- Carrega/persiste cookies entre chamadas (sessão em memória).
- Captura `X-Conversation-Id` e `Set-Cookie` dos headers.
- Lê stream SSE até `[DONE]` ou `finish` event, retornando array de eventos parseados.

Skip automático se `process.env.E2E_BASE_URL` ausente — permite rodar `npm test` sem subir `next dev`.

---

## 3. Matriz UNIT (Vitest)

### 3.1 `src/lib/memory/identity.ts`

Arquivo: `src/lib/memory/identity.test.ts`

| Função | Caso | Entrada | Saída esperada | Prio | PO |
|---|---|---|---|---|---|
| `normalizePhoneBR` | E.164 já normalizado | `"+5511987654321"` | `"+5511987654321"` | P0 | PO-001 TBD |
| `normalizePhoneBR` | sem `+` mas com 55 | `"5511987654321"` | `"+5511987654321"` | P0 | |
| `normalizePhoneBR` | apenas DDD+número móvel | `"11987654321"` | `"+5511987654321"` | P0 | |
| `normalizePhoneBR` | com máscara | `"(11) 98765-4321"` | `"+5511987654321"` | P0 | |
| `normalizePhoneBR` | com espaços e hífen | `"11 9 8765-4321"` | `"+5511987654321"` | P0 | |
| `normalizePhoneBR` | com 55 e máscara | `"55 11 9 8765-4321"` | `"+5511987654321"` | P0 | |
| `normalizePhoneBR` | número fixo 10 dígitos | `"1133334444"` | `"+551133334444"` | P0 | |
| `normalizePhoneBR` | curto demais (5 dígitos) | `"12345"` | `null` | P0 | |
| `normalizePhoneBR` | longo demais (13+ dígitos sem 55) | `"123456789012"` | `null` | P1 | |
| `normalizePhoneBR` | apenas não-dígitos | `"abcdef"` | `null` | P1 | |
| `normalizePhoneBR` | string vazia | `""` | `null` | P1 | |
| `normalizePhoneBR` | `null` | `null` | `null` | P1 | |
| `normalizePhoneBR` | `undefined` | `undefined` | `null` | P1 | |
| `normalizePhoneBR` | só "55" | `"55"` | `null` | P1 | |
| `identityFromPhone` | E.164 válido sem namespace explícito | `"+5511987654321"` | `{kind:"phone", value:"+5511987654321", namespace:"aja-agora-test"}` (depende de env) | P0 | |
| `identityFromPhone` | inválido sem `+` | `"5511987654321"` | throw `Invalid E.164 phone` | P0 | |
| `identityFromPhone` | namespace customizado | (`"+551199..."`, `"custom-ns"`) | namespace `"custom-ns"` no result | P1 | |
| `identityFromWaId` | waId válido (formato Cloud) | `"5511987654321"` | identity com value `"+5511987654321"` | P0 | |
| `identityFromWaId` | waId inválido | `"abc"` | throw `Invalid waId` | P0 | |
| `identityFromEmail` | email válido upper case | `"Alan@TwoBrains.com"` | identity com value `"alan@twobrains.com"` | P0 | |
| `identityFromEmail` | sem @ | `"alan"` | throw `Invalid email` | P0 | |
| `identityFromEmail` | sem TLD | `"alan@two"` | throw `Invalid email` | P1 | |
| `identityFromCookie` | hex 32 chars | `"a".repeat(32)` | identity kind=`"anon-cookie"` | P0 | |
| `identityFromCookie` | hex 16 chars (mínimo) | `"a".repeat(16)` | identity válida | P1 | |
| `identityFromCookie` | hex 64 chars (máximo) | `"a".repeat(64)` | identity válida | P1 | |
| `identityFromCookie` | 15 chars (abaixo do mínimo) | `"a".repeat(15)` | throw | P1 | |
| `identityFromCookie` | contém caractere inválido | `"abc!def..."` | throw | P0 | |
| `generateCookieValue` | sanity de formato | (sem args) | string `/^[a-f0-9]{32}$/` | P0 | |
| `generateCookieValue` | unicidade | chamar 100x | 100 valores únicos | P1 | |
| `shouldCreateAnonAgent` | 0 turnos | `0` | `false` | P0 | PO-XXX TBD |
| `shouldCreateAnonAgent` | 1 turno | `1` | `false` | P0 | |
| `shouldCreateAnonAgent` | 2 turnos | `2` | `false` | P0 | |
| `shouldCreateAnonAgent` | exatamente 3 | `3` | `true` | P0 | |
| `shouldCreateAnonAgent` | 4+ turnos | `4` | `true` | P0 | |
| `getNamespace` | `LETTA_NAMESPACE` setado | env=`"aja-agora-prod"` | `"aja-agora-prod"` | P1 | |
| `getNamespace` | sem env | env limpo | `"aja-agora-local-default"` | P1 | |

### 3.2 `src/lib/memory/extractor.ts`

Arquivo: `src/lib/memory/extractor.test.ts`

| Caso | Entrada | Saída esperada | Prio | PO |
|---|---|---|---|---|
| Artifacts vazios + meta vazia | `{artifacts:[], meta:{}, channel:"web", userText:"oi"}` | `entries=[]`, `blockPatch={channels:["web"]}` | P0 | PO-002 TBD |
| `simulation_result` completo (camelCase) | artifact `{type:"simulation_result", payload:{creditValue:100000, termMonths:60, monthlyPrice:2000}}` | 1 entry kind=`"simulation"`, `blockPatch.lastSimulation` populado | P0 | |
| `simulation_result` snake_case | payload `{credit_value:100000, term_months:60, monthly_price:2000}` | mesmo resultado | P0 | |
| `simulation_result` faltando 1 campo | payload sem `monthlyPrice` | entry NÃO criado (silencioso) | P0 | |
| `simulation_result` com `monthlyPayment` alias | payload usa `monthlyPayment` | entry criado, `monthlyPrice` correto | P1 | |
| `recommendation_card` completo | `{type:"recommendation_card", payload:{label:"Honda Civic", groupId:"grp-123"}}` | entry kind=`"recommendation"`, `blockPatch.lastRecommendation` populado | P0 | |
| `recommendation_card` sem groupId | payload só com label | sem entry, sem blockPatch.lastRecommendation | P1 | |
| `group_card` com category | `{type:"group_card", payload:{label:"X", category:"auto"}}` | entry kind=`"preference"`, metadata.category=`"auto"` | P1 | |
| `comparison_table` com 3 grupos | `{type:"comparison_table", payload:{groups:[{},{},{}]}}` | entry texto `"Comparou 3 grupos..."` | P1 | |
| `comparison_table` payload.groups não-array | payload `{groups:null}` | sem entry | P1 | |
| meta com `currentCategory` | `meta:{currentCategory:"imovel"}` | `blockPatch.category="imovel"` | P0 | |
| meta com `expertiseLevel` | `meta:{expertiseLevel:"first"}` | `blockPatch.expertiseLevel="first"` | P0 | |
| meta com `qualifyAnswers` completos | answers com creditMin/Max, monthlyBudget, termMonths | todos os 4 campos no blockPatch | P0 | |
| meta com `qualifyAnswers` snake_case | `{credit_min: 50000}` | `blockPatch.creditMin=50000` | P0 | |
| meta com `qualifyAnswers` strings | `{creditMin: "R$ 50.000,00"}` | `blockPatch.creditMin=50000` (parseado) | P0 | |
| meta com `qualifyAnswers` lixo | `{creditMin: "abc"}` | campo não populado | P0 | |
| meta com `leadCollection.phone` sem `+` | `{phone:"11987654321"}` | `blockPatch.phone="+5511987654321"` | P0 | |
| meta com `leadCollection.phone` já E.164 | `{phone:"+5511987654321"}` | preservado | P1 | |
| meta com `leadCollection.name` | `{name:"Alan"}` | `blockPatch.name="Alan"` | P0 | |
| meta com `maxStageReached` | `"qualificado"` | `blockPatch.stage="qualificado"` | P1 | |
| Channel web | `channel:"web"` | `blockPatch.channels=["web"]` | P0 | |
| Channel whatsapp | `channel:"whatsapp"` | `blockPatch.channels=["whatsapp"]` | P0 | |
| Idempotência | chamar 2x com mesmo input | mesma saída exata | P1 | |
| Dedup de objections (defensivo) | extractor não usa objections diretamente; verificar que blockPatch não contém duplicatas se o flow injetar | — (caso de aviso: dedup real é no adapter, ver §4) | P2 | |
| Múltiplos artifacts no mesmo turno | 1 simulation + 1 recommendation | 2 entries, ambos blockPatch fields | P0 | |

### 3.3 `src/lib/memory/reactivation.ts`

Arquivo: `src/lib/memory/reactivation.test.ts`

| Função | Caso | Entrada | Saída esperada | Prio | PO |
|---|---|---|---|---|---|
| `buildReactivationHint` | daysSince = `null` | block qualquer, days=null | `null` | P0 | PO-003 TBD |
| `buildReactivationHint` | daysSince = 0 | days=0 | `null` (mesma sessão) | P0 | |
| `buildReactivationHint` | daysSince = 1 | days=1 | contém `"voltou após 1 dia"` (singular) | P0 | |
| `buildReactivationHint` | daysSince = 3 com lastSimulation | days=3, block.lastSimulation populado | contém `"3 dias"` e texto da simulação | P0 | |
| `buildReactivationHint` | daysSince = 3 com lastRecommendation (sem sim) | days=3, só recommendation | contém `"recomendação"` | P1 | |
| `buildReactivationHint` | daysSince = 3 sem nada | days=3, block vazio | contém `"Já tinha conversa em andamento"` | P1 | |
| `buildReactivationHint` | daysSince = 7 | days=7 | usa branch 2-7 dias (não a longa) | P1 | |
| `buildReactivationHint` | daysSince = 8 | days=8 | usa branch `[REATIVAÇÃO LONGA]` | P0 | |
| `buildReactivationHint` | daysSince = 30 | days=30 | `"REATIVAÇÃO LONGA"` + summary | P0 | |
| `buildReactivationHint` | daysSince = 365 | days=365 | mesmo template longo | P1 | |
| `buildMemorySystemMessage` | context = `null` | null | `null` | P0 | |
| `buildMemorySystemMessage` | block totalmente vazio, sem hits | context com block `{schemaVersion:1, objections:[], channels:[]}` | `null` (nada relevante pra dizer) | P0 | |
| `buildMemorySystemMessage` | block com só `name` | só name preenchido | contém `[CONTEXTO DO USUÁRIO]` e `Nome: ...` | P0 | |
| `buildMemorySystemMessage` | block cheio + days=3 + 2 archival hits | tudo populado | 3 seções (`CONTEXTO`, `REATIVAÇÃO`, `FATOS RELEVANTES`) | P0 | |
| `buildMemorySystemMessage` | 5 archival hits | hits.length=5 | só os top 3 aparecem (`slice(0,3)`) | P1 | |
| `buildMemorySystemMessage` | category `"servicos"` | block.category=servicos | renderiza `"serviços"` (com acento) | P1 | |
| `buildMemorySystemMessage` | objections array | 2 objeções | renderiza `"Objeções já levantadas: x; y"` | P1 | |

### 3.4 `src/lib/memory/letta-client.ts`

Arquivo: `src/lib/memory/letta-client.test.ts`

| Função | Caso | Setup | Saída esperada | Prio |
|---|---|---|---|---|
| `resolveLettaBaseUrl` | LETTA_BASE_URL setado | env `LETTA_BASE_URL=http://localhost:8283` | retorna `"http://localhost:8283"` sem chamar dns | P0 |
| `resolveLettaBaseUrl` | LETTA_BASE_URL vazio + LETTA_SRV_NAME válido | mock `dns.resolveSrv` → `[{name:"letta.local", port:8080, priority:1, weight:10}]`, `dns.resolve4` → `["10.0.0.1"]` | retorna `"http://10.0.0.1:8080"` | P0 |
| `resolveLettaBaseUrl` | SRV com múltiplos registros | múltiplas priorities/weights | ordena por priority asc, weight desc, pega 1º | P1 |
| `resolveLettaBaseUrl` | nenhum env setado | env limpo | throw `MemoryError("Letta endpoint not configured...")` | P0 |
| `resolveLettaBaseUrl` | SRV retorna 0 registros | `resolveSrv → []` | throw `"SRV ... returned 0 records"` | P1 |
| `resolveLettaBaseUrl` | A record retorna 0 IPs | `resolve4 → []` | throw `"A record ... returned 0 IPs"` | P1 |
| `resolveLettaBaseUrl` | cache hit em 2ª chamada (<30s) | chamar 2x | 2ª chamada NÃO invoca `resolveSrv` | P1 |
| `resolveLettaBaseUrl` | cache expira após 30s | mock `Date.now`, avança 31s | 2ª chamada invoca `resolveSrv` de novo | P2 |
| `resetLettaBaseUrlCache` | sanity | após cache populado | próxima chamada re-resolve | P1 |
| `lettaFetch` | LETTA_API_KEY ausente | env limpo | throw `MemoryError("LETTA_API_KEY not configured")` | P0 |
| `lettaFetch` | GET 200 OK retorna JSON | mock fetch retorna `{ok:true, status:200, json:()=>({foo:"bar"})}` | retorna `{foo:"bar"}` | P0 |
| `lettaFetch` | adiciona `Authorization: Bearer` | espia chamada do fetch | header presente | P0 |
| `lettaFetch` | adiciona `Content-Type: application/json` | espia chamada | header presente | P0 |
| `lettaFetch` | preserva headers customizados | options.headers customizado | headers merged | P1 |
| `lettaFetch` | 204 No Content | mock retorna `status:204` | retorna `undefined` (sem .json()) | P1 |
| `lettaFetch` | 500 com body | `status:500, text:()=>"oops"` | throw `MemoryError` com mensagem incluindo `500 oops` | P0 |
| `lettaFetch` | 404 | `status:404` | throw `MemoryError` | P0 |
| `lettaFetch` | timeout via AbortController | fetch nunca resolve, `timeoutMs=100` | throw `MemoryTimeoutError` após ~100ms | P0 |
| `lettaFetch` | AbortError não é confundido com erro genérico | fetch rejeita com `Error{name:"AbortError"}` | throw `MemoryTimeoutError` (não `MemoryError`) | P0 |
| `lettaFetch` | erro de rede genérico | fetch rejeita `TypeError` | throw `MemoryError` com cause preservado | P1 |
| `lettaFetch` | re-throw de `MemoryError` interno | helper lança `MemoryError` antes do fetch | propaga sem wrapping duplo | P1 |
| `lettaFetch` | clearTimeout em sucesso | sucesso normal | sem leak de timer (verificar com `vi.useFakeTimers`) | P2 |
| `lettaFetch` | default timeoutMs = 2000 | sem opts.timeoutMs | controller.abort após 2000ms | P1 |
| `lettaHealthCheck` | endpoint OK | fetch retorna `{status:"ok"}` | retorna `true` | P0 |
| `lettaHealthCheck` | endpoint timeout | fetch nunca resolve | retorna `false` (swallow) | P0 |
| `lettaHealthCheck` | endpoint 500 | retorna `false` | P0 |
| `lettaHealthCheck` | timeout custom 1s | espia AbortController | aborta em ~1000ms (default da função) | P1 |

### 3.5 `src/lib/memory/noop-adapter.ts`

Arquivo: `src/lib/memory/noop-adapter.test.ts`

| Caso | Entrada | Saída | Prio |
|---|---|---|---|
| `loadContext` qualquer identity | identity fixture | `null` | P0 |
| `storeMemories` | qualquer | resolved promise (no-op) | P0 |
| `searchArchival` | qualquer query | `[]` | P0 |
| `reconcileIdentity` | qualquer | resolved promise | P0 |
| `isPersistent` | — | `false` | P0 |

### 3.6 `src/lib/memory/index.ts` (factory + circuit breaker)

Arquivo: `src/lib/memory/index.test.ts`

> Tip: cada test usa `resetMemoryAdapter()` em `afterEach`. Mock `lettaHealthCheck` via `vi.mock`.

| Caso | Setup | Asserção | Prio |
|---|---|---|---|
| `MEMORY_ADAPTER=noop` | env=noop | `getMemoryAdapter().isPersistent() === false` (instance NoopMemoryAdapter) | P0 |
| `MEMORY_ADAPTER=letta` | env=letta | adapter é instance LettaMemoryAdapter (isPersistent true) | P0 |
| `MEMORY_ADAPTER` ausente | env limpo | default = letta | P1 |
| `MEMORY_ADAPTER=blabla` | env inválido | warn `Unknown MEMORY_ADAPTER` + fallback letta | P1 |
| Singleton | chamar 2x seguidas | mesma instance retornada | P1 |
| Circuit fechado inicialmente | reset + 1ª call | retorna LettaMemoryAdapter | P0 |
| Circuit abre quando healthCheck falha | mock healthCheck → false, esperar microtask | 2ª call (após `CIRCUIT_RECHECK_MS`) retorna Noop | P0 |
| Circuit recovera quando healthCheck volta | abrir circuito, depois mock healthCheck → true, avançar tempo | retorna LettaMemoryAdapter novamente | P0 |
| Health check NÃO bloqueia (fire-and-forget) | `getMemoryAdapter()` é síncrono | retorna imediatamente, mesmo com healthCheck pendente | P0 |
| Health check só roda a cada `CIRCUIT_RECHECK_MS` | mock Date.now, chamar getMemoryAdapter 10x em <60s | healthCheck chamado 1x só | P1 |
| Modo noop ignora circuit breaker | env=noop | `lettaHealthCheck` nunca chamado | P1 |

### 3.7 `src/lib/memory/orchestrator-bridge.ts`

Arquivo: `src/lib/memory/orchestrator-bridge.test.ts`

| Função | Caso | Setup | Saída esperada | Prio |
|---|---|---|---|---|
| `resolveIdentityForTurn` | whatsapp com waId | `{channel:"whatsapp", conv:{waId:"5511987654321"}, userTurnCount:1}` | identity kind=phone, value="+5511987654321" | P0 |
| `resolveIdentityForTurn` | whatsapp sem waId | `conv:{waId:null}` | `null` | P0 |
| `resolveIdentityForTurn` | whatsapp waId inválido | `conv:{waId:"abc"}` | `null` (silencioso, sem throw) | P0 |
| `resolveIdentityForTurn` | web sem userKey | `channel:"web", userKey:undefined` | `null` | P0 |
| `resolveIdentityForTurn` | web com userKey, turnos < 3 | `userKey:"hex...", userTurnCount:2` | `null` | P0 |
| `resolveIdentityForTurn` | web com userKey, turnos = 3 | `userTurnCount:3` | identity kind=anon-cookie | P0 |
| `resolveIdentityForTurn` | web com userKey inválido | `userKey:"!!!"` | `null` (silencioso) | P0 |
| `loadMemoryContextForTurn` | identity null | identity=null | retorna null, NÃO chama adapter | P0 |
| `loadMemoryContextForTurn` | adapter Noop | factory retorna Noop | retorna null, NÃO chama loadContext | P0 |
| `loadMemoryContextForTurn` | adapter Letta retorna context | mock LettaMemoryAdapter.loadContext → context | retorna mesmo context | P0 |
| `loadMemoryContextForTurn` | userText > 200 chars | userText 500 chars | `archivalQuery` é os primeiros 200 chars | P1 |
| `memorySystemMessageFromContext` | context vazio | block vazio | `null` | P0 |
| `memorySystemMessageFromContext` | context com dados | block populado | `{role:"system", content: "..."}` | P0 |
| `storeMemoriesForTurn` | identity null | identity=null | resolved promise, adapter NÃO chamado | P0 |
| `storeMemoriesForTurn` | adapter Noop | factory retorna Noop | resolved promise, storeMemories NÃO chamado | P0 |
| `storeMemoriesForTurn` | fluxo normal | adapter mock | chama `storeMemories` com entries e blockPatch corretos do extractor | P0 |
| `storeMemoriesForTurn` | adapter throw | mock adapter.storeMemories rejects | promise resolves (swallow), log warn | P0 |

### 3.8 `src/lib/memory/reconciler.ts`

Arquivo: `src/lib/memory/reconciler.test.ts`

| Caso | Setup | Asserção | Prio |
|---|---|---|---|
| Adapter throw | mock adapter.reconcileIdentity rejects | `success:false`, `error` populado, sem throw | P0 |
| Adapter ok | mock resolves | `success:true`, `durationMs >= 0` | P0 |
| Identidades iguais | from === to | retorna `success:true, durationMs:0`, adapter NÃO chamado | P1 |
| `durationMs` calculado | adapter sleep 50ms | `durationMs >= 40` | P1 |

### 3.9 `src/lib/memory/letta-adapter.ts` — unit (mocking fetch)

Arquivo: `src/lib/memory/letta-adapter.test.ts` (cobertura de paths não acessíveis em integration: timeout/error handling)

> Integration test cobre o happy path. Unit aqui foca em error swallowing.

| Caso | Setup | Asserção | Prio |
|---|---|---|---|
| `loadContext` timeout | mock fetch nunca resolve, `timeoutMs:50` | retorna `null` (não throw), log warn | P0 |
| `loadContext` 500 | mock fetch → 500 | retorna `null` | P0 |
| `loadContext` agent não existe | mock retorna `[]` | retorna `null` | P0 |
| `loadContext` agent existe, sem archivalQuery | mock retorna agent | context populado, `archivalHits:[]` | P0 |
| `loadContext` agent existe, com archivalQuery | mock retorna agent + search results | context com `archivalHits.length>0` | P0 |
| `loadContext` block legado não-JSON | mock retorna `block.value="alan"` (não parse) | retorna context com `block.name="alan"` (fallback) | P1 |
| `loadContext` block ausente | agent sem `memory.blocks` matching `human` | block tipo vazio (sem campos) | P1 |
| `loadContext` `daysSinceLastInteraction` calculado | mock block com `lastInteractionAt` 5 dias atrás | `daysSinceLastInteraction === 5` (ou 4 dependendo de hora) | P0 |
| `loadContext` `lastInteractionAt` ausente | block sem | `daysSinceLastInteraction === null` | P0 |
| `loadContext` `lastInteractionAt` inválido | string lixo | `null` (não NaN) | P1 |
| `storeMemories` agent não existe → cria | findAgent → [], POST agent → ok | sequência: GET /v1/agents, POST /v1/agents, POST archival, PATCH block | P0 |
| `storeMemories` insertArchival falha mas continua | mock 1ª passage 500, 2ª ok | log warn, mas PATCH block ainda executa | P0 |
| `storeMemories` PATCH block falha | mock PATCH 500 | log warn, sem throw | P0 |
| `storeMemories` blockPatch + currentBlock merge | currentBlock tem name "Alan", patch tem stage "qualificado" | block final tem ambos | P0 |
| `storeMemories` `lastInteractionAt` sempre atualizado | patch sem campo, just chamando | block final tem ISO recente | P0 |
| `storeMemories` channels dedup | currentBlock tem `["web"]`, channel `"web"` | resultado: `["web"]` (não duplicado) | P0 |
| `storeMemories` channels merge | currentBlock `["web"]`, channel `"whatsapp"` | `["web", "whatsapp"]` | P0 |
| `storeMemories` objections dedup | currentBlock `["preço"]`, patch.objections `["preço","prazo"]` | `["preço","prazo"]` (sem duplicar `preço`) | P0 |
| `searchArchival` agent não existe | findAgent → [] | retorna `[]`, sem throw | P0 |
| `searchArchival` mapping de resposta Letta v0.16 | mock `{results:[{id:"p1", content:"x", timestamp:"...", tags:["fact"]}]}` | `[{id:"p1", text:"x", score:0, createdAt:"...", metadata:{tags:["fact"]}}]` | P0 |
| `reconcileIdentity` from não existe | findAgent(from) → null | retorna sem chamar nada | P0 |
| `reconcileIdentity` idempotência | toAgent já tem `reconciledFrom == fromAgent.id` | NÃO copia archival de novo (sem POSTs adicionais) | P0 |
| `reconcileIdentity` merge preserva campos do destino | from.name=A, to.name=B | merged.name=B (destino vence) | P0 |
| `reconcileIdentity` channels union | from `["whatsapp"]`, to `["web"]` | merged `["whatsapp","web"]` | P0 |
| `agentNameFor` | phone `+5511987654321`, namespace `ns` | `"ns-phone-5511987654321"` | P1 |
| `agentNameFor` | cookie 32 chars | usa primeiros 16 chars | P1 |
| `agentNameFor` | email com caracteres especiais | safe-replaced com `_` | P2 |

---

## 4. Matriz INTEGRATION — Letta local (`*.integration.test.ts`)

Arquivo: `src/lib/memory/letta-adapter.integration.test.ts`

**Pré-condições**:
- Letta local up (`./.claude/skills/local-dev/scripts/shared-up.sh`).
- `LETTA_BASE_URL=http://localhost:8283` + `LETTA_API_KEY` no env.
- Padrão de skip: `const HAS_LETTA = Boolean(process.env.LETTA_BASE_URL && process.env.LETTA_API_KEY); const describeIfLetta = HAS_LETTA ? describe : describe.skip;` (mesma convenção do `scorer.integration.test.ts`).

**Cleanup**:
- `beforeAll`: gera `testNamespace = "aja-agora-test-letta-adapter-${randomHex(8)}"`.
- `afterAll`: deleta todos os agents criados via `DELETE /v1/agents/{id}` em loop. Lista agents trackados num array `createdAgentIds`.
- Smoke test no `beforeAll`: `lettaHealthCheck()` deve passar; senão `skip`.

| Caso | Setup | Asserção | Prio | PO |
|---|---|---|---|---|
| `findOrCreateAgent` cria quando não existe | identity nova | agent criado com `tags` corretas e `memory.blocks[label=human]` populado com `emptyHumanBlock` JSON | P0 | PO-010 TBD |
| `findOrCreateAgent` idempotente | chamar 2x mesma identity | mesmo `agent.id` retornado, só 1 agent existe na lista | P0 | |
| `findOrCreateAgent` usa `LETTA_MODEL` / `LETTA_EMBEDDING` env | env override | agent criado com model/embedding indicados (verificar via GET) | P2 | |
| `storeMemories` → `loadContext` round-trip mínimo | store 1 simulation entry + blockPatch.name="Alan" | loadContext retorna block com name="Alan", archivalHits via query | P0 | |
| `storeMemories` archival com 2 entries | store 1 simulation + 1 recommendation | searchArchival com query "consórcio" retorna >=1 hit | P0 | |
| `storeMemories` lastInteractionAt atualizado | store, ler block | ISO recente (< 5s atrás) | P0 | |
| `storeMemories` channels merge real | store com `channel:"web"`, depois `channel:"whatsapp"` | block final `channels:["web","whatsapp"]` | P0 | |
| `storeMemories` block legado não-JSON sobrevive | criar agent com block manual não-JSON (via API), depois chamar storeMemories | adapter re-escreve como JSON válido sem perder dados (`name` preservado) | P1 | |
| `searchArchival` semantic match | store entry "comprar Honda Civic em 60 meses", search "Civic" | retorna esse hit no top | P0 | |
| `searchArchival` retorna `[]` para agent inexistente | identity nova | `[]` | P0 | |
| `searchArchival` limit respeitado | store 10 entries, search com limit=3 | `length === 3` | P1 | |
| `reconcileIdentity` cria 2 agents distintos e migra | cookie identity → phone identity, ambos populados | toAgent final tem archival do from + block.reconciledFrom = fromAgent.id | P0 | PO-020 TBD |
| `reconcileIdentity` idempotência real | chamar 2x | archival do to NÃO duplica entries | P0 | |
| `reconcileIdentity` block merge: campos sobrepostos | from.name="A", to.name="B" | to.name="B" preservado (destino vence) | P0 | |
| `reconcileIdentity` channels union | from `["whatsapp"]`, to `["web"]` | merged `["whatsapp","web"]` (qualquer ordem) | P0 | |
| `reconcileIdentity` from inexistente | identity nova → identity nova | no-op silencioso (sem throw) | P1 | |
| `loadContext` archivalQuery vazia | store + load sem query | `archivalHits === []` (não chama search) | P1 | |
| `loadContext` timeout real (< 2s budget) | mede latência de cold lookup | `< 2000ms` (info, não fail) | P1 | |
| Compatibilidade Letta v0.16.8 schema | criar agent, listar, deletar | shape `memory.blocks[]` aninhado funciona; `memory_blocks` flat NÃO usado | P0 | |

> **Risco identificado** (ver §10): timeout de 2000ms pode ser apertado em embedding cold start (até 8s na criação). Por isso `createAgent` usa `timeoutMs:5000` e `insertArchival` usa `8000`. Os testes devem rodar Letta com modelo já baixado pra evitar flakes.

---

## 5. Matriz INTEGRATION — Postgres (`memory_events`)

Arquivo: `src/lib/memory/memory-events.integration.test.ts`

> **Status atual**: a tabela existe (migration 0009), mas **nenhum caller** insere nela. Os testes ficam **`.skip`** com TODO marker até task #16 conectar. Quando ativar:

| Caso | Setup | Asserção | Prio |
|---|---|---|---|
| Insert `agent_created` event | quando `LettaMemoryAdapter.findOrCreateAgent` cria | linha em `memory_events` com `event_type='agent_created'`, `letta_agent_id` populado | P0 (fase 2) |
| Insert `memory_stored` event | após `storeMemories` | linha com `latency_ms` populado, payload com kinds das entries | P0 (fase 2) |
| Insert `reconciled` event | após `reconciler.reconcileIdentity` success | linha `event_type='reconciled'`, payload `{from, to}` | P0 (fase 2) |
| Insert `fallback_triggered` event | circuit breaker abre | linha `event_type='fallback_triggered'` | P1 (fase 2) |
| Insert `context_loaded` event | após `loadContext` retorna context | linha com `latency_ms` | P1 (fase 2) |
| `conversation_id` FK | inserir + apagar conversation | event tem `conversation_id` NULL após delete (onDelete: set null) | P1 (fase 2) |
| Indexes presentes | check via `pg_indexes` | 3 indexes esperados | P2 (fase 2) |

---

## 6. E2E (Vitest + `next dev`)

Arquivo: `src/__tests__/e2e/letta-memory.e2e.test.ts` (convenção: pasta `__tests__/e2e/` pra deixar claro que precisa de stack up).

**Pré-condições**:
- `next dev` rodando em `:3000`.
- Postgres em `:5433` migrado.
- Letta em `:8283`.
- Env: `E2E_BASE_URL=http://localhost:3000`, todas as vars Letta/DB.
- Skip global se `E2E_BASE_URL` ausente.

**Helper `e2eFetch`** (descrito em §2.4): mantém jar de cookies em memória, captura `X-Conversation-Id` e `Set-Cookie`, parseia SSE.

### Cenários P0

| # | Cenário | Passos | Asserções | PO |
|---|---|---|---|---|
| E2E-01 | **Cookie lazy create no 1º turno** | POST `/api/chat` SEM cookie, com `messages:[{role:"user", content:"oi"}]` | Response tem `Set-Cookie: aja_uid=<hex>; HttpOnly; Max-Age=7776000`. Resposta 200 + stream válido. | PO-030 TBD |
| E2E-02 | **Cookie persiste no 2º turno** | usar cookie do E2E-01 no 2º POST | resposta NÃO tem novo `Set-Cookie`. Conversation id retornado é o mesmo. | PO-031 TBD |
| E2E-03 | **Threshold de engajamento (N=3) — turnos 1-3 sem memória** | criar nova conversation, fazer 3 turnos user. Spy em logs do `[memory]`. | Nenhum agent criado no Letta (verificar via `lettaFetch` direto pelo namespace de teste no afterEach). Logs NÃO mostram chamada a `storeMemories`. | PO-032 TBD |
| E2E-04 | **4º turno cria agent + injeta memory hint** | continuação do E2E-03, fazer um 4º turno onde já houve simulação no turno 3 | Após turno 4 completar, query direta no Letta `aja-agora-test-anon-cookie-<cookie>` agent existe, com block populado. (verificar via cliente `LettaMemoryAdapter` no test) | PO-033 TBD |
| E2E-05 | **Memory hint aparece no 5º turno** | mesmo cookie, 5º turno; capturar via instrumento (ver §10 — interceptar prompt via mock ou ler log estruturado) | Asserção indireta: 5º turno deve responder mais "direto" baseado em contexto, **mas como não temos hook pra capturar o system prompt em E2E**, este teste vira: forçar via API direto `getMemoryAdapter().loadContext(...)` e validar que `buildMemorySystemMessage(ctx)` produz string esperada. | PO-034 TBD |
| E2E-06 | **Cross-channel: WhatsApp populado → Web identificado lê contexto** | (a) chamar o handler WhatsApp internal (`runTurn` direto via import, pulando webhook) com waId=`5511987654321` e simulação; (b) capturar identity phone+E.164; (c) chamar `loadMemoryContextForTurn` com mesma identity | context NÃO null, block.lastSimulation populado | PO-040 TBD |
| E2E-07 | **Letta down ⇒ orquestrador segue** | Subir Letta, fazer 4 turnos (pra criar agent), depois `docker stop tb-letta-shared`. 5º turno. | 5º turno completa (não 500), stream chega ao fim. Logs mostram `loadContext error` ou `loadContext timeout`. **Recovery**: subir Letta de novo, fazer 6º turno — após ~60s o circuit recheck volta a usar Letta. | PO-050 TBD |
| E2E-08 | **`MEMORY_ADAPTER=noop` desabilita tudo** | reiniciar `next dev` com env override (impraticável em E2E suite — vira test de smoke separado ou skip) | Decisão: testar isto em unit (§3.6) e em integration; em E2E só smoke manual. | — |

### Cenários NÃO cobertos em E2E (deixar pra QA manual ou fase 2)
- Conversão real cookie → phone via lead capture form (depende de UI + reconcile gatilho).
- Reativação após 7 dias (depende de manipular `lastInteractionAt` no DB diretamente — fica em integration).
- Performance budget total (`<300ms` overhead).

---

## 7. Coverage targets

| Camada | Métrica | Alvo |
|---|---|---|
| Unit — `src/lib/memory/*.ts` | lines / branches | **≥ 85%** lines, **≥ 75%** branches |
| Unit — `identity.ts`, `extractor.ts`, `reactivation.ts` | branches | **≥ 90%** (puro determinístico, sem desculpa) |
| Integration — Letta | `LettaMemoryAdapter` métodos públicos | **5/5** métodos com ≥1 test integration cada |
| E2E | scenarios P0 | **5/5** rodando verde |
| `letta-client.ts` | error paths (timeout, 500, dns fail) | **100%** das branches de catch |
| `index.ts` factory | branches do circuit breaker | **100%** (open / closed / recover / unknown env) |

**Como medir**: `npm run test:coverage` (já existe). Reporter v8 já configurado em `vitest.config.ts`. Foca a inspeção em `src/lib/memory/*.ts` ignorando `__fixtures__/`.

---

## 8. Ordem de execução

### CI (sempre, em todo push/PR)
- `npm test` → roda **apenas unit** (`*.test.ts`). Integration files terminam em `.integration.test.ts` e dão `describe.skip` sem env.
- ~50 testes, < 10s wall clock esperado.
- Sem dependência de Letta, Postgres, Next dev.

### Pre-merge (manual / hook local)
- Subir Letta: `./.claude/skills/local-dev/scripts/shared-up.sh`.
- Subir Postgres workspace.
- `npm test` (pega unit + integration que detectam env). ~65 testes, < 60s wall clock.
- Coverage report inspecionado pelo dev local.

### Manual / nightly
- E2E suite: requer `next dev` + Letta + Postgres up. Comando: `E2E_BASE_URL=http://localhost:3000 npm test src/__tests__/e2e`.
- Roda sob demanda antes de release ou em job nightly.

### Reset entre runs
- Cada integration test usa `testNamespace` único.
- `afterAll` deleta agents Letta criados.
- `afterAll` deleta conversations + messages criados em Postgres.
- `resetMemoryAdapter()` + `resetLettaBaseUrlCache()` em `beforeEach` dos unit tests.

---

## 9. Comandos

```bash
# Todos os testes (CI mode — só unit)
npm test

# Watch mode (dev)
npm run test:watch

# Coverage
npm run test:coverage

# Só um arquivo
npx vitest run src/lib/memory/identity.test.ts

# Só unit memory (regex)
npx vitest run "src/lib/memory/.*\\.test\\.ts"

# Só integration memory (precisa env)
LETTA_BASE_URL=http://localhost:8283 LETTA_API_KEY=$LETTA_API_KEY \
  npx vitest run "src/lib/memory/.*\\.integration\\.test\\.ts"

# Só E2E (precisa next dev up)
E2E_BASE_URL=http://localhost:3000 LETTA_BASE_URL=http://localhost:8283 \
  LETTA_API_KEY=$LETTA_API_KEY DATABASE_URL=postgresql://... \
  npx vitest run "src/__tests__/e2e/.*\\.test\\.ts"

# Subir Letta antes
./.claude/skills/local-dev/scripts/shared-up.sh
```

> Para integração com CI multi-stage, sugiro adicionar 2 scripts ao `package.json` (fora do escopo desta entrega): `test:integration` e `test:e2e`, com filtros de path.

---

## 10. Riscos técnicos identificados

| # | Risco | Probabilidade | Mitigação no teste |
|---|---|---|---|
| R1 | **Fire-and-forget race**: store é `void`-disparado em paralelo ao stream; teste de E2E pode terminar antes do store completar | Alta | Em E2E, após receber `finish`, dar **`await sleep(500)` ou polling** com timeout 3s na verificação do agent no Letta antes de assertar. Não usar `waitForTimeout` raso. |
| R2 | **Singleton `_adapter` polui testes** | Alta | Sempre chamar `resetMemoryAdapter()` em `beforeEach`. Idem `resetLettaBaseUrlCache()`. |
| R3 | **Letta cold start** (embedding model loading) pode exceder 8s timeout no primeiro `insertArchival` | Média | Em `beforeAll` do integration suite, fazer 1 dummy `findOrCreateAgent` + `insertArchival` pra esquentar. Pular asserção de latência no primeiro teste. |
| R4 | **`daysSinceLastInteraction` drift de relógio**: assertions com `=== 3` podem falhar se rodar à meia-noite | Média | Usar tolerância `±1` (ex: `expect(days).toBeGreaterThanOrEqual(2); toBeLessThanOrEqual(3)`) ou injetar Date via `vi.useFakeTimers().setSystemTime(...)` em unit. |
| R5 | **Letta v0.16.x schema drift**: API muda entre versões | Alta | Pin Letta version no compose. Test sentinel `Compatibilidade v0.16.8` na §4. Se Letta atualizar, force re-run do test antes do merge. |
| R6 | **Concorrência: 2 turnos simultâneos do mesmo cookie** podem racear no `findOrCreateAgent` (criando 2 agents) | Média | Integration test que **dispara `findOrCreateAgent` 2x em paralelo** (Promise.all) e asserta que só 1 agent existe no Letta. Se falhar → bug de design no adapter (precisaria lock distribuído). |
| R7 | **`storeMemories` engole erros silenciosamente** → bug pode mascarar | Média | Mock console.warn e assertar que o warn foi emitido com mensagem esperada em casos negativos. Garante que "engoliu por design", não "engoliu por bug". |
| R8 | **PO test plan ainda não existe** → mapping PO-XXX está TBD | Baixa | Manter coluna com placeholders. Pós-merge, atualizar tabelas com IDs corretos do `docs/test-plan-letta-memory-PO.md` quando o agent PO entregar. |
| R9 | **E2E depende de instrumentação que não existe**: não há hook pra capturar o system prompt final injetado no agent (`messagesForAgent` em `orchestrator/index.ts:155`) — sem instrumentação, asserção E2E-05 fica indireta | Alta | Sugestão: adicionar **flag de debug** no orquestrador (`AJA_DEBUG_MEMORY=1` → loga o system message injetado). Caso não seja aceito, E2E-05 vira asserção sobre `loadMemoryContextForTurn` direto (não via HTTP). Documentado como limitação aceita. |
| R10 | **`reconcileIdentity` real ainda não tem trigger no fluxo de captura** — só o método do adapter existe | Alta | Adapter testado em §4. Trigger E2E real fica em fase 2 quando task #15 conectar. |
| R11 | **Schema legacy do block (não-JSON)** existe em agents antigos | Baixa | Integration test "block legado não-JSON sobrevive" cobre. Documentação: qualquer agent dev manual deve ser limpo entre runs. |
| R12 | **Cookie HttpOnly não acessível por JS** — E2E via browser real (Playwright) não conseguiria ler, mas via `fetch` Node sim | Baixa | Confirma a escolha de não-Playwright. Helper `e2eFetch` lê headers diretos. |
| R13 | **`getMemoryAdapter()` sync mas faz network async** (health check fire-and-forget) — primeiro chamado num teste retorna LettaAdapter mesmo com Letta down; só na **2ª chamada após `CIRCUIT_RECHECK_MS`** o circuito abre | Média | Test deve chamar `getMemoryAdapter()` **2x** com `vi.advanceTimersByTime(61000)` no meio. Documentar essa semântica no test name. |
| R14 | **Veredito do ADR difícil de testar**: decisão #11 (logs estruturados, sem alarms) — sem framework de log estruturado, só verificamos `console.warn` raw | Baixa | Aceito como dívida. Em fase 2 quando houver `pino`/`winston`, testar shape do log JSON. |
| R15 | **Decisão #12 (retenção 365 dias)** — sem job de purge implementado, sem teste possível | Baixa | Out-of-scope MVP. Marcar no plano fase 2. |

---

## Apêndice A — Inventário de arquivos sob teste

| Caminho absoluto | Linhas | Coberto por |
|---|---|---|
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/types.ts` | 155 | §3.x (tipos validados indiretamente) |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/adapter.ts` | 83 | §3 (interface — sem código exec) |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/noop-adapter.ts` | 47 | §3.5 |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/letta-client.ts` | 121 | §3.4 (unit) |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/letta-adapter.ts` | 370 | §3.9 (unit) + §4 (integration) |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/index.ts` | 92 | §3.6 |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/identity.ts` | 96 | §3.1 |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/extractor.ts` | 160 | §3.2 |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/reactivation.ts` | 118 | §3.3 |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/reconciler.ts` | 55 | §3.8 + §4 (integration) |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/memory/orchestrator-bridge.ts` | 151 | §3.7 |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/agent/orchestrator/index.ts` (linhas 140-186) | — | §6 (E2E indireto) |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/app/api/chat/route.ts` | 329 | §6 (E2E-01, E2E-02) |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/lib/web/adapter.ts` | (4 pipes) | §6 (cobertura indireta via fluxo E2E) |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/src/db/schema.ts` (`memory_events`) | — | §5 (skip MVP) |
| `/Users/kairo/.superset/worktrees/tb-aja-agora/nebula-submarine/drizzle/0009_parallel_dust.sql` | — | §5 (skip MVP) |

## Apêndice B — Mapeamento ADR → testes

| Decisão ADR | Onde é testada |
|---|---|
| 1. Sidecar via REST | §3.4 `lettaFetch` + §4 todos |
| 2. Phone E.164 + cookie 90d | §3.1 `normalizePhoneBR` + §6 E2E-01 (Max-Age=7776000) |
| 3. Merge anônimo→identificado | §3.9 + §4 (`reconcileIdentity`); E2E **fica fase 2** (R10) |
| 4. Extração via heurística | §3.2 inteira |
| 5. Archival memory desde já | §4 (`storeMemories` archival round-trip) |
| 6. Reativação por `daysSinceLastInteraction` | §3.3 `buildReactivationHint` (todos os branches) |
| 7. Namespace `aja-agora-<env>-...` | §3.1 `getNamespace`, §4 todos (namespace dedicated por test) |
| 8. Adapter pattern + circuit breaker | §3.6 inteira |
| 9. PII permitida no Letta | §3.2 (lead capture popula `name`+`phone`) + §4 round-trip |
| 10. Timeout circuit breaker 2s | §3.4 `lettaFetch` timeout (default 2000), §3.9 loadContext timeout |
| 11. Logs estruturados sem alarms | parcial: §3.x asserta `console.warn` raw (R14 — dívida) |
| 12. Retenção 365 dias | **fora do escopo** (R15) |
| 13. Lazy create após N=3 turnos | §3.1 `shouldCreateAnonAgent` + §3.7 `resolveIdentityForTurn` + §6 E2E-03/04 |
| 14. Store fire-and-forget | §3.7 `storeMemoriesForTurn` (swallow) + §6 E2E (sleep antes de assertar — R1) |

---

**Fim do documento**. Próximos passos sugeridos ao agent executor:
1. Criar `src/lib/memory/__fixtures__/` antes de qualquer test.
2. Implementar §3.1 → §3.2 → §3.3 (puros) primeiro, sem deps.
3. Implementar §3.4 (mock fetch/dns).
4. Subir Letta local e implementar §4.
5. Implementar §3.6 e §3.7 com mocks já validados.
6. Por fim §6 E2E (mais frágil — escrever depois que tudo está verde).

# QA Suggestions — Letta Memory Suite (2026-05-16)

> Observações encontradas durante a implementação da suite de testes. Não são bugs críticos
> — todas têm workaround no teste. Listo aqui pra avaliação futura.

## 1. `normalizePhoneBR` aceita phone US como BR sintético

**Onde**: `src/lib/memory/identity.ts:34-46`

**Reprodução**: `normalizePhoneBR("+1 415 555 0000")` retorna `"+5514155550000"` em vez de `null`.

**Por quê**: a função extrai todos os dígitos, drop "55" se presente no início, e aceita 11
dígitos restantes — não valida que os 2 primeiros sejam um DDD válido brasileiro.

**Impacto real**: usuário estrangeiro digitando seu phone seria mapeado pra um agent Letta
com formato BR sintético — provavelmente nunca encontrado novamente porque o usuário não
volta. Risco baixo, mas viola o cenário **PO-009** literalmente.

**Sugestão**: validar DDD contra whitelist BR (11-99 minus alguns inexistentes) OU rejeitar
qualquer phone que não começa com "55" + 10/11 dígitos restantes. PR pequeno (5 linhas).

---

## 2. `MEMORY_ADAPTER` env vazio (`""`) é tratado diferente de ausente

**Onde**: `src/lib/memory/index.ts:23` — `const choice = (process.env.MEMORY_ADAPTER ?? "letta").toLowerCase()`

**Reprodução**: `vi.stubEnv("MEMORY_ADAPTER", "")` resulta em `choice = ""`, que cai na branch
"unknown" e dispara warn. Mas `delete process.env.MEMORY_ADAPTER` funciona como esperado
(default "letta").

**Impacto real**: zero — ninguém seta env como string vazia explicitamente. Mas o teste que
queria validar "env ausente" precisou usar `delete process.env.X` em vez de `stubEnv("", "")`.

**Sugestão**: usar `choice || "letta"` em vez de `??` pra tratar string vazia como ausente
também. Trivial.

---

## 3. `vitest.setup.ts` carrega `.env` mas não `.env.local`

**Onde**: `vitest.setup.ts:1-8`

**Reprodução**: rodar `npm test -- src/lib/memory/observability.integration.test.ts` direto
sem `set -a && . .env.local` resulta em `DATABASE_URL environment variable is not set`.

**Por quê**: o setup só faz `loadEnvFile(".env")`. Como `.env.local` é o que tem `DATABASE_URL`
e `LETTA_BASE_URL` no projeto, integration tests precisam de `source .env.local` manual.

**Impacto real**: DX prejudicada. Todo teste integration exige um wrapper de comando.

**Sugestão**: adicionar carga de `.env.local` no `vitest.setup.ts` com fallback silencioso
(mesma estratégia do `.env`):

```ts
try { loadEnvFile(".env.local"); } catch { /* opcional */ }
```

Ordem importa: `.env.local` deve ser carregado **depois** de `.env` (sobrepõe), seguindo a
convenção Next.js.

---

## 4. Integration test de `searchArchival` semantic às vezes falha por embedding cold start

**Onde**: `src/lib/memory/letta-adapter.integration.test.ts:228-249`

**Reprodução**: rodar a suite num Letta fresco (sem ter feito nenhuma `insertArchival` antes
na sessão atual). O `searchArchival` pode retornar `[]` mesmo após `storeMemories` ter
"sucesso" — porque o embedding ainda não foi processado pelo OpenAI nos ~2s entre store e search.

**Impacto real**: teste flaky. Em 5 runs locais, vi 1 falha. Quando rodado depois de outros
integration tests (cache quente do embedding model), passa estável.

**Sugestão**:
- Adicionar `beforeAll` que faz 1 dummy `insertArchival` + `searchArchival` pra "esquentar"
  o modelo de embedding (já documentado no plano §10/R3).
- OU adicionar retry com backoff de 1s no teste (3 tentativas).

Não corrigi no patch porque é mais arquitetura de test runner que código sob teste.

---

## 5. `noop-adapter` retorna `loadContext = null` — alinhado com docstring, mas pode confundir

**Onde**: `src/lib/memory/noop-adapter.ts:19-21`

**Observação**: a docstring diz "retorna `null`/`[]` em vez de throw — o orchestrator trata
como 'sem memória' e segue". Funciona. Mas seria mais limpo retornar um `MemoryContext` com
`block` vazio em vez de `null`, pra que `memorySystemMessageFromContext` lide com tudo
uniformemente. Hoje há 2 lugares de short-circuit: `loadMemoryContextForTurn` chega cedo, e
`buildMemorySystemMessage(null)` chega depois.

**Impacto real**: baixíssimo. Vale só revisitar quando refatorar a camada.

---

## 6. `getNamespace()` retorna string vazia quando `LETTA_NAMESPACE=""` em vez de fallback

**Onde**: `src/lib/memory/identity.ts:19-21`

**Reprodução**: setar `LETTA_NAMESPACE=""` (string vazia, não undefined) faz `getNamespace`
retornar `""` em vez do default `"aja-agora-local-default"`. O agent acabaria criado com nome
tipo `"-phone-5511987654321"` — provavelmente quebra Letta validation.

**Sugestão**: trocar `?? default` por `|| default` (idêntico ao item #2).

---

## 7. Sugestão de hardening: trackear agents criados em integration test centralizado

**Status**: implementado workaround no teste, mas pode virar fixture.

Hoje cada integration test `letta-adapter.integration.test.ts` adiciona `agentId` ao Set
`createdAgentIds` manualmente. Se um test esquecer, o cleanup do `afterAll` filtra por
namespace via `?tags=...` — funciona, mas tem risco de drift entre namespaces e agents.

**Sugestão**: criar um helper `trackAgent(adapter, identity)` que wrappa todas as chamadas
de `loadContext`/`storeMemories` e adiciona automaticamente o `agentId` ao set. Reduz erro
humano. (Fora do escopo deste PR — sugestão pra fase 2 da suite.)

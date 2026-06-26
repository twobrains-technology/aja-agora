---
id: FIX-81
titulo: "Remove o Letta e re-homeia a memória pro Postgres (executa a Opção B do ADR FIX-80)"
status: todo
bloco: bloco-a-remove-letta-postgres
arquivos:
  - src/lib/memory/adapter.ts
  - src/lib/memory/postgres-adapter.ts
  - src/lib/memory/index.ts
  - src/lib/memory/inspect.ts
  - src/lib/memory/extractor.ts
  - src/lib/memory/reactivation.ts
  - src/lib/memory/reconciler.ts
  - src/db/schema.ts
  - drizzle/
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/lead-collection.ts
  - src/app/api/admin/simulator/sessions/[id]/memory/route.ts
rodada: "2026-06-26 — Kairo autorizou a EXECUÇÃO da remoção do Letta (após estudo FIX-80)"
---
# FIX-81 — Remover o Letta, re-homear a memória pro Postgres

## Palavras do Kairo
> "lance a remoção do leta em /todo-blocks" (2026-06-26). A decisão de remover já
> estava tomada ("o leta vai ser removido", 2026-06-25). Esta é a EXECUÇÃO da
> Opção B do ADR — não mais estudo.

## Root cause (já investigado — ADR FIX-80)
Ver `docs/correcoes/decisions/2026-06-25-remocao-letta-postgres.md` (PLANO COMPLETO).
Veredito: **OVERKILL do Letta, não da memória**. O Letta é usado como KV-store REST
caro (~2.131 LOC + container ECS + Cloud Map SRV + dependência OpenAI já quebrada),
guardando um blob `jsonb` keyed por identidade que o app já produz localmente
(`extractor.ts`, sem LLM). Archival semântico está MORTO (OpenAI 429) sem impacto de
UX. Nada quebra sem Letta (degrada limpo: read-side nunca dá throw, write-side é
fire-and-forget, factory cai pra Noop).

## Correção (Opção B do ADR — executa)
Re-home pro Postgres **atrás da interface `MemoryAdapter` existente** (corte limpo):
1. **Migration + schema:** nova tabela `memory_identities` (1 linha `jsonb` por
   identidade — phone/cookie-hash como chave; colunas mínimas: id/identity_key/
   block `jsonb`/channels/updated_at). Gerar via `pnpm db:generate`, versionada em
   `drizzle/`.
2. **`PostgresMemoryAdapter`** (substitui o stub atual de `postgres-adapter.ts` por
   implementação real) que cumpre `MemoryAdapter` byte-a-byte no comportamento:
   `loadContext`/`storeMemories`/`purgeIdentity`/`reconcile`. O `extractor` já produz
   o `blockPatch` → `INSERT ... ON CONFLICT (identity_key) DO UPDATE` atômico
   (`jsonb_strip_nulls(block || patch)` + union de `channels`) — substitui o
   read-modify-write remoto + lock anti-race do Letta por 1 statement transacional.
   Archival semântico fica fora desta fase (já está morto; pgvector é fase 2 do ADR).
3. **Cutover do factory** (`src/lib/memory/index.ts`): `getMemoryAdapter()` passa a
   devolver `PostgresMemoryAdapter` (mantém `NoopMemoryAdapter` como fallback de
   teste). Remover o circuit-breaker específico do Letta se não fizer mais sentido
   (Postgres local não tem a mesma falha de rede; manter o contrato best-effort).
4. **Inspector admin** (`src/lib/memory/inspect.ts:93`): hoje instancia
   `new LettaMemoryAdapter()` DIRETO (único call-site acoplado à concreta). Trocar
   por `getMemoryAdapter()`/novo adapter pra não quebrar a inspeção.
5. **Remover o Letta:** apagar `LettaMemoryAdapter`, `letta-client`, parsing de
   shapes da API Letta, e o que for órfão. Remover env `LETTA_*` do `.env.example`/
   docs e a dependência do compose/infra **só na parte do app** (NÃO derrubar o
   `tb-letta-shared` compartilhado com outros projetos — fora do escopo deste repo).
   Atualizar `MEMORY_ADAPTER` default.

## Regressão exigida (TDD strict — o comportamento observável NÃO pode mudar)
- **Integration-db (DB real):** `PostgresMemoryAdapter` — `storeMemories` grava o
  block; `loadContext` lê o mesmo `MemoryContext` (assert de valor, não shape);
  `reconcile` migra identidade web(cookie)→phone preservando o block; `purgeIdentity`
  remove. Reusar/portar os cenários que hoje cobrem reactivation/reconciler.
- **Contrato best-effort:** adapter falha → app não quebra (read-side retorna null,
  write-side não derruba turno) — porta o invariante do `LettaMemoryAdapter`.
- **Não-regressão de comportamento:** o `[CONTEXTO DO USUÁRIO]`/`[REATIVAÇÃO]` gerado
  a partir do block Postgres é idêntico ao que o extractor produzia (mesma projeção
  determinística). Cassette NÃO necessário (não é comportamento de LLM — é backend de
  memória); structural + integration-db cobrem.
- **Gate:** typecheck + test:unit verdes; integration tests do memory verdes contra DB.

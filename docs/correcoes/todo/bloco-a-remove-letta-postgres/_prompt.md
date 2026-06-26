Você é o executor do bloco `bloco-a-remove-letta-postgres` no worktree isolado deste branch (`feat/memoria-postgres-remove-letta`). PT-BR. Operador: Kairo (comunicação direta).

## Contexto
Você vai EXECUTAR a remoção do Letta e re-home da memória pro Postgres. O estudo, o veredito e o PLANO COMPLETO já existem — não re-estude:
- **ADR/plano:** `docs/correcoes/decisions/2026-06-25-remocao-letta-postgres.md` (Opção B é a escolhida — leia inteiro, é o seu blueprint).
- **Item:** `docs/correcoes/todo/bloco-a-remove-letta-postgres/fix-81-implementa-postgres-memory-adapter.md` (root cause + correção + regressão exigida).
- **Stub de referência:** `src/lib/memory/postgres-adapter.ts` (já existe um esboço — torne-o real).
- **Regras de regressão do projeto:** `CLAUDE.md` (§ Regressão de agent — mas ATENÇÃO: este NÃO é bug de agente/LLM, é backend de memória → NÃO precisa cassette Camada 2; precisa integration-db + structural).

## Passos
1. Leia o ADR e o fix-81 inteiros. Leia a interface `src/lib/memory/adapter.ts` e o `LettaMemoryAdapter` atual pra entender o contrato exato a preservar.
2. **DESIGN:** o ADR já fixou a decisão (Opção B). NÃO refaça brainstorming — o design está fechado. Se topar com uma decisão NÃO coberta pelo ADR (ex: nome exato de coluna, índice), decida como sênior, cite "escolhi X porque Y", e siga. Não trave.
3. **TDD strict** (o comportamento observável da memória NÃO pode mudar):
   - Escreva PRIMEIRO os integration tests do `PostgresMemoryAdapter` (tocam DB real): store→load idempotente (assert de VALOR do MemoryContext), reconcile web(cookie)→phone preservando o block, purge. Veja-os FALHAR.
   - Implemente a migration (`pnpm db:generate` → migration versionada em `drizzle/`) + o adapter real + cutover do factory + troca do inspector (`inspect.ts` não pode mais instanciar `LettaMemoryAdapter`).
   - Veja os testes passarem.
   - Remova o Letta (LettaMemoryAdapter, letta-client, parsing de shapes, circuit-breaker se órfão, env `LETTA_*` em `.env.example`/docs). **NÃO** derrube o container `tb-letta-shared` (é shared com outros projetos — fora do escopo do repo).
4. **Gate local com PG:** os testes-DB precisam de Postgres. Suba um efêmero e migre:
   `docker run -d --name aja-pg-fix81-test -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=aja_test -p 55440:5432 postgres:16-alpine`
   `DATABASE_URL=postgres://test:test@localhost:55440/aja_test pnpm db:migrate`
   Rode `DATABASE_URL=... pnpm -s typecheck && DATABASE_URL=... pnpm -s test:unit` e os integration tests do memory (`DATABASE_URL=... pnpm exec vitest run src/lib/memory/`). Tudo verde. Remova o container no fim (`docker rm -f aja-pg-fix81-test`).
5. **1 commit Conventional por unidade lógica** (PT-BR): ex `test+feat: PostgresMemoryAdapter com store/load/reconcile/purge`, `refactor: cutover do factory de memória pro Postgres`, `chore: remove LettaMemoryAdapter e client órfãos`. Teste primeiro, fix depois.
6. Ao concluir: MOVA o `fix-81` pra `docs/correcoes/done/` (status: done + commit + executado_em). Apague a pasta do bloco se esvaziar (o orquestrador também reconcilia, mas faça como best-effort).
7. **PUSH da branch** (`git push origin feat/memoria-postgres-remove-letta`) + gere `.done/{data}-bloco-a-remove-letta-postgres.md` (resumo de negócio + decisões + testes + gaps/riscos honestos — ex: archival semântico saiu, é fase 2).
8. **NÃO** abra PR, **NÃO** faça merge, **NÃO** rode deploy/restart, **NÃO** mexa em infra de prod. A integração na base é do orquestrador. A tag-sentinela de conclusão é injetada automaticamente.
9. RESUMO FINAL: liste as decisões de design que você tomou ("decidi X em vez de Y porque Z"), e qualquer gap/risco.

Riscos a vigiar: preservar a continuidade web→WhatsApp (reconcileIdentity) — é o que mais importa pro produto; cobrir com teste. Não mudar o `MemoryContext` que o orchestrator consome (agnóstico ao backend). O inspector admin é dev-only (404 em prod) mas não pode ficar quebrado em compile.

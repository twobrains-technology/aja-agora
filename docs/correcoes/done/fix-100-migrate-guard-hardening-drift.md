---
id: FIX-100
titulo: "Endurecer migrate-guard pra detectar drift (count vs presença real da tabela)"
status: done
bloco: bloco-g-infra-teste
arquivos:
  - scripts/migrate-guard.mjs
  - tests/regression/migrate-guard.test.ts
rodada: 2026-06-28 — mutirão inbox (qa-noturno 21/06 + infra 24-26/06 + jornada 28/06)
commit: a0c671f4
executado_em: 2026-06-28
---

## Resolução (2026-06-28)

**Escopo executado (código):** endurecer o `migrate-guard.mjs` pra detectar
drift, conforme item 3 de "Ação" no card. **NÃO executado** (blast radius de
infra, PENDENTE-KAIRO — ver abaixo): itens 1-2 (verificar/reconciliar
`__drizzle_migrations` de PROD). Nenhuma migration rodou contra banco nenhum
nesta sessão (só contra o Postgres efêmero do meu próprio workspace de dev).

- **`detectDrift(pendingFiles, existingTables)` nova** em
  `scripts/migrate-guard.mjs`: cruza o `CREATE TABLE [IF NOT EXISTS]` de cada
  migration "pendente" (pelo count) com `information_schema.tables` do schema
  real. Se a tabela já existe → drift confirmado (aplicada via push/dump sem
  registro no journal) — reaplicar quebraria com `relation already exists`.
- **`main()` chama o check ANTES de tentar `migrate()`**: acha drift → aborta
  com diagnóstico claro (arquivo + tabela + explicação), **sempre** (dev e
  prod — não é risco a ponderar como as heurísticas destrutivas existentes,
  é uma falha garantida do `migrate()` a seguir). `getExistingTables()` falha
  (DB down) → `null` → pula o check (não bloqueia o boot por uma consulta
  auxiliar).
- **TDD**: 5 testes novos em `tests/regression/migrate-guard.test.ts`
  (`describe("migrate-guard — detectDrift...")`) cobrindo o cenário exato do
  card (0022 "pendente" com tabela já existente), case-insensitivity,
  `IF NOT EXISTS`, e não-falso-positivo em `ALTER TABLE`. Vistos falhar
  (`detectDrift is not a function`) antes da implementação. 13/13 verde
  depois. Smoke real: `node scripts/migrate-guard.mjs` contra o Postgres do
  meu workspace (schema já migrado, sem drift) → `OK — schema atualizado`,
  sem falso-positivo.
- **Nota de path**: o frontmatter original apontava
  `scripts/migrate-guard.test.ts` — o arquivo real é
  `tests/regression/migrate-guard.test.ts` (já existia, com os testes do fix
  de 2026-06-13); os novos testes foram ao lado dos existentes ali.

## PENDENTE-KAIRO (não-código, blast radius de infra — NÃO executado)

1. Verificar `select count(*) from drizzle.__drizzle_migrations` no **RDS de
   PROD** vs o idx esperado (27, antes da 0027) — item 1 do card original.
2. Se divergir, reconciliar `__drizzle_migrations` de prod ANTES de deployar
   o FIX-81 (inserir os registros faltantes das migrations já aplicadas, de
   forma idempotente/auditada — **nunca DDL solto na mão**, regra global de
   migrations).
3. Com o `detectDrift` agora ativo, se prod estiver inconsistente o deploy do
   FIX-81 vai **abortar no boot com o diagnóstico claro** (em vez do
   `relation already exists` genérico) — o que já é uma melhoria de sinal,
   mas a reconciliação em si continua exigindo ação humana no RDS de prod.

# Risco de DEPLOY (INFRA/MIGRATION — não é bug de runtime do app) — `__drizzle_migrations` inconsistente com o schema: migrate-guard por count pode quebrar o deploy da migration 0027 (FIX-81)

- **Natureza:** **INFRA / MIGRATION** — risco de **release/deploy**, NÃO bug de comportamento do app. NÃO bloqueia dev/QA local (já desbloqueado à mão), mas pode **travar o deploy do FIX-81 em prod** no boot.
- **Data:** 2026-06-26 (descoberto ao integrar o FIX-81 — remoção do Letta / re-home da memória pro Postgres; dev local `aja-pg-develop`)
- **Severidade (HIPÓTESE não-cravada):** **ALTA pro deploy** — DEPENDE do estado real do `__drizzle_migrations` de prod, que **NÃO foi verificado**. Se prod estiver consistente, aplica limpo; se inconsistente como o dev, quebra o boot.
- **STATUS:** **PENDENTE-KAIRO** — verificar estado de prod e reconciliar ANTES de deployar o FIX-81.

## Cenário / Evidência (dev local `aja-pg-develop`)
- O `scripts/migrate-guard.mjs` decide o que aplicar por **COUNT**: `appliedCount = count(*)` em `drizzle.__drizzle_migrations`; entries do journal com `idx >= appliedCount` são tratadas como pendentes (`selectPendingTags`, `migrate-guard.mjs:70`).
- No dev DB: `__drizzle_migrations` tem **22 registros** (última de 2026-05-19), mas o `drizzle/meta/_journal.json` tem **28 tags** (0000–0027). E o schema do dev **JÁ TEM** as tabelas das migrations 0022+ (`mesa_attendants`, `administradoras` existem) → ou seja, **0022–0026 foram aplicadas em algum momento via `drizzle-kit push` (ou dump) SEM registrar no `__drizzle_migrations`**.
- **Consequência:** o migrate-guard calcularia **6 "pendentes"** (idx 22–27 = 0022..0027) e tentaria **RE-aplicar 0022–0026** (tabelas que já existem) → falha `relation already exists` **ANTES** de chegar na 0027. A `memory_identities` (0027) do FIX-81 **não foi criada pelo boot** por isso — foi preciso aplicar a `0027.sql` à mão no dev local pra desbloquear o QA.

## Dívida relacionada (citar — `drizzle-kit generate` quebrado)
O comentário da própria `drizzle/0027_memory_identities.sql` diz: *"drizzle-kit generate está quebrado no repo (snapshots meta 0014+ nunca foram commitados); migrate usa journal + .sql"*. A 0027 foi escrita **à mão** por causa disso. Snapshots `meta/` 0014+ ausentes = causa de fundo da fragilidade do pipeline de migration.

## Risco real (deploy do FIX-81 em prod)
O deploy do FIX-81 roda o migrate-guard no boot do container:
- **SE** o `__drizzle_migrations` de prod estiver **consistente** (27 registros = todas as anteriores aplicadas via migrate) → a 0027 aplica limpa, tudo bem.
- **SE** prod estiver **inconsistente como o dev** (count < idx real, por push/dump no passado) → o migrate-guard tenta re-aplicar migrations já existentes → **quebra no boot**.

## Ação (PENDENTE-KAIRO — ANTES de deployar o FIX-81)
1. Verificar `select count(*) from drizzle.__drizzle_migrations` no **RDS de prod** vs o idx esperado (**27** antes da 0027).
2. Se divergir → **reconciliar** o `__drizzle_migrations` (inserir os registros faltantes das migrations já aplicadas) ANTES do deploy, de forma idempotente/auditada (NUNCA DDL solto na mão contra o banco — regra de migrations: roda no ambiente, não no host).
3. Considerar endurecer o migrate-guard pra detectar este drift (count vs presença real da tabela) em vez de confiar só no count.

## Tratamento / Regressão
NÃO é bug de agente → **sem cassette Camada 2**. É infra de migration: documentar como **risco de release** + a sub-tarefa de verificação do estado de prod como gate do deploy do FIX-81. Se o migrate-guard for endurecido, Camada 1 structural cobre a nova lógica de detecção de drift.

## Cross-ref
- **FIX-81** (remoção do Letta / re-home pro Postgres — `done`) — esta migration 0027 (`memory_identities`) é o artefato de schema do FIX-81.
- **ADR de remoção do Letta** (`docs/correcoes/decisions/`) — registrar este risco de deploy como nota de release no ADR.
- `2026-06-25-remover-letta-rehome-memoria-postgres.md` (card original do refactor).

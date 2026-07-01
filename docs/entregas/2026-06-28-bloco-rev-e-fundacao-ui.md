---
titulo: "Bloco rev-e — revisão adversarial da fundação (schema/Drizzle + storage + UI/infra)"
data: 2026-06-28
bloco: bloco-rev-e-fundacao-ui
branch: rev/fundacao-ui
modelo: Opus 4.8 (1M)
tipo: revisão adversarial (onda "modelo errado")
---

# Bloco rev-e — Fundação (schema/Drizzle, storage, middleware, workers, telemetry, validations, email, pdf, landing, ui, brand, onboarding)

Auditoria adversarial da área de fundação, escrita por sessões Superset que rodaram
com modelo fraco. Foco crítico: **meta do Drizzle quebrado** (FIX-100), que bloqueava
`db:generate` e travava a onda inteira.

## TL;DR

- **3 bugs corrigidos** (1 crítico, 1 de lógica, 1 de ortografia), cada um com commit Conventional PT-BR.
- **Meta do Drizzle reconstruído e PROVADO rodando**: `db:generate` voltou a gerar diff vazio; `db:migrate` aplica limpo numa base zerada.
- **Gate verde**: `pnpm test:unit` = 186 arquivos / **1947 testes passando**, num container com Postgres migrado.
- O grosso da área estava **limpo** — bem diferente do caos esperado. As subáreas verificadas sem bug estão listadas abaixo (cobertura explícita).

---

## Bug 1 (CRÍTICO) — meta do Drizzle corrompido → `db:generate` inutilizável

**Commit:** `72cf29f6 test+fix: reconstrói meta do Drizzle p/ destravar db:generate`

**Evidência do defeito:**
- `drizzle/meta/0011_snapshot.json`, `0012`, `0013` tinham o **mesmo `id`** (`d12d60bd-62d3-441b-b018-f4f96193f1dd`) e o **mesmo `prevId`** (`0635a4db…` = id do 0010) → colisão de cadeia.
- Snapshots **0014–0028 AUSENTES** (o `_journal.json` tinha 29 entries, mas `meta/` só tinha até 0013).
- `pnpm db:generate` abortava com: `Error: [drizzle/meta/0011_snapshot.json, 0012, 0013] are pointing to a parent snapshot ... which is a collision.`
- Consequência: migrations recentes (incl. `0028_chat_mesa_last_inbound_at`) foram escritas à mão, e qualquer nova feature de schema travava a onda.

**Como foi reconstruído (com fidelidade, não congelado):**
- `0011–0013`: o conteúdo já estava **correto** (ex.: 0013 já tinha `wa_id varchar(50)`) — só os **ids** foram reescritos e re-encadeados.
- `0014–0027`: reconstruídos por **introspect incremental** — apliquei cada migration `.sql` numa base Postgres limpa e rodei `drizzle-kit pull` após cada uma, capturando o estado REAL do schema naquele ponto (a evolução de tabelas confere: 13 → 14 em `0022_bevi_fulfillment`, → 15 em `0024_contacts_unified`, → 20 em `0026_mesa_operacao`, → 21 em `0027_memory_identities`).
- `0028`: gerado pelo `drizzle-kit generate` do **schema TS atual** — garante que `db:generate` produza diff vazio (schema == último snapshot).
- Cadeia final: **29 snapshots, 29 ids únicos, prevId encadeado** (validado por script).

**PROVA (rodando em container com Postgres real):**
1. `db:generate` → **"No schema changes, nothing to migrate 😴"** (diff vazio, sem colisão).
2. Teste adversarial: injetei coluna fake no schema → `generate` produziu corretamente `ALTER TABLE "leads" ADD COLUMN "zz_probe_col" text;` → prova que está FUNCIONAL, não "vazio por acaso". Revertido.
3. `db:migrate` numa base **zerada** pós-reconstrução → `migrations applied successfully!` (o migrator do drizzle-orm usa journal + `.sql`, não os snapshots — por isso a reconstrução não afeta o migrate).
4. `drizzle-kit push --verbose` contra a base migrada → **nenhuma tabela/coluna faltando** (só renomeia 1 constraint cosmética, ver observação abaixo).

**Regressão (Camada 1 structural):** `src/db/meta-integrity.test.ts` — trava: 1 snapshot por entry do journal, ids únicos (sem colisão), cadeia prevId→id encadeada. Vi FALHAR no estado quebrado (3/4) e PASSAR no consertado (4/4).

## Bug 2 (lógica) — `ensureBucket()` não-idempotente em corrida

**Commit:** `26a25055 test+fix: torna ensureBucket idempotente em corrida de criação`

**Evidência:** `src/lib/storage/index.ts:74-81` — o catch do `CreateBucketCommand` re-lançava QUALQUER erro (`throw err` incondicional), apesar do comentário "corrida (outro request criou) é benigna — só re-lança se ainda não existe". Em corrida de primeiro upload (2 requests → HeadBucket falha nos dois → ambos chamam CreateBucket), o segundo recebe `BucketAlreadyOwnedByYou`/`BucketAlreadyExists` e o `putObject` falhava com 500 mesmo com o bucket já existindo. Severidade baixa (em prod os buckets são pré-provisionados → HeadBucket passa), mas contradizia a idempotência documentada.

**Fix:** trata `BucketAlreadyOwnedByYou`/`BucketAlreadyExists` como sucesso (`return`); demais erros (ex.: `AccessDenied`) continuam re-lançados e logados.

**Regressão:** `src/lib/storage/ensure-bucket.test.ts` — 4 casos (2 de corrida benigna resolvem; erro real re-lança; criação OK resolve). Vi FALHAR (2/4) antes do fix, PASSAR (4/4) depois.

## Bug 3 (ortografia PT-BR) — "máximo" sem acento

**Commit:** `a317aae9 fix: acentua "máximo" na validação de senha do onboarding`

**Evidência:** `src/app/onboarding/set-password/set-password-form.tsx:18` — mensagem de validação Zod "Senha deve ter no maximo 128 caracteres" (defeito de entrega pela regra inviolável de ortografia). Corrigido para "no máximo". Typo de copy → dispensa teste (regra global).

---

## Cobertura de auditoria (subáreas SEM bug — verificadas explicitamente)

Varredura por: `require("@/")` em runtime, API de lib inventada (drizzle/zod/AWS SDK/sendgrid), `await` faltando, catch vazio, condição invertida, secret hardcoded, schema↔migration desalinhado, ortografia PT-BR.

- **`src/db/schema.ts`** — alinhado 1:1 com as migrations (`drizzle-kit push` não acha tabela/coluna faltante). Sem coluna órfã.
- **`src/lib/storage/`** — `minioadmin` NÃO é secret hardcoded: está gateado a `endpoint ? "minioadmin" : undefined`, ou seja, só MinIO local; em AWS real (sem `S3_ENDPOINT`) cai em `undefined` → cadeia padrão do SDK = **task role do ECS** (correto). APIs AWS SDK v3 todas reais. Sem bucket público, sem URL pré-assinada longa (não usa presigner).
- **`src/lib/middleware/rate-limit.ts`** — token bucket correto, `setInterval` com `unref`. Sem bug.
- **`src/lib/workers/proposal-status-poll.ts`** — drizzle correto (`eq(col,x)`, `and/lt/notInArray`, `db.query…findFirst`), todos os `await` presentes, try/catch por linha sem engolir, BullMQ/ioredis via import dinâmico (nome de pacote, não alias `@/`). Sem bug.
- **`src/lib/telemetry/turn-trace.ts`** — best-effort respeitado: sink em try/catch, finaliza no `finally`, Proxy protege `recordUIPart`. Nada bloqueante no caminho crítico. Sem bug.
- **`src/lib/validations/*`** (attendant, lead, mesa, persona, persona-patch) — sem API Zod inventada; usos deprecados do Zod v4 continuam funcionais; `normalizePhoneBR` sem duplo-prefixo `55`. Sem bug.
- **`src/lib/email/sendgrid.ts`** — `import sgMail from "@sendgrid/mail"` (default correto v8), try/catch. Nota menor (não-bug): loga e-mail do destinatário (PII em log) — endurecer pós-piloto.
- **`src/lib/pdf/extract.ts`** — `getDocumentProxy` + `extractText(..., { mergePages: true })` retornando string; APIs unpdf reais. Sem bug.
- **`src/components/landing/**`, `src/components/brand/**`, `src/components/ui/**` (39), `src/app/onboarding/**`, `src/lib/email/templates/**`** — varredura ortográfica PT-BR completa + grep cruzado por acentos faltando: **0 erros além do "máximo" corrigido**.

---

## PENDENTE-REV-E consolidado (das 3 features que precisavam de migration)

Fonte: `docs/correcoes/inbox/2026-06-28-develop-quebrada-drizzle-meta-bloqueia-onda.md`.

1. **chat-mesa `last_inbound_at`** → ✅ **RESOLVIDO**: `drizzle/0028_chat_mesa_last_inbound_at.sql` existe e o schema TS (`conversations.lastInboundAt`) está alinhado (push confirma).
2. **documentos `client_documents`** → **não acionável nesta base**: a tabela NÃO existe no `schema.ts` nem há código referenciando (`grep client_documents` = 0). A feature "documentos" não foi mergeada nesta branch. Agora que `db:generate` voltou, o bloco que adicionar `client_documents` ao schema gera a migration normalmente.
3. **fechamento (Bevi)** → ✅ alinhado: `0022_bevi_fulfillment` / `0023_bevi_term_months` cobrem o schema atual de `bevi_proposals` (push confirma).

**Blocos rev-a..d (onda atual):** rodam em paralelo em branches isoladas (`rev/agente-nucleo`, `rev/jornada-bevi`, `rev/mesa-kanban`, `rev/whatsapp-chat`); seus `.done`/PENDENTE-REV-E **não estavam visíveis neste worktree** no fechamento. A verificação definitiva (`drizzle-kit push` contra base migrada) **não achou nenhuma coluna/tabela no schema sem migration** — então, no estado atual do schema, não há migration faltante. Se algum desses blocos reportar PENDENTE-REV-E ao integrar, o orquestrador deve re-disparar o rev-e (com `db:generate` já funcional, gerar a migration é trivial).

---

## PENDENTE-KAIRO (blast-radius alto — não executado)

- **Observação de drift cosmético (não-bug):** a FK `conversation_evaluations_evaluated_until_message_id_messages_id` foi criada por migration histórica **sem** o sufixo `_fk`, enquanto o schema TS (e o snapshot 0028) usam `..._fk`. `db:generate` dá vazio (compara TS↔snapshot, ambos com `_fk`); a divergência só existe entre o DB real e o snapshot. Alinhar exigiria uma migration de rename (DROP/ADD constraint) — o `migrate-guard` sinaliza DROP CONSTRAINT como destrutivo em prod. Risco > benefício (FK funciona igual, só o nome difere). **Deixado documentado; não corrigido** para não introduzir migration destrutiva por estética.
- **Storage S3 prod (bucket PII / KMS / TTL):** o código usa task role corretamente. Conforme memória `project_aja_s3_storage_provisionado`, buckets+roles+taskdef dev/prod já provisionados. Recomendação para hardening pós-piloto (decisão do Kairo): bucket dedicado a PII com SSE-KMS e, se vier a usar URL pré-assinada para documentos, TTL curto.

---

## Como validei (ambiente)

Container transitório `node:22-alpine` (pnpm via store compartilhado `tb-pnpm-store-shared`, sem instalar no host — regra) + `postgres:16-alpine` na mesma rede docker. `db:migrate`/`db:generate`/`drizzle-kit pull`/`push` e `pnpm test:unit` rodados lá dentro contra Postgres real migrado. Nenhuma migration rodada na mão contra banco real (só container).

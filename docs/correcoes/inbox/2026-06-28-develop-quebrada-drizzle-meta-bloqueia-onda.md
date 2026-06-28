---
slug: develop-quebrada-drizzle-meta-bloqueia-onda
titulo: "Desbloquear migrations (drizzle meta collision) — develop quebrada, onda jornada-pos-descoberta travada"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-06-28 — to-saindo, integração da onda jornada-pos-descoberta
relacionado: FIX-100 (bloco-g-infra-teste, migrate-guard-hardening-drift)
---

## Palavras do operador
> "continue e resolva tudo, veja o que aconteceu e se vire. faça rodada de qa-autonomo assim que mergeado."

## Cenário
- `pnpm test:unit` na develop: **12 testes falham** com `column "last_inbound_at" of relation "conversations" does not exist`.
- O bloco-b (chat-mesa, mergeado na develop — `09b30d63`) adicionou `lastInboundAt` ao `schema.ts` (linha 223) **sem migration** (última migration é `0027`; nenhuma `*.sql` tem `last_inbound_at`).
- O agente do chat-mesa NÃO conseguiu gerar a migration porque o `db:generate` está quebrado.

## Root cause (INVESTIGADO — cravado)
**`drizzle/meta` corrompido (collision de snapshots), pré-existente.** `db:generate` aborta com:
`drizzle/meta/0011_snapshot.json, 0012, 0013 are pointing to a parent snapshot ... collision`.
Diagnóstico: os snapshots `0011`, `0012`, `0013` têm o **mesmo `id` (d12d60bd) e o mesmo `prevId` (0635a4db)** — a cadeia prevId→id tem 3 nós idênticos (deveria ser linear com IDs únicos). O `_journal.json` está OK (idx 0-27 sem duplicata); o problema é só nos snapshots.
Isso é o mesmo caos do FIX-100 (bloco-g) / card `drizzle-migrations-inconsistente`.

**Impacto = BLOQUEIA a onda inteira:** qualquer mudança de schema não consegue gerar migration.
- bloco-b chat-mesa: já quebrou a develop (last_inbound_at).
- bloco-a documentos: adiciona TABELA `client_documents` → vai quebrar igual.
- bloco-c fechamento: se tocar schema, idem.

## Correção proposta (NÃO executada — blast-radius alto, PENDENTE-KAIRO / bloco-g)
1. **Consertar o meta do drizzle** (escopo FIX-100/bloco-g): regenerar os snapshots `0011/0012/0013` com IDs únicos e cadeia prevId→id linear correta (cada snapshot refletindo o schema NAQUELE ponto). Validar com `db:generate` rodando limpo.
2. Depois, gerar as migrations faltantes das 3 features:
   - `0028` chat-mesa: `ALTER TABLE conversations ADD COLUMN last_inbound_at timestamptz;` + `CREATE INDEX conversations_last_inbound_at_idx`.
   - `0029` documentos: `CREATE TABLE client_documents (...)`.
   - (fechamento: conforme o que tocar no schema.)
3. Aplicar via migrate-guard (entrypoint/container — NUNCA na mão).

## Por que não corrigi agora
Mexer no `drizzle/meta` (regenerar cadeia de snapshots) à noite, sozinho, é blast-radius alto:
um erro na cadeia corrompe TODAS as migrations e o deploy. A regra de migrations do Kairo trata
isso com cuidado especial. É o escopo do bloco-g/FIX-100. Deixei a correção diagnosticada e o
caminho fechado.

## Regressão exigida
- Após o conserto: `db:generate` roda limpo (sem collision); `pnpm test:unit` verde; migrate-guard
  aplica 0028+ no container sem drift. Teste do migrate-guard (FIX-100) cobre o anti-drift.

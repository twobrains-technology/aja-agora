# Dívida de infra de teste — consolidado do QA noturno (2026-06-21)

> Achados do QA noturno (profundidade de negócio). **Nenhum é regressão de produto
> das últimas 2 semanas** — é dívida de infra/teste pré-existente. O produto e a
> suíte de regressão (Camadas 1+2: 1810+226 verde) estão sólidos. Agrupados aqui
> pro Kairo decidir lançar como bloco(s) quando quiser. Ordenados por ROI.

## 1. 🔴 Ambiente de teste de host: `.env.local` com DATABASE_URL morto
- **Sintoma:** todo teste que toca DB falha com `ENOTFOUND db.aja-feat-jornada-bevi-lance-embutido.orb.local` (workspace antigo, resíduo da migração de mac — commit `c11c4f3f`).
- **Causa:** `.env.local` tem 2 linhas `DATABASE_URL`; a 2ª (morta) vence no `loadEnvFile`.
- **Workaround usado no QA:** exportar `DATABASE_URL=postgresql://postgres:postgres@aja-pg-develop.orb.local:5432/aja_agora` antes de cada `pnpm test*`.
- **Fix (do Kairo, é .env — hook bloqueia edição automática):** remover a 2ª linha do `.env.local`, deixar só `aja-pg-develop.orb.local:5432` (ou a porta certa). **Impacto:** sem isso, pre-commit/testes de host falham por env pra ele também.

## 2. 🟡 Isolamento de teste (DB compartilhado) — bloco #1 de ROI (skill qa-noturno §4.7)
- **Sintoma:** `resolve.integration.test.ts` (FIX-42 backfill dedup) FALHA no run paralelo (`expected 0 to be 1`) mas PASSA isolado e serial. Outros integration tocam as mesmas tabelas (`contacts`, `leads`, `conversations`) sem schema/org efêmero → colisão sob concorrência.
- **Impacto:** `pnpm test:integration` é não-determinístico (flaky). Esconde/inventa falhas.
- **Fix:** cada teste de integração semeia seu schema/org efêmero (ou namespace por `worker id`). Card de referência da skill: `integration-db-isolamento-shared-db`. **Maior ROI** — destrava paralelismo seguro.

## 3. 🟡 `pnpm typecheck` — 23 erros, TODOS em arquivos de teste
- **Sintoma:** `tsc --noEmit` falha com 23 erros em 13 arquivos `*.test.ts`/`*.spec.ts` (mock de cookies incompleto nos `route.*.test.ts`; `glob` de `node:fs/promises` em `system-prompt.acentuacao.test.ts`; regex flag es2018 em `system-prompt.test.ts`; `desviouPraConsultorHumano` faltando em `jornada-judge.test.ts`; `reducedMotion` em `web-resume/same-device.spec.ts`; `formatter.moto.test.ts` tipos; `migrate-guard.test.ts` ts-expect-error unused; etc.).
- **Não bloqueia:** zero erro em código de produção; `next build` não type-checka testes (develop deploya); vitest roda via esbuild (testes verdes). Mas `tsc` não passa limpo (higiene/DX).
- **Fix:** limpar os 13 arquivos (mocks de tipo, imports). Trabalho mecânico, baixo risco, sem urgência.

## 4. 🟡 Suíte E2E (lead-capture/resume) com specs furados + flaky
- Já diagnosticado em `2026-06-21-e2e-lead-capture-furados.md`. Specs criam lead sem conversation (404 esperado), `waitForTimeout` fixo, flaky por LLM real. **Hardening do `/api/leads` (500→400) JÁ corrigido** nesta rodada (commit `15ce748`). Resto: helper `createConversation()`, isolar specs LLM-dependentes.

## 5. 🟢 Eval Camada 3 (`GATE_SEQUENCE`) desatualizado pós-FIX-53
- Já diagnosticado em `2026-06-21-eval-jornada-gate-sequence-fix53.md`. Nightly, não-bloqueante.

## 6. 🟢 Letta semantic search (archival) — 0 hits / timeout
- **Sintoma:** `letta-adapter.integration.test.ts > semantic match` retorna 0 hits; `store_memories` leva 17-18s; cleanup dá timeout 5s e 404 de agent.
- **Causa provável:** serviço `tb-letta-shared` local com embeddings lentos / índice. **Best-effort** (memória do agente; cair não derruba a app — regra global). **Não é regressão das 2 semanas** (adapter inalterado; é o Letta local).
- **Fix:** investigar config de embedding do `tb-letta-shared` (fora do produto aja-agora) ou marcar o teste como `skipIf(!LETTA_FAST)`.

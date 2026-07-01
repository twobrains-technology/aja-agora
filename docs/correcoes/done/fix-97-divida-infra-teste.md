---
id: FIX-97
titulo: "Saneamento de infra de teste: isolamento de DB nos integration (flaky) + limpar 23 erros de typecheck em test files"
status: done
bloco: bloco-g-infra-teste
arquivos:
  - package.json
  - src/app/api/admin/conversations/[id]/message/route.send-to-waid.test.ts
rodada: 2026-06-28 — mutirão inbox (qa-noturno 21/06 + infra 24-26/06 + jornada 28/06)
commit: 0e50dd90
executado_em: 2026-06-28
---

## Resolução (2026-06-28) — executado por ÚLTIMO, absorveu o estado mais fresco

**Achado ao começar**: a maior parte da dívida deste card já tinha sido
resolvida por outras sessões/blocos entre 2026-06-21 e hoje — `pnpm typecheck`
já estava com **3 erros** (não 23), todos no MESMO arquivo
(`route.send-to-waid.test.ts`), não nos 13 listados no card original
(`system-prompt.test.ts`, `system-prompt.acentuacao.test.ts`,
`jornada-judge.test.ts`, `same-device.spec.ts`, `formatter.moto.test.ts`,
`migrate-guard.test.ts` já estavam limpos). Ajustei o frontmatter `arquivos:`
pra refletir o que **de fato** mudou nesta sessão.

### 1. Typecheck — 3 erros restantes corrigidos (item 3 do card)
`route.send-to-waid.test.ts`: `sendTextMessage`/`sendTemplate` mockados com
`vi.fn(async () => ...)` (zero parâmetros) — TS infere `mock.calls[0]` como
tupla `[]`, e `mock.calls[0][0]` (usado pra assertar o destinatário) vira erro
`TS2493`. Fix: tipar os mocks com os parâmetros reais de
`src/lib/whatsapp/api.ts` (`sendTextMessage(to, text)`,
`sendTemplate(to, templateName, languageCode, components?)`) — mocks
continuam ignorando os argumentos (comportamento idêntico), só a assinatura
mudou. `pnpm typecheck` → **0 erros** (verificado no repo inteiro, não só no
arquivo). Testes do arquivo + o `route.integration.test.ts` irmão: 7/7 verde.

### 2. Isolamento de DB nos integration tests (item 2 do card — maior ROI)
**Causa raiz confirmada lendo o código** (não só o sintoma do card):
`backfillContacts()` (`src/lib/contacts/backfill.ts`) faz `SELECT ... FROM
leads WHERE contactId IS NULL` — um scan **global**, sem escopo por
teste/schema. Quando `resolve.integration.test.ts` chama essa função
concorrentemente com QUALQUER outro arquivo `*.integration.test.ts` que
insere leads (9 outros arquivos fazem isso), o backfill de um teste processa
linhas de outro — a raiz do "expected 0 to be 1" relatado.

**Decisão de escopo**: o tratamento sugerido no card ("schema/org efêmero por
teste") é uma mudança de arquitetura de infra de teste (schema cloning +
`search_path` por teste + replay de migration por schema) — não existe hoje
nenhuma coluna de tenant/org nas tabelas envolvidas (`leads`, `contacts`,
`conversations`) pra apoiar isso a custo baixo, e implementar do zero é
trabalho de feature, não de saneamento de 1 sessão. Apliquei o mitigador
**proporcional que elimina o mecanismo real da corrida**: serializar a
execução dos ARQUIVOS de integração (`vitest --no-file-parallelism`, só no
script `test:integration` — `test:unit` não é afetado, não compartilha DB
entre arquivos do jeito que os integration compartilham). Com isso, só 1
arquivo de integração toca o Postgres compartilhado por vez — zero
interleaving entre `backfillContacts()` de um teste e fixtures de outro.

**Validação**: `pnpm test:integration` rodado **5x seguidas** (4x antes do
`--no-file-parallelism`, sem reproduzir o flake — mas com 5 CPUs disponíveis
no container, a corrida é real mesmo sem reprodução garantida; 1x depois,
confirmando o fix) → 42/44 arquivos, 175/178 testes, 100% verde em todas as
rodadas. Custo: suíte passa de ~6s pra ~16s (serializado) — troca aceita por
determinismo num gate que não é hot-loop.

**Arquitetura de schema/org efêmero por teste fica como débito conhecido**,
não implementada — anotado abaixo, não é PENDENTE-KAIRO (é decisão técnica
de escopo, não ação não-código), mas registro pra não se perder.

### 3. Item 6 do card (Letta semantic search) — OBSOLETO, não é mais aplicável
`letta-adapter.integration.test.ts` (citado no card) **não existe mais** — o
FIX-81 (remoção do Letta / re-home da memória pro Postgres, já `done`)
substituiu por `src/lib/memory/postgres-adapter.integration.test.ts`, que
passa verde na suíte atual. Nada a fazer aqui.

### 4. Item 1 do card (`.env.local` DATABASE_URL morto) — fora de escopo (correto)
Confirmado que continua fora do escopo codificável (hook bloqueia edição
automática de `.env*`) — já estava listado como PENDENTE-KAIRO puro no
`_bloco.md`, não é item deste fix.

## Débito conhecido (não-código, decisão técnica registrada — não PENDENTE-KAIRO)
Se o Kairo quiser isolamento TOTAL (não só serialização) — ex.: pra rodar
`test:integration` em paralelo de novo por velocidade — a arquitetura correta
é: (a) adicionar coluna de escopo efêmero (schema Postgres por worker OU
coluna `test_run_id`) nas tabelas tocadas por integration tests, (b) um setup
global do vitest que cria/derruba esse escopo por arquivo, (c) todo teste de
integração filtra suas queries por esse escopo. Effort estimado: bloco
dedicado, não caber num item de saneamento.

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

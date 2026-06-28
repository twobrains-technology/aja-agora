---
bloco: bloco-c-infra-teste
branch: chore/saneamento-infra-teste
workspace: chore-saneamento-infra-teste
onda: 1
depends_on: []
paralelo_com: [bloco-a-funil-qualificacao, bloco-d-chat-render]
itens: [FIX-90, FIX-91, FIX-92, FIX-89]
escopo_arquivos:
  - src/app/api/leads/route.ts
  - tests/e2e/specs/lead-capture-web/ec-names-unicode.spec.ts
  - tests/e2e/utils/db.ts
  - tests/eval/jornada-aja-agora.eval.test.ts
  - scripts/migrate-guard.mjs
  - scripts/migrate-guard.test.ts
  - "(vários *.test.ts — typecheck cleanup do FIX-89)"
conflitos_esperados:
  - "FIX-89 (typecheck cleanup) toca test files variados (system-prompt.test.ts, *.acentuacao.test.ts, jornada-judge.test.ts, same-device.spec.ts, formatter.moto.test.ts, migrate-guard.test.ts). Se Bloco A/D editarem algum desses, conflito mecânico nível 2 no merge — resolver mantendo AMBAS as mudanças (cleanup de tipo + edição funcional). Por isso FIX-89 é o ÚLTIMO do bloco (absorve o estado mais fresco)."
---
# Bloco C — Saneamento de infra/teste (dívida não-produto)

Dívida técnica de teste/infra consolidada pelo QA noturno — **nenhum é regressão de
produto**; é higiene que destrava paralelismo e DX. Um pacote de saneamento pra um
dev só. PENDENTE-KAIRO puros (não-código) ficam fora e estão listados no relatório
da onda, não viram item: `.env.local` com DATABASE_URL morto (hook bloqueia edição),
recarregar quota OpenAI, verificar `__drizzle_migrations` de prod antes do deploy.

## Ordem interna
1. **FIX-90** — E2E lead-capture furados (specs criam lead sem conversation → 404) + hardening `/api/leads` (validar UUID via Zod, 500→400) + helper `createConversation()` em `tests/e2e/utils/db.ts`.
2. **FIX-91** — eval da jornada com `GATE_SEQUENCE` na ordem pré-FIX-53 (identify no fim): reordenar + ajustar o harness pra identify-cedo (nightly, não-bloqueante).
3. **FIX-92** — endurecer `migrate-guard.mjs` pra detectar drift (count de `__drizzle_migrations` vs presença real da tabela) em vez de confiar só no count.
4. **FIX-89** — saneamento amplo: isolamento de DB nos integration (schema/org efêmero por teste pra matar o flaky do `resolve.integration.test.ts`) + limpar os 23 erros de `tsc` em ~13 test files. ÚLTIMO (toca muitos test files).

## Regressão
Não há comportamento de agente aqui → **sem cassette Camada 2**. Camada 1 structural
onde fizer sentido (nova lógica de drift do migrate-guard; contrato 400 do `/api/leads`).
O critério de FIX-89 é `pnpm typecheck` limpo + `pnpm test:integration` determinístico.

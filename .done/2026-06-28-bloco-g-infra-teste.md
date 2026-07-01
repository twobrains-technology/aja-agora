---
titulo: "Bloco G — Saneamento de infra/teste (dívida não-produto)"
data: 2026-06-28
bloco: bloco-g-infra-teste
branch: chore/saneamento-infra-teste
tipo: saneamento (chore) — dívida de infra/teste consolidada pelo QA noturno
---

# Bloco G — Saneamento de infra/teste

Pacote de saneamento técnico (infra/teste), **não é feature de produto** —
nenhum comportamento visível ao usuário mudou. 4 itens, todos concluídos e
com gate verde (`pnpm typecheck` + `pnpm test:unit` + `pnpm test:integration`).

## TL;DR

- **FIX-98**: E2E de lead-capture (unicode) furado corrigido + Playwright
  passou a rodar de verdade no container do workspace (chromium nativo +
  `PW_EXECUTABLE_PATH`). O hardening `/api/leads` (500→400) **já estava
  feito** num commit anterior.
- **FIX-99**: eval da jornada (Camada 3, LLM real) reordenado pra refletir a
  ordem REAL de gates pós-FIX-53 (`identify` cedo, não no fim) — validado
  rodando o eval de verdade: 31/31, fluxoScore 0.89.
- **FIX-100**: `migrate-guard.mjs` agora detecta drift entre
  `__drizzle_migrations` e o schema real ANTES de tentar aplicar — TDD com 5
  testes novos.
- **FIX-97**: typecheck do repo → 0 erros (a maior parte da dívida do card
  já tinha sido resolvida por outras sessões); corrida real encontrada em
  `backfillContacts()` mitigada serializando `test:integration`.
- **Gate final**: `pnpm typecheck` limpo · `pnpm test:unit` 199 arquivos/2049
  testes verde · `pnpm test:integration` 42/44 arquivos, 175/178 testes
  verde (rodado 2x pra confirmar determinismo).

---

## FIX-98 — E2E lead-capture furados + hardening `/api/leads`

**Commit:** `test+fix: corrige E2E furado de lead-capture unicode + habilita
Playwright em container Alpine`

- O spec `ec-names-unicode.spec.ts` fazia `POST /api/leads` sem nunca criar a
  `conversation` — o endpoint corretamente respondia 404. Corrigido usando o
  helper `createConversation()` (já existia, não estava sendo usado).
- `waitForTimeout`/`setTimeout` fixo trocado por polling (`waitForLead`).
- Rodei o spec ANTES (5/5 falharam com 404, confirmando o diagnóstico do
  card) e DEPOIS (5/5 verdes) — de verdade, no Playwright, não só lendo
  código.
- **Infra nova**: `playwright.config.ts` ganhou suporte a
  `PW_EXECUTABLE_PATH` (gated, inerte fora do container Alpine) — sem isso
  não dava pra rodar o E2E real neste ambiente (browsers bundled do
  Playwright não rodam em musl libc).
- O hardening UUID (500→400) do card já tinha sido resolvido em `15ce748`
  com teste próprio — confirmado, nada a mudar.

## FIX-99 — Eval da jornada com ordem de gates pós-FIX-53

**Commit:** `test: reordena GATE_SEQUENCE do eval da jornada pra
identify-cedo`

- `GATE_SEQUENCE` do harness reordenado: `identify` sobe pra logo após
  `consent` (igual produção pós-FIX-53, "dados antes do valor").
- O disparo do reveal (busca real) migrou do case `identify` pro case
  `lance-embutido` no harness — espelhando `route.ts`: identify só persiste
  e avança; o reveal é a tripwire no FIM da cadeia.
- Achado lateral corrigido no mesmo arquivo: assert `/quanto tempo/` (gate
  `timeframe`, removido pelo FIX-103) estava stale.
- **Validado rodando o eval LLM real** (não só a Camada 1): 31/31 passed,
  `fluxoScore=0.89` (piso 0.85).
- Decisão de design (mecânica, sem trade-off de produto) registrada em
  `docs/correcoes/decisions/2026-06-28-bloco-g.md`.

## FIX-100 — `migrate-guard.mjs` detecta drift

**Commit:** `test+fix: migrate-guard detecta drift entre
__drizzle_migrations e o schema real`

- Nova função `detectDrift()`: cruza o `CREATE TABLE` de cada migration
  "pendente" (pelo count) com `information_schema.tables` do schema real —
  se a tabela já existe, é drift (aplicada via push/dump sem registrar no
  journal), reaplicar quebraria com `relation already exists`.
- TDD: 5 testes vistos falhar (`detectDrift is not a function`) antes da
  implementação, 13/13 verde depois.
- Smoke real contra o Postgres do workspace: zero falso-positivo em schema
  consistente.
- **PENDENTE-KAIRO** (blast radius de infra, não executado): verificar
  `__drizzle_migrations` do RDS de PROD e reconciliar antes de deployar o
  FIX-81 — ver o card em `docs/correcoes/done/fix-100-migrate-guard-hardening-drift.md`.

## FIX-97 — Typecheck + isolamento de DB nos integration tests

**Commit:** `test+fix: limpa typecheck restante + serializa
test:integration contra corrida no backfill`

- `pnpm typecheck` já estava com só 3 erros (não os 23 do card original —
  outras sessões já tinham limpo o resto). Os 3 restantes eram em
  `route.send-to-waid.test.ts` (mocks sem parâmetros gerando tupla `[]`
  inferida pelo TS) — corrigido tipando os mocks com a assinatura real.
- **Causa raiz da flakiness confirmada lendo o código**:
  `backfillContacts()` escaneia TODOS os leads sem `contactId` globalmente,
  sem escopo por teste — colide com qualquer um dos 9 outros arquivos
  integration que inserem leads.
- Mitigador aplicado: `--no-file-parallelism` só no script
  `test:integration` (não afeta `test:unit`) — elimina o mecanismo real da
  corrida sem precisar da arquitetura completa de "schema/org efêmero por
  teste" (que ficaria fora de escopo de um saneamento de 1 sessão).
- `letta-adapter.integration.test.ts` (item 6 do card) confirmado obsoleto —
  o FIX-81 já removeu o Letta.

---

## Gate final (verificado nesta sessão, container do workspace)

```
pnpm typecheck        → 0 erros
pnpm test:unit        → 199 arquivos / 2049 testes — verde
pnpm test:integration → 42/44 arquivos, 175/178 testes — verde (2 rodadas seguidas)
```

## Decisões de design tomadas

1. **FIX-99**: ordem de gates do eval determinada 100% pelo código de
   produção já existente (sem trade-off real) — registrado em
   `docs/correcoes/decisions/2026-06-28-bloco-g.md`.
2. **FIX-97**: isolamento de DB via serialização de arquivos
   (`--no-file-parallelism`), não via schema/org efêmero — decisão de
   escopo (proporcional ao saneamento vs. feature de infra de teste maior),
   registrada no próprio card em `docs/correcoes/done/fix-97-divida-infra-teste.md`.

## PENDENTE-KAIRO (não-código, blast radius de infra)

- Verificar `select count(*) from drizzle.__drizzle_migrations` no RDS de
  **PROD** vs. o idx esperado (27, antes da 0027) e reconciliar se divergir
  — ANTES de deployar o FIX-81. (FIX-100)
- `.env.local` com `DATABASE_URL` morto (2ª linha vence no `loadEnvFile`) —
  hook bloqueia edição automática de `.env*`. Fora de escopo desde o
  `_bloco.md` original.

## Débito conhecido (registrado, não bloqueante)

- Arquitetura de schema/org efêmero por teste de integração (isolamento
  TOTAL, não só serialização) fica como próximo passo se o Kairo quiser
  `test:integration` paralelo de novo por velocidade — detalhado no card do
  FIX-97.

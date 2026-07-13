# Bloco r9-2-anchor-fechamento — resumo de execução

**Branch:** `fix/r9-2-anchor-fechamento` (pushed) · **Commits:** `462edec1` (fix), `057898e` (docs)

Item único (FIX-281), root cause e correção já vinham fechados no card — sem decisão de
arquitetura em aberto. Único julgamento técnico do executor foi o nome do campo novo, e usei a
sugestão do card por já estar consistente com o resto do módulo (`originalRequestedCreditValue`).

## FIX-281 — âncora do rawCreditValue no real_offer (commit `462edec1`)

- **Bug:** o `rawCreditValue` que alimenta o aviso de divergência CDC (art. 30/37) no card do
  fechamento (`real_offer`) vinha de `valor` — variável que já é o `creditValue` da ÚLTIMA oferta
  vista (correta só pro matching da oferta, FIX-73), nunca o pedido ORIGINAL do cliente. Isso
  silenciava o aviso quando pedido≈oferta (cenário mario) e sub-representava a divergência real
  quando não (cenário madalena: comparava contra 260.173, o `creditValue` do reveal anterior, em
  vez dos 250.000 realmente pedidos).
- **Correção:** campo novo e independente `originalRequestedCreditValue?: number` em
  `StartContractInput` (`fulfillment.ts`), calculado em `buildStartContractInput`
  (`contract-input.ts`) com a MESMA precedência do hero `recommendation_card`
  (`meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax` — `runner.ts:658`).
  `startContract` agora popula `requestedCreditValue: input.originalRequestedCreditValue ??
  input.valor` (fallback gracioso pro caminho legado). O cálculo de `valor` (matching da oferta,
  FIX-73) não foi tocado.
- `closing-presentation.ts`, `route.ts` e `whatsapp/contract-capture.ts` não precisaram de
  nenhuma mudança — já consumiam `result.requestedCreditValue` corretamente; o bug estava 100%
  em QUAL valor chegava nesse campo. Confirmado com `grep -rn "requestedCreditValue" src/` antes
  e depois da mudança.

## Testes (TDD strict — RED confirmado antes de implementar)

- `contract-input.test.ts` (+3 casos): `originalRequestedCreditValue` vem de `creditClampedFrom ??
  creditMax`, NUNCA de `recommendedOffer.creditValue`, com pedido e oferta divergindo
  (250.000 vs 260.173); precedência `creditClampedFrom` > `creditMax`; fallback pra `creditMax`
  sem `creditClampedFrom`.
- `fulfillment.test.ts` (+3 casos, ponta-a-ponta via `startContract`): cenário mario (pedido
  70.000, carta final 71.043 → `requestedCreditValue` = 70.000), cenário madalena (pedido
  250.000, carta final 263.864 → `requestedCreditValue` = 250.000, nunca 260.173), e fallback pro
  `valor` de matching quando o campo novo vem ausente (caminho legado). Como o
  `MockProposalGateway` padrão gera cartas por fórmula sintética (não reproduz os números reais
  do veredito), usei uma gateway fixture local que pina o `creditValue` exato da oferta —
  isolando o teste do gerador aleatório do mock.
- `pnpm test:unit` completo: **354 arquivos / 3274 testes, 100% verde** (rodado após bootstrap
  do Postgres do workspace — ver gap abaixo).

## Gap honesto: ambiente do worktree precisou de bootstrap manual

O worktree deste bloco nasceu **sem `.env.local`** (só `.env.example`) e sem Postgres do
workspace no ar — `pnpm test:unit` falhava em 5 suítes de integração (DB) por
`password authentication failed for user "test"`, e o `pre-commit` hook (que roda a suíte)
bloqueava o commit. Confirmei via `git stash` que a falha era do ambiente, não do meu diff
(mesma falha na base `c46ff373`, sem minhas mudanças).

Resolvido programaticamente (sem pular o hook):
1. `.claude/skills/local-dev/scripts/bootstrap-workspace.sh --db-only` — gerou `.env.local` a
   partir do `.env.example` e subiu `aja-pg-r9-2-anchor-fechamento`.
2. O bootstrap falhou de início por faltar `BETTER_AUTH_SECRET`/`ADMIN_*`/`BEVI_*`/outras chaves
   no `.env.local` recém-gerado — fiz backfill dessas chaves a partir do clone principal
   (`~/code/aja-agora/.env.local`), mesmo padrão já registrado em memória de sessões anteriores.
3. `DATABASE_URL` gerado pelo bootstrap apontava pra `localhost:5433` (porta não publicada pelo
   compose — a convenção do projeto é DNS `.orb.local` sem porta no host). Corrigido pra
   `db.aja-r9-2-anchor-fechamento.orb.local:5432`.
4. `pnpm db:migrate` (com `DATABASE_URL` exportado no shell — `drizzle-kit` não lê `.env.local`
   sozinho) pra criar o schema no banco novo.

Depois disso a suíte completa (`test:unit` + pre-commit) ficou 100% verde. Não mexi em nada do
escopo do FIX-281 pra isso — foi só provisionamento de ambiente local, seguindo a convenção
`local-dev` já documentada no repo.

## Decisões do executor

- Nome do campo: usei a sugestão do card (`originalRequestedCreditValue`) — já é o nome mais
  claro e consistente com `valor`/`recommendedOffer.creditValue` no mesmo módulo.
- Nenhum ajuste fora do previsto no card em `real-offer.tsx` ou nos call-sites — já estavam
  corretos, como o card antecipava.

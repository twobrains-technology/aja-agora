# Bloco r9-3 reveal-guard — FIX-286

## Resumo

Item único, P0, achado do veredito r9pos2 (Sonnet 5, §3): o guard de tool-error/cap (FIX-262)
foi desenhado só pro cenário de REPETIÇÃO pós-reveal ("as opções que já apareceram continuam
valendo" — verdade quando `meta.revealCompleted === true`). Quando a mesma falha acontecia NO
MEIO da PRIMEIRA apresentação do turno — `search_groups`/`recommend_groups` já tinham retornado
grupos reais, mas uma 3ª tool-call (apresentação) falhava como `tool-error` — o guard assumia o
turno com essa mesma frase, uma MENTIRA nesse ponto (nada tinha aparecido ainda). Resultado real
observado: `recommendation_card`/`gate:experience` nunca disparavam em nenhum dos 9 turnos da
conversa do probe-i2-justificativa.

## Decisão de design

Ver ADR completa: [`docs/decisoes/blocos/2026-07-12-bloco-r9-3-reveal-guard.md`](../docs/decisoes/blocos/2026-07-12-bloco-r9-3-reveal-guard.md).

- **Decidi** implementar a combinação Via A + Via B que o próprio card já esboçava, **em vez de**
  levar a escolha ao `AskUserQuestion`, **porque** investigar o código (`ai-sdk.ts:
  executeRecommendGroups`) provou que a "escolha do melhor grupo" já é 100% server-computed
  (`rankGroups`, nunca a LLM) — não havia ambiguidade real de produto/UX a decidir, só uma
  confirmação técnica de que a Via A é segura. As duas vias da tabela do card não eram
  alternativas concorrentes, eram complementares (A quando há ranking real, B quando não há).
- **Decidi** materializar só o `recommendation_card` (hero), **em vez de** também montar
  `comparison_table`, **porque** o hero sozinho já resolve o P0 do veredito (nunca falta o
  reveal) sem inflar o fix com lógica de múltiplas cotas que o card não exigia (YAGNI).
- **Decidi** não disparar o gate `experience` no MESMO turno sintético (ele abre normalmente no
  turno seguinte, via `nextGate()`, já que `revealCompleted` fica `true`), **em vez de**
  replicar a avaliação completa de gates de `runner.ts` dentro de `index.ts`, **porque** isso
  seria reimplementar lógica já testada alhures (risco de divergência) só pra economizar 1 turno
  — o comportamento observável (reveal aparece, gate certo no próximo turno) é o mesmo dos
  outros early-returns já existentes desta família (`discoveryFailedThisTurn`, o próprio guard
  de tool-error).

## Implementação

- `runner.ts` — `RunAgentResult` ganha `revealGroupsById?` (antes o early-return do guard
  descartava os grupos reais já indexados no turno, devolvendo só as 2 flags booleanas).
- `recommendation-payload.ts` — novo `pickBestRankedGroup` (grupo de maior `score` entre os
  indexados, só considera entradas que passaram por `recommend_groups`) + novo
  `buildRecommendationCardFromRevealGroup` (reaproveita `coerceRecommendationPayload`, mesma
  coerção do caminho feliz — nenhum número novo inventado).
- `directives.ts` — dois builders novos: `buildFirstRevealCardIntro` (texto que acompanha o
  card materializado, Via A) e `buildFirstRevealRecoveryFallback` (D10 honesto de retry, Via B,
  zero palavra de erro técnico cru — mesma convenção do `buildDiscoveryFailedFallback`/FIX-186).
- `index.ts` — novo branch dentro do bloco `toolErrorThisTurn || toolCallCapExceededThisTurn`,
  ANTES da lógica FIX-262/266/282 existente, condicionado a `!meta.revealCompleted`: com grupo
  ranqueado → materializa o card + persiste `revealCompleted`/`recommendedOffer`/
  `recommendedAdministradora` (mesma bookkeeping do reveal feliz); sem ranking → fallback
  honesto de retry. Quando `meta.revealCompleted === true` (repetição), a lógica antiga segue
  100% intocada.

## Testes

**TDD strict, confirmado RED→GREEN:**

- Novo `index.fix-286-reveal-legitimo.integration.test.ts` — mocka o fullStream exato do
  cenário (search_groups + recommend_groups reais, 3ª tool-call vira tool-error). RED
  confirmado via `git stash` do código de produção (falhava mostrando o texto verbatim de
  `buildToolErrorRecoveryFallback`, "já apareceram", sem nenhum artifact); GREEN depois do fix
  (`recommendation_card` emitido com os dados reais do grupo, `revealCompleted` vira `true`,
  texto nunca menciona "já apareceram").
- Regressão exigida rodada explicitamente — **9/9 verdes, nenhuma regressão**:
  `runner.fix-262-tool-error-cap.integration.test.ts`,
  `index.fix-266-recuperacao-resolve.integration.test.ts`,
  `index.fix-282-honestidade-toolerror.integration.test.ts`. O cenário de repetição pós-reveal
  (`meta.revealCompleted === true`) continua usando o fallback "já apareceram" — comportamento
  correto, intocado.
- `pnpm test:unit` (container transitório, DB do workspace migrado via `drizzle-kit migrate`,
  `.env.local` com backfill de `ADMIN_PASSWORD`/`ADMIN_EMAIL`/`BETTER_AUTH_SECRET` do clone
  principal — mesmo gap de bootstrap já documentado em memória): **3303/3304 testes verdes**. A
  1 falha (`bevi-self-contract-adapter.test.ts`, timeout por `ECONNREFUSED :3000`) é flake de
  carga concorrente no container transitório, não relacionada a este fix — roda 23/23 verde em
  isolamento (arquivo não tocado por este bloco).
- Typecheck: nenhum erro novo introduzido nos arquivos tocados (`index.ts`,
  `recommendation-payload.ts`, `directives.ts`, `runner.ts`) — o único erro de `tsc --noEmit`
  em `runner.ts` (linha 448, `tool-input-error` fora do union de `part.type`) é dívida
  pré-existente, fora do meu diff, já documentada como fora do gate de merge deste projeto
  (`pnpm test:unit`, não typecheck whole-repo).
- `biome check --write` aplicado aos arquivos tocados (só formatação, sem findings de lint).

## Gaps honestos

- **Via B sem retry automático:** quando não há ranking suficiente (só `search_groups` rodou),
  o fallback é só textual — não há um retry determinístico de `recommend_groups` disparado no
  mesmo turno. O usuário precisa reagir de novo. Fica registrado no card/ADR como refinamento
  futuro, fora de escopo deste bloco.
- **Só `recommendation_card`, não `comparison_table`:** quando há múltiplos grupos ranqueados no
  índice, só o de maior score vira card — os demais não aparecem como comparativo. Decisão de
  escopo (ver ADR), não um bug.

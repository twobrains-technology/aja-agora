# ADR — Bloco r9-3 reveal-guard: guard de tool-error não pode suprimir um reveal legítimo

- **Data:** 2026-07-12
- **Branch:** `fix/r9-3-reveal-guard`
- **Item:** FIX-286 (P0, veredito r9pos2, Sonnet 5 — Funcional 4/10 MÍNIMO da rubrica)
- **Natureza:** item único, bloco isolado (onda 1, paralelo a `bloco-r9-3-consistencia-valor` e
  `bloco-r9-3-latencia-percebida` — arquivos disjuntos, nível 1).

---

## Contexto

O guard de tool-error/cap (FIX-262) foi desenhado e testado só pro cenário de REPETIÇÃO
pós-reveal (`meta.revealCompleted === true` — "as opções que já apareceram continuam valendo" é
verdade nesse caso). O veredito r9pos2 achou o turno 7 de `probe-i2-justificativa`: a MESMA ação
"Valor do bem: R$ 120.000" dispara `search_groups` (OK) → `recommend_groups` (OK, grupos reais
ranqueados) → uma 3ª tool-call (apresentação) falha como `tool-error` — e o guard assume o turno
com a frase "já apareceram", uma MENTIRA (nada tinha aparecido ainda, `revealCompleted` era
`false`). `recommendation_card`/`gate:experience` nunca disparam em nenhum dos 9 turnos da
conversa.

## A decisão em aberto

O card (`fix-286-reveal-guard-suprime-legitimo.md`) trazia 2 vias na tabela de correção:

- **Via A** — materializar o reveal server-side a partir de `revealGroupsById` (reaproveitando
  `coerceRecommendationPayload`/`coerceComparisonPayload`, mesma coerção do caminho feliz).
- **Via B** — degradar pra um D10 honesto de retry quando não há dados suficientes pra montar o
  card completo (ex.: só `search_groups` rodou, `recommend_groups` nunca chegou — sem ranking,
  não há "melhor grupo" pra materializar).

## Investigação — por que não precisou de `AskUserQuestion`

Investigando o código (`ai-sdk.ts:executeRecommendGroups`), a "escolha do melhor grupo" já é
**100% server-computed** antes mesmo do modelo chamar `present_recommendation_card`:
`recommend_groups` roda `rankGroups` (código determinístico, nunca a LLM) e devolve
`recommendations` já ordenadas com `score`/`scoreBreakdown` reais. Ou seja, quando
`recommend_groups` rodou neste turno, o "grupo recomendado" não é um julgamento do modelo — é
só o de maior `score` no índice, o mesmo dado que `present_recommendation_card` teria recebido.
Isso elimina a ambiguidade: **as duas vias não são alternativas conflitantes, são
complementares**, exatamente como o card já esboçava — Via A quando há ranking real (ganho
determinístico, sem "melhor esforço de julgamento"), Via B quando não há (`search_groups` sozinho,
sem score, não sustenta uma escolha). Não havia uma decisão de produto/UX em aberto que
justificasse `AskUserQuestion` — o próprio card já continha a resposta certa, só faltava
confirmar no código que a via A era segura (não reimplementa nenhum julgamento que hoje é do
modelo).

## Decisão

**Implementada a combinação A+B, como o card já apontava — sem necessidade de perguntar.**

### Via A (recomend_groups rodou — há ranking real)

- `runner.ts` passa a expor `revealGroupsById` no retorno do guard de tool-error/cap (antes só
  as 2 flags booleanas voltavam — o dado real já buscado no turno era descartado).
- Novo `pickBestRankedGroup` (`recommendation-payload.ts`) — grupo de maior `score` dentre os
  indexados neste turno (só considera entradas com `score`, i.e. que passaram por
  `recommend_groups`).
- Novo `buildRecommendationCardFromRevealGroup` — materializa o payload completo reaproveitando
  `coerceRecommendationPayload` (input mínimo, todos os números vêm do grupo real).
- `index.ts`: novo branch, ANTES da lógica FIX-262/266/282 existente, condicionado a
  `!meta.revealCompleted`. Emite o card + um texto honesto (`buildFirstRevealCardIntro` — NUNCA
  "já apareceram") + persiste `revealCompleted: true`/`recommendedOffer`/`recommendedAdministradora`
  (mesma bookkeeping do caminho feliz em `runner.ts`, para o gate "experience" abrir no turno
  seguinte).

### Via B (sem ranking suficiente — ex.: só `search_groups` rodou)

- Novo `buildFirstRevealRecoveryFallback` (`directives.ts`) — D10 honesto de retry, nunca afirma
  que algo "já apareceu", zero palavra de erro técnico cru (mesma convenção do
  `buildDiscoveryFailedFallback` do FIX-186).

### Escopo cortado conscientemente (YAGNI)

- Só `recommendation_card` é materializado (não `comparison_table`) — suficiente pra resolver o
  P0 do veredito (o hero nunca falta) sem inflar o fix com lógica de múltiplas cotas que o card
  não exigia.
- O gate "experience" não é disparado NO MESMO turno sintético (mesmo padrão dos outros
  early-returns desta família — `discoveryFailedThisTurn`, o próprio guard de tool-error): o
  turno termina, `revealCompleted` fica `true`, e o próximo turno do usuário já enxerga o gate
  correto via `nextGate()`. Replicar a avaliação de gates completa (`mayEvaluateGates` etc.) de
  `runner.ts` dentro de `index.ts` teria sido reimplementação arriscada de lógica já testada
  alhures, sem necessidade — o comportamento observável (reveal aparece, próximo turno pergunta
  "experience") é o mesmo.

## Consequências

- O guard de tool-error/cap (FIX-262) nunca mais mente "já apareceram" quando `revealCompleted`
  era `false` — a família FIX-262/266/282 (repetição pós-reveal) segue intocada, comportamento
  correto confirmado pelos 3 testes de regressão exigidos.
- Achado aberto pra rodada seguinte (não implementado aqui, fora de escopo): quando a Via B
  dispara (sem ranking), o retry é só textual — não há um retry DETERMINÍSTICO automático de
  `recommend_groups` no mesmo turno (o card sugeria isso como refinamento futuro). O usuário
  precisa reagir de novo pro sistema tentar a busca outra vez.

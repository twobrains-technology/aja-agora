---
id: FIX-334
titulo: "Agente fala 'score de 73%' cru — regressão contra decisão de produto (só rótulo qualitativo)"
status: done
bloco: bloco-b-reveal-web
arquivos:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/recommendation.ts
  - src/lib/agent/orchestrator/recommendation-payload.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/system-prompt.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
executado_em: 2026-07-14
---

# FIX-334 — percentual de score cru na fala

## Cenário (dossiê imóvel, web)
O agente cita um **"score de 73%"** ao justificar a recomendação.

## Root cause
Decisão de produto já registrada (FIX-7, `score-label.ts`): **nunca** mostrar o % numérico ao
usuário — só o rótulo qualitativo ("boa aderência"). A regra existe pro CARD, mas nada impede o
modelo de falar o número, porque o número chega até ele no contexto da tool.

## Correção proposta
| O quê | Onde |
|---|---|
| O score numérico **não sai** da tool pro modelo — só o rótulo (`scoreLabel`) | payload da tool de recomendação |
| Guard de compliance no sanitizer: percentual de score na fala é bloqueado (mesma família de `isTaxaContemplacaoClaim`) | `sanitizer.ts` |

## Regressão exigida
- Unit: o payload entregue ao modelo não contém `score` numérico.
- Unit: sanitizer bloqueia "score de 73%" / "73% de aderência".

## Implementação

`executeRecommendGroups` (ai-sdk.ts) parou de devolver `score`/`scoreBreakdown` (0-1 crus) no
tool-result — só `rank` (posição ordinal, 0=melhor — substitui `score` como sinal de "é o
top-1" pro código server-side) e `scoreLabel` (rótulo qualitativo, mesma `recommendationFitLabel`
do card). `recommendationSchema` (input de `present_recommendation_card`) tornou `score`/
`scoreBreakdown` opcionais — nunca foram lidos de lá mesmo (sempre ignorados pela coerção
server-side).

O CARD (recommendation_card) não perde nada: extraí `scoreGroup` (função pura, `recommendation.ts`,
refactor de `rankGroups` sem mudar comportamento) e `coerceRecommendationPayload` passou a
RECALCULAR score/scoreBreakdown a partir do grupo real + `scoringInput` (derivado de
`meta.qualifyAnswers`, novo helper `scoringInputFromMeta` em `runner.ts`, também usado pelo
fallback FIX-286 em `index.ts`) — nunca do que a LLM ecoa.

Efeito colateral tratado: a seção "Textos de recomendação" do `system-prompt.ts` instruía o
modelo a ler `scoreBreakdown`/score cru pra escolher palavras (thresholds `monthlyFit >= 0.8` etc).
Reescrevi pra basear as decisões em fatos que o modelo AINDA tem (parcela ÷ teto declarado,
`adminFeePercent` literal) e usar o `scoreLabel` pro tom geral — sem depender de números que ele
não recebe mais.

Guard novo no sanitizer (`isScorePercentageClaim`) dropa qualquer segmento que combine
"score"/"aderência"/"compatibilidade" com um percentual numérico, na mesma família de
`isTaxaContemplacaoClaim` — defesa determinística caso o modelo ainda assim cite um número
(chutado ou lembrado de contexto).

Testes: `ai-sdk.fix-334-score-cru.test.ts` (payload sem score cru), `sanitizer.test.ts` (guard
novo), mais os testes existentes de `recommendation-payload`/`recommendation`/`ai-sdk`/
`system-prompt`/`directives`/integração do reveal (FIX-286/290/297/308/325/333), todos ajustados
onde o mock usava o shape antigo (`score` em vez de `rank`) e verdes.

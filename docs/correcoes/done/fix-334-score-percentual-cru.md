---
id: FIX-334
titulo: "Agente fala 'score de 73%' cru — regressão contra decisão de produto (só rótulo qualitativo)"
status: todo
bloco: bloco-b-reveal-web
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/sanitizer.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
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

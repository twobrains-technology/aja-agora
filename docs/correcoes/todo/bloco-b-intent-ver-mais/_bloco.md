---
bloco: bloco-b-intent-ver-mais
branch: feat/intent-ver-mais
workspace: feat-intent-ver-mais
onda: 1
depends_on: []
paralelo_com: [bloco-a-governanca-agente, bloco-c-frontend-e-flaky]
itens: [FIX-183]
escopo_arquivos:
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/example-selector.ts
  - src/lib/agent/orchestrator/analyze.ts
conflitos_esperados:
  - "Disjunto do bloco-a (que toca runner.ts/tool-policy.ts/ai-sdk.ts/artifact-guard.ts). Este bloco toca turn-analyzer/qualify-state/example-selector/analyze — arquivos diferentes. Nível 1. qualify-state.ts poderia ser tocado pelo bloco-a se o design da allowlist mexer no nextGate; se isso acontecer, é overlap nível 2 mecânico (regiões diferentes) — mergeia o bloco-a primeiro."
---
# Bloco B — Intent "ver mais opções" no analyzer + roteamento

A CAUSA RAIZ do desvio da Mirella: o schema do analyzer (`turn-analyzer.ts`,
`userIntent`) só tem 6 valores e NENHUM expressa "quero ver mais do que já me
mostraram" — então "quero ver todos" caiu em `ready_to_proceed` (avançar/decidir) e
empurrou o agente pra decisão. Este bloco dá vocabulário ao NLU + roteia o novo intent.

## ⚠️ Decisão de PRODUTO gated (Bernardo)
O que "ver mais" DEVE mostrar depende do FIX-96 (hero+5+expansível), que está SEGURADO
aguardando aval do Bernardo (`docs/correcoes/todo/bloco-f-artifacts-produto/`). Sem essa
tela pronta, o bloco implementa o intent + um **comportamento default seguro** (re-apresentar
o comparativo dizendo que são todas as opções da faixa, ou resposta textual honesta) e marca
a UX final como PENDENTE-KAIRO/Bernardo. O `_prompt.md` manda perguntar via AskUserQuestion.

## Item
1. **FIX-183** — nova categoria de intent + roteamento + comportamento default seguro.

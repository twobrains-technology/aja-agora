---
bloco: bloco-recomendacao-ancora
branch: fix/recomendacao-ancora-valor-pedido
workspace: fix-recomendacao-ancora-valor-pedido
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-276]
escopo_arquivos:
  - src/lib/agent/recommendation.ts
  - src/lib/agent/tools/ai-sdk.ts
---
# Bloco — recomendação ancorada no valor pedido

1 item (FIX-276): a recomendação favorece carta mais cara que o valor pedido porque o `budget`
mensal é inventado pelo LLM e o `monthlyFitScore` (peso 0.4) premia parcela alta. Risco CDC.
Bloco isolado (não paraleliza com os blocos antigos do `todo/` — lançar/pollar/mergear escopado
com `--block bloco-recomendacao-ancora`).

---
id: FIX-261
titulo: "Hero do reveal +25% do pedido sem aviso; rawCreditValue no recommendation_card; truncamento 'Perfeito, Madal'"
status: todo
bloco: bloco-r5-fechamento-gates
arquivos: [src/components/chat/artifacts/recommendation-card.tsx, src/lib/agent/orchestrator/runner.ts, src/lib/web/adapter.ts]
rodada: 2026-07-10 rodada 5 (Fable r4, menores)
---
## Gaps (veredito r4, menores)
- hero do reveal veio +25% do pedido SEM aviso de ajuste (o aviso só está no real_offer, não no reveal).
- `rawCreditValue` falta no recommendation_card (aviso de ajuste desde o reveal).
- truncamento "Perfeito, Madal" (nome cortado numa bolha).
## Correção
- Propagar `rawCreditValue` (valor pedido) ao recommendation_card e renderizar o aviso de ajuste
  também no reveal quando a carta difere do pedido (>~15%).
- Corrigir o truncamento do nome na bolha.
## Regressão (TDD)
- recommendation_card com carta ≠ pedido → tem rawCreditValue + aviso.
- nome não truncado.

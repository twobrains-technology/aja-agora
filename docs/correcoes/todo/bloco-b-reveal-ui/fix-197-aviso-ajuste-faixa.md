---
id: FIX-197
titulo: "Aviso discreto de ajuste de faixa quando valorCarta bruto ≠ faixa pedida"
status: todo
bloco: bloco-b-reveal-ui
arquivos:
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/real-offer.tsx
rodada: "2026-07-01 · onda reveal-refino · refino spec §3.6"
---

## Palavras do operador
Refino D7 (§3.6): "exibir um aviso discreto de ajuste de crédito quando valorCarta bruto ≠ faixa pedida".

## Cenário exato
O usuário pede ~R$ 130k; a Bevi devolve cartas de R$ 300k (denominação do grupo) e a tela mostra a faixa re-simulada (~R$ 131k). A coerência existe (fechamento re-simula na faixa-alvo), mas é implícita — o usuário não sabe que a carta foi ajustada à faixa dele.

## Root cause investigado (spec §3.6)
Descoberta busca por `simulationValue` (valor do bem); fechamento re-simula na faixa (`fulfillment.ts:160`). Falta comunicar o ajuste na UI.

## Correção proposta
| O quê | Onde |
|---|---|
| Aviso discreto ("ajustamos essa carta pra sua faixa de ~R$ X") quando `valorCarta` bruto ≠ faixa; não exibir se iguais | `recommendation-card.tsx`, `real-offer.tsx` |

## Regressão exigida
- Teste de componente: aviso aparece quando faixa difere; não aparece quando iguais (cenário §7.7 do refino).

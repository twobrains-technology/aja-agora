---
id: FIX-240
titulo: "Fecho confirma carta muito acima da ancorada sem aviso (CDC art. 30)"
status: todo
bloco: bloco-r2-valor-compliance
arquivos: [src/lib/adapters/bevi/bevi-self-contract-proposal-gateway.ts, src/lib/adapters/bevi/partner-offer-mapper.ts, src/components/chat/artifacts/real-offer.tsx]
rodada: 2026-07-10 rodada 2 (Fable r1, gap P0 #2)
---

## Gap (veredito Fable §D5.1, gap #2)
Pedido 120k → recomendada ITAÚ 150.000 → no `contract-submit` a `real_offer` veio **211.258**
(parcela 5.136,66) com "Essa é a sua carta real — confere e confirma". Sem `rawCreditValue` no
payload → o aviso de ajuste (FIX-197, `real-offer.tsx:87-101`) NÃO renderiza. Oferta vinculante
(CDC art. 30) com salto silencioso de faixa. Intermitente (dependente do sweep).

## Decisão do Kairo (rodada 2): clamp + aviso
- **Clamp**: o fechamento (`bevi-self-contract-proposal-gateway`/`pickClosestOffer`) NÃO deve
  escolher carta muito acima (>~20%) da faixa ancorada pelo cliente — prefere a mais próxima do pedido.
- **Aviso obrigatório**: quando a carta real difere do valor ancorado, o `real_offer` SEMPRE
  carrega `rawCreditValue` (valor pedido) → FIX-197 renderiza o aviso de ajuste. Nunca "confere e
  confirma" silencioso.

## Regressão (TDD)
- fechamento não seleciona carta >20% acima do pedido quando há opção mais próxima.
- `real_offer` com carta ≠ pedido SEMPRE tem `rawCreditValue` → aviso renderiza (teste do componente).
- E2E: Fluxo A (120k) → fecho não pula pra 211k sem aviso.

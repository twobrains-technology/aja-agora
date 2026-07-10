---
id: FIX-231
titulo: "Guard anti-taxaContemplacao + ajustes nos cards existentes (carta em destaque)"
status: todo
bloco: bloco-cards-ui
arquivos:
  - src/components/chat/artifacts/group-card.tsx
  - src/components/chat/artifacts/comparison-table.tsx
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/contemplation-dial.tsx
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR1-guard + PR2-ajustes)
---

## Palavras do operador (handoff)
> "Remover qualquer exibição de `taxaContemplacao` como percentual. Carta de crédito em
> destaque (é o que o cliente compra). Lance médio → linha de detalhe discreta.
> recommendation-card: NÃO mostrar parcela pós-contemplação." — `docs/02`, `docs/05`

## Root cause INVESTIGADO
`taxaContemplacao` já é declarado como "não usar" no mapper (`offer-mapper.ts:38`) e a
contemplação exibida já vem de `monthlyAwardedQuotas` (contagem). Falta o teste-guard
que TRAVA regressão futura (spec `05` pede). Os cards de busca hoje não dão destaque
hierárquico à carta; `contemplation-dial.tsx` consome `likelihood` (removido pelo motor).

## Correção proposta
| O quê | Onde |
|---|---|
| Teste que FALHA se `taxaContemplacao` aparecer em qualquer payload de artifact ou string de card | novo teste em `chat/` ou `artifacts/` |
| Carta de crédito em destaque (fonte grande) + parcela abaixo + lance médio como linha de detalhe discreta ("lance médio ⌄") | `group-card.tsx`, `comparison-table.tsx` |
| recommendation-card: carta em destaque; SEM parcela pós-contemplação; nota "parcela cheia, que você paga até ser contemplado" | `recommendation-card.tsx` |
| Remover consumo de `likelihood` (motor o removeu — nível 3, ver `_bloco.md`) | `contemplation-dial.tsx` |
| Disclaimer CDC do dial fixo (rodapé, NÃO tooltip) | `contemplation-dial.tsx` |

## Regressão exigida
- teste-guard `taxaContemplacao` (falha se o campo vazar pra UI).
- snapshot/render dos cards com carta em destaque; lance médio presente mas discreto.
- recommendation-card sem `paymentAfterContemplation`.
- `contemplation-dial.tsx` renderiza sem depender de `likelihood`.

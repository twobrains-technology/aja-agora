---
id: FIX-232
titulo: "Proposta co-branded refinada (real-offer): Aja Agora + administradora, selo 0% juros"
status: todo
bloco: bloco-cards-ui
arquivos:
  - src/components/chat/artifacts/real-offer.tsx
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR10)
---

## Palavras do operador (handoff)
> "Header co-branded: Aja Agora + administradora (logo). Selo '0% de juros — você paga o
> bem, não os juros do banco'. Chips de credibilidade. Economia vs financiamento: se
> exibir, exibir COM a premissa (taxa/CET usada), via finance/pmt.ts." — `docs/02`

## Root cause / estado atual
`real-offer.tsx` existe (oferta real com `proposalId`) mas sem o header co-branded nem os
elementos de credibilidade da proposta final.

## Correção proposta
| O quê | Onde |
|---|---|
| Header co-branded Aja Agora + logo da administradora | `real-offer.tsx` |
| Carta em destaque, parcela, prazo | `real-offer.tsx` |
| Selo "0% de juros — você paga o bem, não os juros do banco" | `real-offer.tsx` |
| Chips: sem juros · fiscalizado pelo Banco Central · dados protegidos (LGPD) · acompanhamento até a contemplação | `real-offer.tsx` |
| Economia vs financiamento (se exibida) SEMPRE com a premissa (taxa/CET de `finance/pmt.ts`) — número sem premissa é promessa vaga | `real-offer.tsx` |

## Regressão exigida
- render do header co-branded + selo + chips.
- se exibir economia, a premissa (taxa/CET) aparece junto (teste-guard: economia sem premissa = falha).
- português correto em toda a copy (acentos/cedilha).

---
id: FIX-232
titulo: "Proposta co-branded refinada (real-offer): Aja Agora + administradora, selo 0% juros"
status: done
bloco: bloco-cards-ui
arquivos:
  - src/components/chat/artifacts/real-offer.tsx
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR10)
commit: f1f3efa
executado_em: 2026-07-10
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

## Execução (2026-07-10)
- Economia vs. financiamento NÃO foi implementada nesta rodada — `RealOfferPayload` não
  carrega nenhum dado de financiamento/CET; fabricar a comparação sem fonte violaria a
  própria regra que o card pede pra proteger. O guard (`real-offer.co-branded.test.tsx`)
  trava a regra pro futuro: se "economia" aparecer no texto, "CET"/"taxa" tem que
  aparecer junto.
- **Achado**: um teste pré-existente (`real-offer.test.tsx`, FIX-40) checava a
  AUSÊNCIA da palavra "contemplação" no card INTEIRO — over-scoped pro seu propósito
  real (garantir que o RÓTULO do lance médio não promete contemplação). Colidiu com o
  chip legítimo "Acompanhamento até a contemplação" desta spec. Reescopei o teste pra
  checar só a linha do lance médio, preservando a intenção original.
- Único arquivo de produto tocado: `real-offer.tsx` (conforme escopo do card).
- Commit: `f1f3efa`.
